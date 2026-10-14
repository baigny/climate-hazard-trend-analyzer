import pytest
from fastapi.testclient import TestClient
from backend import main
from backend.tests.test_climate import baseline, precipitation_data, year_data


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_BACKEND", "tinydb")
    monkeypatch.setenv("LOCAL_DB_PATH", str(tmp_path/"test.json"))
    monkeypatch.setenv("ANALYSIS_LIMIT_PER_MINUTE", "100")
    main._buckets.clear()
    with TestClient(main.app) as value:
        yield value


def payload():
    return {"location":{"name":"Hyderabad","country":"India","state":"Telangana","latitude":17.385,"longitude":78.4867,"timezone":"Asia/Kolkata"},"start_year":2011,"end_year":2020}


@pytest.mark.parametrize("query,expected", [("sao paulo", "São Paulo"), ("MUNCHEN", "München"), ("東京", "東京")])
def test_worldwide_city_search_preserves_names_and_matches_accents(client, monkeypatch, query, expected):
    monkeypatch.setattr(main, "read_list", lambda _: [
        {"id": str(index), "name": name, "latitude": 0, "longitude": 0}
        for index, name in enumerate(["São Paulo", "München", "東京"])
    ])
    response = client.get("/api/locations/BR/SP/cities", params={"q": query})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["name"] == expected


def test_invalid_inputs(client):
    body = payload()
    body["location"]["latitude"] = 100
    assert client.post('/api/analyses',json=body).status_code == 422
    body = payload(); body["start_year"] = 2022; body["end_year"] = 2020
    assert client.post('/api/analyses',json=body).status_code == 422
    assert client.get('/api/locations/..%2F/states').status_code in (404,422)
    assert client.get('/api/analyses/not-an-id').status_code == 422
    body = payload(); body["hazard"] = "wildfire"
    assert client.post('/api/analyses', json=body).status_code == 422


def test_coordinate_list_and_bounding_box_average_sampled_weather(client, monkeypatch):
    data = baseline() + [row for year in (2011, 2012) for row in year_data(year)]
    requests = []

    def weather(store, latitude, longitude, start_year, end_year, timezone):
        requests.append((latitude, longitude))
        return data, 0, 32

    monkeypatch.setattr(main, "load_weather", weather)
    body = payload()
    body.update(
        location_mode="list",
        locations=[
            {**body["location"], "name": "Point 1", "latitude": 17.0, "longitude": 78.0},
            {**body["location"], "name": "Point 2", "latitude": 18.0, "longitude": 79.0},
        ],
    )
    response = client.post("/api/analyses?include_events=false", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["parameters"]["location_mode"] == "list"
    assert len(requests) == 2
    assert "Arithmetic mean of 2" in result["provenance"]["spatial_scope"]

    requests.clear()
    body = payload()
    body.update(
        location_mode="bounding_box",
        bounding_box={"south": 17.0, "north": 18.0, "west": 78.0, "east": 79.0},
    )
    response = client.post("/api/analyses?include_events=false", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["parameters"]["location"]["name"] == "Bounding box"
    assert len(requests) == 9
    assert "Arithmetic mean of 9" in result["provenance"]["spatial_scope"]


@pytest.mark.parametrize(
    "location_mode,extra",
    [
        (
            "list",
            {
                "locations": [
                    {"name": "One", "country": "India", "state": "", "latitude": 17, "longitude": 78, "timezone": "auto"},
                    {"name": "Duplicate", "country": "India", "state": "", "latitude": 17.00001, "longitude": 78, "timezone": "auto"},
                ],
            },
        ),
        ("bounding_box", {"bounding_box": {"south": 19, "north": 18, "west": 78, "east": 79}}),
    ],
)
def test_invalid_location_scopes_are_rejected(client, location_mode, extra):
    body = payload()
    body.update(location_mode=location_mode, **extra)
    assert client.post("/api/analyses", json=body).status_code == 422


@pytest.mark.parametrize("mode", ["list", "bounding_box"])
def test_series_uses_all_selected_samples_and_counts_cached_sample_years(client, monkeypatch, mode):
    from datetime import date, timedelta
    body = payload()
    body.update(start_year=2020, end_year=2020, location_mode=mode)
    if mode == "list":
        body["locations"] = [
            {**body["location"], "latitude": lat, "longitude": lon}
            for lat, lon in [(17, 78), (18, 79)]
        ]
    else:
        body["bounding_box"] = {"south": 17, "north": 18, "west": 78, "east": 79}
    calls = []
    def weather(store, lat, lon, *args):
        calls.append((lat, lon))
        rows = [{"date": (date(2020, 1, 1) + timedelta(days=i)).isoformat(),
                 "precipitation": 2 + 4 * (lat - 17)} for i in range(366)]
        return rows, 1, 1
    monkeypatch.setattr(main, "load_weather", weather)
    selection = main.AnalysisInput.model_validate(body)
    _, hits, total = main.load_selection_observations(client.app.state.store, selection)
    expected_points = 2 if mode == "list" else 9
    assert hits == total == expected_points
    calls.clear()
    key = "b" * 24
    client.app.state.store.put("analyses", key, {"parameters": body})
    response = client.get(f"/api/analyses/{key}/series?variable=rainfall&resolution=monthly")
    assert response.status_code == 200, response.text
    assert len(calls) == expected_points
    assert len(set(calls)) == expected_points
    assert response.json()["points"][0] == {"period": "January", "value": 124, "coverage": 1}
    assert client.get(f"/api/analyses/{key}/series?variable=discharge").status_code == 422


def test_analysis_cache_retrieval_and_exports(client, monkeypatch):
    calls = []
    def weather(*args):
        calls.append(1)
        return baseline() + [r for y in range(2011,2021) for r in year_data(y)], 0, 40
    monkeypatch.setattr(main,"load_weather",weather)
    response = client.post('/api/analyses',json=payload())
    assert response.status_code == 200, response.text
    data = response.json(); key = data["id"]
    assert not data["cache"]["analysis_hit"]
    assert client.post('/api/analyses',json=payload()).json()["cache"]["analysis_hit"]
    assert len(calls) == 1
    compact = client.post('/api/analyses?include_events=false', json=payload()).json()
    assert compact['events'] == []
    assert compact['event_count'] == len(data['events'])
    assert compact['summary'] == data['summary']
    page = client.get(f'/api/analyses/{key}/events?offset=1&limit=2').json()
    assert page['items'] == data['events'][1:3]
    assert page['total'] == len(data['events'])
    assert client.get(f'/api/analyses/{key}/events?offset=-1').status_code == 422
    assert client.get(f'/api/analyses/{key}').json()["id"] == key
    csv = client.get(f'/api/analyses/{key}/export.csv')
    assert csv.status_code == 200 and 'heatwave_days' in csv.text and '2011' in csv.text
    pdf = client.get(f'/api/analyses/{key}/export.pdf')
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')


def test_precipitation_hazard_analysis_and_map_series(client, monkeypatch):
    data = precipitation_data(1981, 2020)
    for item in data:
        if item["date"].startswith("2011-05-"):
            day = int(item["date"][-2:])
            if 10 <= day <= 12:
                item["precipitation"] = 20

    def weather(*args):
        return data, 0, 40

    monkeypatch.setattr(main, "load_weather", weather)
    body = payload()
    body["hazard"] = "heavy_rainfall"
    response = client.post("/api/analyses?include_events=false", json=body)
    assert response.status_code == 200, response.text
    analysis = response.json()
    assert analysis["summary"]["total_events"] == 1
    assert analysis["annual"][0]["hazard_days"] == 3
    assert "heatwave_days" not in analysis["annual"][0]
    assert analysis["methodology"]["threshold_unit"] == "mm/day"
    series = client.get(f"/api/analyses/{analysis['id']}/series?variable=rainfall&resolution=monthly")
    assert series.status_code == 200
    assert series.json()["points"][4] == {"period": "May", "value": 67.4, "coverage": 1}
    assert len(series.json()["points"]) == 12
    year_series = client.get(f"/api/analyses/{analysis['id']}/series?variable=rainfall&resolution=monthly&year=2011")
    assert year_series.status_code == 200
    assert year_series.json()["points"][4] == {
        "period": "May 2011",
        "value": round(sum(item["precipitation"] for item in data if item["date"].startswith("2011-05-")), 2),
        "coverage": 1,
    }
    assert year_series.json()["points"][4]["value"] != series.json()["points"][4]["value"]
    half = client.get(f"/api/analyses/{analysis['id']}/series?variable=rainfall&resolution=halfyearly&year=2012").json()
    assert half["points"][0]["period"] == "First half (Jan–Jun) 2012"
    decade = client.get(f"/api/analyses/{analysis['id']}/series?variable=rainfall&resolution=yearly&decade=2010").json()
    assert [point["period"] for point in decade["points"]] == [str(year) for year in range(2011, 2020)]
    assert client.get(f"/api/analyses/{analysis['id']}/series?year=2010").status_code == 422
    assert client.get(f"/api/analyses/{analysis['id']}/series?decade=2000").status_code == 422
    assert client.get(f"/api/analyses/{analysis['id']}/series?resolution=biweekly").status_code == 422
    assert client.get(f"/api/analyses/{analysis['id']}/series?resolution=century").status_code == 422
    report = client.get(f"/api/analyses/{analysis['id']}/export.pdf")
    assert report.status_code == 200 and report.content.startswith(b"%PDF")


@pytest.mark.parametrize("hazard", ["cyclone", "earthquake"])
def test_worldwide_hazards_use_catalog_and_ignore_selected_location(client, monkeypatch, hazard):
    calls = []
    events = [{
        "source_event_id": "global-event-1",
        "event_year": 2015,
        "start": "2015-01-01T00:00:00Z",
        "end": "2015-01-03T00:00:00Z",
        "duration": 3 if hazard == "cyclone" else 0,
        "peak_value": 60 if hazard == "cyclone" else 5.5,
        "mean_intensity": 60 if hazard == "cyclone" else 5.5,
        "max_wind_kt": 60,
        "magnitude": 5.5,
        "boundary_clipped": False,
    }]
    monkeypatch.setattr(main, "load_global_events", lambda *args: calls.append(args[1:]) or events)
    monkeypatch.setattr(main, "load_weather", lambda *args: pytest.fail("global hazards must not load point weather"))
    body = payload()
    body["start_year"], body["end_year"], body["hazard"] = 2015, 2017, hazard
    first = client.post("/api/analyses?include_events=false", json=body)
    assert first.status_code == 200, first.text
    data = first.json()
    assert data["parameters"]["location"]["name"] == "Worldwide"
    assert data["provenance"]["spatial_scope"].startswith("Worldwide")
    assert data["events"] == []
    assert data["event_count"] == 1
    assert client.get(f"/api/analyses/{data['id']}/series").status_code == 422
    assert data["annual"][0]["events"] == 1
    assert data["annual"][0]["coverage"] is None
    assert client.post("/api/analyses", json=body).json()["cache"]["analysis_hit"]
    body["location"]["name"] = "A different place"
    assert client.post("/api/analyses", json=body).json()["cache"]["analysis_hit"]
    assert len(calls) == 1


def test_global_events_are_stored_in_bounded_pages(client, monkeypatch):
    records = [
        {
            "source_event_id": f"earthquake-{i}",
            "event_year": 2015,
            "start": f"2015-01-01T00:{i // 60:02d}:{i % 60:02d}Z",
            "end": f"2015-01-01T00:{i // 60:02d}:{i % 60:02d}Z",
            "duration": 0,
            "peak_value": 5.1,
            "mean_intensity": 5.1,
            "magnitude": 5.1,
            "place": "Test location",
            "latitude": 1,
            "longitude": 2,
            "depth_km": 3,
            "boundary_clipped": False,
        }
        for i in range(601)
    ]
    monkeypatch.setattr(main, "load_global_events", lambda *args: records)
    body = payload()
    body["start_year"], body["end_year"], body["hazard"] = 2015, 2015, "earthquake"
    response = client.post("/api/analyses?include_events=false", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    stored = client.app.state.store.get("analyses", result["id"])
    assert "events" not in stored
    page = client.get(f"/api/analyses/{result['id']}/events?offset=249&limit=3")
    assert page.status_code == 200
    assert [item["source_event_id"] for item in page.json()["items"]] == [
        "earthquake-249",
        "earthquake-250",
        "earthquake-251",
    ]
    assert page.json()["total"] == 601
    assert client.get(f"/api/analyses/{result['id']}/events?offset=601").json()["items"] == []


def test_upstream_failure_is_actionable(client, monkeypatch):
    import httpx
    def fail(*args): raise httpx.ConnectError('internal upstream details')
    monkeypatch.setattr(main,"load_weather",fail)
    response = client.post('/api/analyses',json=payload())
    assert response.status_code == 504
    assert 'internal upstream' not in response.text


def test_rate_limit(client, monkeypatch):
    monkeypatch.setenv('ANALYSIS_LIMIT_PER_MINUTE','1')
    client.post('/api/analyses',json={})
    response = client.post('/api/analyses',json={})
    assert response.status_code == 429
    assert response.headers['retry-after'] == '60'


def test_body_origin_and_host_guards(client):
    response = client.post('/api/analyses', content=iter([b' '*9000,b' '*9000]), headers={'Content-Type':'application/json'})
    assert response.status_code == 413
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert client.post('/api/analyses',content='{}',headers={'Content-Type':'text/plain'}).status_code == 415
    assert client.post('/api/analyses',json=payload(),headers={'Origin':'https://untrusted.example'}).status_code == 403
    assert client.get('/api/health',headers={'Host':'untrusted.example'}).status_code == 400
    response = client.get('/api/locations/countries')
    assert response.headers['cache-control'] == 'public, max-age=86400'
    assert response.headers['x-frame-options'] == 'DENY'
    assert response.headers['content-encoding'] == 'gzip'
    body = payload(); body['location']['name'] = '\u0000invalid'
    assert client.post('/api/analyses',json=body).status_code == 422
    body = payload(); body['extra'] = 'ignored?'
    assert client.post('/api/analyses',json=body).status_code == 422


def test_concurrent_identical_analyses_only_compute_once(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from time import sleep
    calls, start = [], Barrier(4)
    def weather(*args):
        calls.append(1)
        sleep(.1)
        return baseline() + [r for y in range(2011,2021) for r in year_data(y)], 0, 40
    monkeypatch.setattr(main,'load_weather',weather)
    def request(_):
        start.wait(timeout=5)
        return client.post('/api/analyses',json=payload())
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(request,range(4)))
    assert all(response.status_code == 200 for response in responses)
    assert len(calls) == 1
    assert sum(response.json()['cache']['analysis_hit'] for response in responses) == 3
    assert not main._analysis_locks.entries


@pytest.mark.parametrize('change', ['latitude', 'longitude', 'range', 'timezone', 'algorithm', 'model'])
def test_analysis_cache_separates_inputs_and_calculation_versions(client, monkeypatch, change):
    calls = []
    def weather(*args):
        calls.append(args[1:])
        return baseline() + [r for y in range(2011, 2021) for r in year_data(y)], 0, 40
    monkeypatch.setattr(main, 'load_weather', weather)
    first = client.post('/api/analyses', json=payload()).json()
    body = payload()
    if change in ('latitude', 'longitude'):
        body['location'][change] += 1
    elif change == 'range':
        body['start_year'] = 2012
    elif change == 'timezone':
        body['location']['timezone'] = 'UTC'
    elif change == 'algorithm':
        monkeypatch.setattr(main, 'ALGORITHM_VERSION', 'test-next-algorithm')
    else:
        monkeypatch.setattr(main, 'MODEL', 'test-next-model')
    second_response = client.post('/api/analyses', json=body)
    assert second_response.status_code == 200
    second = second_response.json()
    assert second['id'] != first['id']
    assert not second['cache']['analysis_hit']
    assert len(calls) == 2
    assert second['parameters']['location'] == body['location']
    assert client.post('/api/analyses', json=body).json()['cache']['analysis_hit']
    assert len(calls) == 2


def test_expired_analysis_recalculates(client, monkeypatch):
    from datetime import datetime, timezone, timedelta
    calls = []
    def weather(*args):
        calls.append(1)
        return baseline() + [r for y in range(2011, 2021) for r in year_data(y)], 0, 40
    monkeypatch.setattr(main, 'load_weather', weather)
    first = client.post('/api/analyses', json=payload()).json()
    first['created_at'] = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    client.app.state.store.put('analyses', first['id'], first)
    response = client.post('/api/analyses', json=payload())
    assert response.status_code == 200
    assert not response.json()['cache']['analysis_hit']
    assert len(calls) == 2
