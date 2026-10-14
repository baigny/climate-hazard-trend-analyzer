"""Opt-in live integration check. Uses real weather; persists it in the selected DB."""
import json
import sys
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient
from backend.main import app

payload = {"location": {"name": "Hyderabad", "country": "India", "state": "Telangana", "latitude": 17.38405, "longitude": 78.45636, "timezone": "Asia/Kolkata"}, "start_year": 1990, "end_year": 2020}
with TestClient(app) as client:
    started = perf_counter()
    response = client.post('/api/analyses?include_events=false', json=payload)
    if response.status_code != 200:
        raise SystemExit(f"Live analysis failed: {response.status_code} {response.text}")
    data = response.json()
    initial_seconds = perf_counter() - started
    warm_started = perf_counter()
    second = client.post('/api/analyses?include_events=false', json=payload)
    cached_seconds = perf_counter() - warm_started
    assert data['events'] == []
    page = client.get(f"/api/analyses/{data['id']}/events?offset=0&limit=10").json()
    assert len(page['items']) <= 10 and page['total'] == data['event_count']
    assert second.status_code == 200 and second.json()['cache']['analysis_hit']
    assert data['methodology']['baseline_coverage'] >= .95
    assert len(data['annual']) == 31
    assert client.get(f"/api/analyses/{data['id']}/export.csv").status_code == 200
    assert client.get(f"/api/analyses/{data['id']}/export.pdf").content.startswith(b'%PDF')
    print(json.dumps({"id": data['id'], "elapsed_seconds": round(perf_counter()-started, 2), "initial_seconds": round(initial_seconds, 3), "cached_seconds": round(cached_seconds, 3), "summary": data['summary'], "trend": data['trend'], "threshold_c": data['methodology']['threshold_c'], "cache": data['cache'], "warnings": data['warnings']}, indent=2))
