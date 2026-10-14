"""Check a running deployment with real historical data; no account secrets needed."""
import argparse
import json
from time import perf_counter, sleep

import httpx

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True)
parser.add_argument('--expect-persisted', action='store_true', help='Require the first request to reuse a previously stored analysis')
args = parser.parse_args()
body = {'location': {'name': 'Hyderabad', 'country': 'India', 'state': 'Telangana', 'latitude': 17.38405, 'longitude': 78.45636, 'timezone': 'Asia/Kolkata'}, 'start_year': 1990, 'end_year': 2020, 'hazard': 'heatwave'}

with httpx.Client(base_url=args.base_url.rstrip('/'), timeout=600, follow_redirects=False) as client:
    # Container start/restart can precede ASGI readiness. Retry this read-only
    # probe, never the analysis POST, while the service finishes starting.
    for attempt in range(30):
        try:
            health = client.get('/api/health', timeout=5)
            health.raise_for_status()
            break
        except httpx.HTTPError:
            if attempt == 29:
                raise
            sleep(1)
    health.raise_for_status()
    assert health.json()['storage'] == 'mongodb', 'Deployment must use the intended MongoDB backend'
    assert health.json()['locations_ready']
    frontend = client.get('/')
    frontend.raise_for_status()
    assert '<div id="root"' in frontend.text and '/assets/' in frontend.text
    started = perf_counter()
    response = client.post('/api/analyses?include_events=false', json=body)
    response.raise_for_status()
    data = response.json()
    elapsed = perf_counter() - started
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-frame-options'] == 'DENY'
    assert len(data['annual']) == 31 and data['events'] == []
    assert data['methodology']['baseline_coverage'] >= .95
    assert 'duration_trend' in data
    assert all('rolling_duration' in row and 'regression_duration' in row for row in data['annual'])
    if args.expect_persisted:
        assert data['cache']['analysis_hit'], 'Stored report was not recovered after restart'
    repeated = client.post('/api/analyses?include_events=false', json=body)
    repeated.raise_for_status()
    assert repeated.json()['cache']['analysis_hit']
    assert repeated.json()['id'] == data['id']
    events = client.get(f"/api/analyses/{data['id']}/events?offset=0&limit=10")
    events.raise_for_status()
    assert len(events.json()['items']) <= 10 and events.json()['total'] == data['event_count']
    csv = client.get(f"/api/analyses/{data['id']}/export.csv")
    csv.raise_for_status()
    assert 'rolling_duration' in csv.text and 'regression_duration' in csv.text
    pdf = client.get(f"/api/analyses/{data['id']}/export.pdf")
    pdf.raise_for_status()
    assert pdf.content.startswith(b'%PDF')
    print(json.dumps({'base_url': args.base_url, 'storage': health.json()['storage'], 'algorithm': health.json()['algorithm'], 'analysis_id': data['id'], 'seconds': round(elapsed, 3), 'cache': data['cache'], 'summary': data['summary'], 'duration_trend': data['duration_trend'], 'events': data['event_count'], 'checks': 'frontend, real analysis, duration trends, cache reuse, pagination, CSV, PDF'}, indent=2))
