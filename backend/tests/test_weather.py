from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, RLock
import httpx
from backend import weather
from backend.concurrency import KeyedLocks
import pytest


@pytest.fixture(autouse=True)
def upstream_clock(monkeypatch):
    from types import SimpleNamespace
    clock = {"now": 0.0, "sleeps": []}
    def sleep(seconds):
        clock["sleeps"].append(seconds)
        clock["now"] += seconds
    monkeypatch.setattr(weather, "time", SimpleNamespace(monotonic=lambda: clock["now"], sleep=sleep))
    monkeypatch.setattr(weather, "_next_weather_request", 0.0)
    return clock


def test_rate_limit_waits_for_retry_after_and_then_persists(upstream_clock):
    class Store:
        def __init__(self): self.docs = {}
        def put_many(self, collection, values):
            for key, value in values: self.docs[(collection, key)] = value
        def get(self, collection, key): return self.docs.get((collection, key))
    calls = []
    class Client:
        def get(self, url, params):
            calls.append(upstream_clock["now"])
            if len(calls) == 1:
                return httpx.Response(429, headers={"Retry-After": "45"}, request=httpx.Request("GET", url))
            return httpx.Response(200, json={"daily_units": {"temperature_2m_max": "°C", "precipitation_sum": "mm", "wind_speed_10m_max": "km/h"}, "daily": {"time": ["2000-01-01"], "temperature_2m_max": [30], "precipitation_sum": [2], "wind_speed_10m_max": [20]}}, request=httpx.Request("GET", url))
    assert weather.fetch_batch(Store(), 17, 78, [2000], "UTC", Client())[2000][0]["tmax"] == 30
    assert calls == [0.0, 45.0]


def test_daily_quota_does_not_retry_or_send_other_batches(upstream_clock):
    calls = []
    class Client:
        def get(self, url, params):
            calls.append(params)
            return httpx.Response(429, json={"reason": "Daily API request limit exceeded"}, request=httpx.Request("GET", url))
    for years in ([2000], [2001]):
        with pytest.raises(httpx.HTTPStatusError):
            weather.fetch_batch(None, 17, 78, years, "UTC", Client())
    assert len(calls) == 1
    assert not upstream_clock["sleeps"]


def test_different_keys_can_work_concurrently_and_release():
    locks, entered = KeyedLocks(), Barrier(2)
    def work(key):
        with locks.hold(key):
            entered.wait(timeout=3)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(work,['a','b']))
    assert not locks.entries


def test_overlapping_weather_requests_reuse_persisted_years_and_http_pool(monkeypatch):
    class MemoryStore:
        def __init__(self): self.docs, self.lock = {}, RLock()
        def get(self, collection, key):
            with self.lock: return self.docs.get((collection,key))
        def put(self, collection, key, value):
            with self.lock: self.docs[(collection,key)] = value
        def put_many(self, collection, values):
            for key, value in values: self.put(collection, key, value)
    calls, pools = [], []
    class Client:
        def __init__(self, **kwargs): pools.append(kwargs)
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, params):
            calls.append(params['start_date'])
            years = range(int(params['start_date'][:4]), int(params['end_date'][:4]) + 1)
            days = [f'{year}-01-01' for year in years]
            return httpx.Response(200,json={'daily_units':{'temperature_2m_max':'°C','precipitation_sum':'mm','wind_speed_10m_max':'km/h'},'daily':{'time':days,'temperature_2m_max':[30] * len(days),'precipitation_sum':[2] * len(days),'wind_speed_10m_max':[20] * len(days)}},request=httpx.Request('GET',url))
    monkeypatch.setattr(weather.httpx,'Client',Client)
    store = MemoryStore()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: weather.load_weather(store,17,78,2010,2010,'Asia/Kolkata'),range(2)))
    assert len(calls) == 3 and len(set(calls)) == 3
    assert sorted(result[1] for result in results) == [0,30]
    assert all(result[0][0]["precipitation"] == 2 for result in results)
    assert len(pools) == 1  # the second request needs no upstream connection
    assert not weather._fetch_locks.entries


@pytest.mark.parametrize('days', [['2000-01-01', '2000-01-01'], ['1999-01-01'], ['2000-01-01']])
def test_bad_batched_response_is_not_persisted(days):
    class Store:
        def put(self, *args):
            pytest.fail('Invalid upstream response must not enter the weather cache')
    class Client:
        def get(self, url, params):
            return httpx.Response(200, json={'daily_units': {'temperature_2m_max': '°C', 'precipitation_sum': 'mm', 'wind_speed_10m_max': 'km/h'}, 'daily': {'time': days, 'temperature_2m_max': [30] * len(days), 'precipitation_sum': [2] * len(days), 'wind_speed_10m_max': [20] * len(days)}}, request=httpx.Request('GET', url))
    with pytest.raises(ValueError):
        weather.fetch_batch(Store(), 17, 78, [2000, 2001], 'Asia/Kolkata', Client())


def test_weather_only_refreshes_expired_years_and_separates_coordinates_timezone_model(monkeypatch):
    from datetime import datetime, timezone, timedelta
    class Store:
        def __init__(self): self.docs = {}
        def get(self, collection, key): return self.docs.get((collection, key))
        def put_many(self, collection, values):
            for key, value in values: self.docs[(collection, key)] = value
    store, calls = Store(), []
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, params):
            calls.append(params.copy())
            days = [f'{year}-01-01' for year in range(int(params['start_date'][:4]), int(params['end_date'][:4]) + 1)]
            return httpx.Response(200, json={'daily_units': {'temperature_2m_max': '°C', 'precipitation_sum': 'mm', 'wind_speed_10m_max': 'km/h'}, 'daily': {'time': days, 'temperature_2m_max': [30] * len(days), 'precipitation_sum': [2] * len(days), 'wind_speed_10m_max': [20] * len(days)}}, request=httpx.Request('GET', url))
    monkeypatch.setattr(weather.httpx, 'Client', Client)
    weather.load_weather(store, 17, 78, 2010, 2010, 'UTC')
    assert len(calls) == 3
    stale = store.docs[('weather', weather.cache_key(17, 78, 2000, 'UTC'))]
    stale['fetched_at'] = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    _, hits, total = weather.load_weather(store, 17, 78, 2010, 2010, 'UTC')
    assert (hits, total) == (29, 30)
    assert len(calls) == 4 and calls[-1]['start_date'] == '2000-01-01' and calls[-1]['end_date'] == '2000-12-31'
    for lat, lon, tz in [(18, 78, 'UTC'), (17, 79, 'UTC'), (17, 78, 'Asia/Kolkata')]:
        _, hits, _ = weather.load_weather(store, lat, lon, 2010, 2010, tz)
        assert hits == 0
    monkeypatch.setattr(weather, 'MODEL', 'test-new-model')
    _, hits, _ = weather.load_weather(store, 17, 78, 2010, 2010, 'UTC')
    assert hits == 0
