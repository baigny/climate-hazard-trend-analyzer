"""Allowlisted upstream access and year-level database caching."""
from datetime import datetime, timezone, timedelta, date
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from email.utils import parsedate_to_datetime
import logging
from backend.concurrency import KeyedLocks
import time
import httpx

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5_seamless"
WEATHER_VERSION = "daily-tmax-precip-wind-v3"
_fetch_locks = KeyedLocks()
_upstream_slots = BoundedSemaphore(1)
_next_weather_request = 0.0
_logger = logging.getLogger(__name__)


def upstream_reason(response):
    try:
        payload = response.json()
        return str(payload.get("reason", "")) if isinstance(payload, dict) else ""
    except ValueError:
        return ""


def retry_after_seconds(response):
    """Honor both Retry-After formats; allow a minute for the free API window."""
    value = response.headers.get("Retry-After", "")
    try:
        return max(1, int(value))
    except ValueError:
        try:
            return max(1, int((parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()))
        except (ValueError, TypeError, OverflowError):
            return 3600 if any(word in upstream_reason(response).lower() for word in ("daily", "hourly")) else 60


def cache_key(lat, lon, year, tz):
    return f"{lat:.4f}:{lon:.4f}:{year}:{MODEL}:{tz}:{WEATHER_VERSION}"


def fetch_batch(store, lat, lon, years, tz, client):
    """Fetch up to ten contiguous missing years with one upstream request."""
    params = {"latitude": lat, "longitude": lon, "start_date": f"{years[0]}-01-01", "end_date": f"{years[-1]}-12-31", "daily": "temperature_2m_max,precipitation_sum,wind_speed_10m_max", "temperature_unit": "celsius", "precipitation_unit": "mm", "wind_speed_unit": "kmh", "timezone": tz, "models": MODEL}
    global _next_weather_request
    with _upstream_slots:
        for attempt in range(3):
            wait = _next_weather_request - time.monotonic()
            if wait > 0:
                # Long quotas should be reported rather than occupying a worker.
                if wait > 120:
                    response = httpx.Response(429, headers={"Retry-After": str(int(wait) + 1)}, request=httpx.Request("GET", ARCHIVE_URL))
                    response.raise_for_status()
                time.sleep(wait)
            try:
                response = client.get(ARCHIVE_URL, params=params)
                # Decades of data count as many API calls. Space all locations
                # and analysis/map consumers together instead of sending bursts.
                _next_weather_request = time.monotonic() + 3 * len(years)
                if response.status_code == 429 or response.status_code >= 500:
                    delay = retry_after_seconds(response) if response.status_code == 429 else 2 ** (attempt + 1)
                    _next_weather_request = max(_next_weather_request, time.monotonic() + delay)
                    reason = upstream_reason(response)
                    _logger.warning("Weather upstream status=%s reason=%s retry_after=%s", response.status_code, str(reason)[:200], delay)
                    if response.status_code == 429 and (delay > 120 or "daily" in str(reason).lower() or "hourly" in str(reason).lower()):
                        response.raise_for_status()
                    if attempt < 2:
                        continue
                response.raise_for_status()
                payload = response.json()
                break
            except httpx.TransportError:
                if attempt == 2:
                    raise
                time.sleep(.5 * 2 ** attempt)
    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    temperatures, precipitation, wind_speeds = (
        daily.get("temperature_2m_max", []),
        daily.get("precipitation_sum", []),
        daily.get("wind_speed_10m_max", []),
    )
    units = payload.get("daily_units", {})
    if (units.get("temperature_2m_max") != "°C" or units.get("precipitation_sum") != "mm"
            or units.get("wind_speed_10m_max") != "km/h"
            or not dates or len(dates) != len(temperatures) or len(dates) != len(precipitation)
            or len(dates) != len(wind_speeds)):
        raise ValueError("Weather provider returned invalid daily data or unexpected temperature, precipitation, or wind units.")
    by_year = {year: [] for year in years}
    seen = set()
    for day, temperature, rainfall, wind in zip(dates, temperatures, precipitation, wind_speeds):
        year = date.fromisoformat(day).year
        if year not in by_year or day in seen:
            raise ValueError("Weather provider returned duplicate dates or dates outside the requested period.")
        seen.add(day)
        by_year[year].append({"date": day, "tmax": temperature, "precipitation": rainfall, "wind_speed": wind})
    if any(not records for records in by_year.values()):
        raise ValueError("Weather provider omitted a requested year.")
    fetched_at = datetime.now(timezone.utc).isoformat()
    store.put_many("weather", [(cache_key(lat, lon, year, tz), {"observations": observations, "fetched_at": fetched_at, "grid_latitude": payload.get("latitude"), "grid_longitude": payload.get("longitude"), "timezone": payload.get("timezone", tz)}) for year, observations in by_year.items()])
    return {year: store.get("weather", cache_key(lat, lon, year, tz))["observations"] for year in years}


def load_weather(store, lat, lon, start_year, end_year, tz, baseline_start=1981, baseline_end=2010):
    years = sorted(set(range(baseline_start, baseline_end + 1)) | set(range(start_year, end_year + 1)))
    # Same-location requests recheck the DB; other locations are not globally serialized.
    with _fetch_locks.hold((id(store), round(lat, 4), round(lon, 4), tz)):
        records, missing = {}, []
        for year in years:
            cached = store.get("weather", cache_key(lat, lon, year, tz))
            if cached and datetime.now(timezone.utc) - datetime.fromisoformat(cached["fetched_at"]) < timedelta(days=30):
                records[year] = cached["observations"]
            else:
                missing.append(year)
        hits = len(records)
        batches = []
        for year in missing:
            if not batches or len(batches[-1]) >= 10 or batches[-1][-1] + 1 != year:
                batches.append([])
            batches[-1].append(year)
        if batches:
            with httpx.Client(timeout=httpx.Timeout(90, connect=10), limits=httpx.Limits(max_connections=3, max_keepalive_connections=3), follow_redirects=False) as client:
                with ThreadPoolExecutor(max_workers=3) as pool:
                    for batch in pool.map(lambda batch: fetch_batch(store, lat, lon, batch, tz, client), batches):
                        records.update(batch)
    return [item for year in years for item in records[year]], hits, len(years)
