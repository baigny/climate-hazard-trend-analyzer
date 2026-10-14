"""Opt-in integration against an actual MongoDB, with an isolated test database."""
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from backend import main
from backend.tests.test_api import payload
from backend.tests.test_climate import baseline, year_data


@pytest.mark.skipif(not os.getenv('MONGODB_TEST_URI'), reason='Set MONGODB_TEST_URI for real MongoDB integration')
def test_mongodb_persistence_indexes_api_cache_and_exports_across_restart(monkeypatch):
    uri = os.environ['MONGODB_TEST_URI']
    database = 'climatrace_test_' + uuid4().hex
    monkeypatch.setenv('DB_BACKEND', 'mongodb')
    monkeypatch.setenv('MONGODB_URI', uri)
    monkeypatch.setenv('MONGODB_DATABASE', database)
    monkeypatch.setenv('ANALYSIS_LIMIT_PER_MINUTE', '100')
    main._buckets.clear()
    calls = []
    def weather(store, *args):
        calls.append(1)
        store.put_many('weather', [('year-a', {'temperature': 30}), ('year-b', {'temperature': 31})])
        return baseline() + [r for y in range(2011, 2021) for r in year_data(y)], 0, 40
    monkeypatch.setattr(main, 'load_weather', weather)
    cleanup = MongoClient(uri, serverSelectionTimeoutMS=5000)
    try:
        with TestClient(main.app) as client:
            assert client.get('/api/health').json()['storage'] == 'mongodb'
            response = client.post('/api/analyses?include_events=false', json=payload())
            assert response.status_code == 200
            first = response.json()
            assert not first['cache']['analysis_hit']
            assert first['duration_trend']['eligible_years'] == 0
            for collection in ('weather', 'analyses'):
                assert main.app.state.store.db[collection].index_information()['key_1']['unique']
        # New application lifespan creates a new client; no process-memory result survives.
        with TestClient(main.app) as client:
            assert main.app.state.store.get('weather', 'year-b') == {'temperature': 31}
            response = client.post('/api/analyses?include_events=false', json=payload())
            assert response.status_code == 200
            assert response.json()['cache']['analysis_hit']
            assert response.json()['id'] == first['id']
            assert len(calls) == 1
            assert client.get(f"/api/analyses/{first['id']}/events?limit=10").status_code == 200
            assert client.get(f"/api/analyses/{first['id']}/export.csv").status_code == 200
            assert client.get(f"/api/analyses/{first['id']}/export.pdf").content.startswith(b'%PDF')
    finally:
        # This name is generated above, never read from user configuration.
        cleanup.drop_database(database)
        cleanup.close()
