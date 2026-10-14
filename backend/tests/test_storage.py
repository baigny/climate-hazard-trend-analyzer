from backend.storage import Store
from tinydb.storages import JSONStorage


def test_local_reads_parse_once_and_writes_survive_reopen(tmp_path, monkeypatch):
    monkeypatch.setenv('DB_BACKEND', 'tinydb')
    monkeypatch.setenv('LOCAL_DB_PATH', str(tmp_path / 'cache.json'))
    reads = []
    original = JSONStorage.read
    def read(storage):
        reads.append(1)
        return original(storage)
    monkeypatch.setattr(JSONStorage, 'read', read)
    store = Store()
    store.put('analyses', 'point-a', {'events': [1, 2], 'latitude': 17})
    for _ in range(5):
        value = store.get('analyses', 'point-a')
        value['events'].append(999)
        assert store.get('analyses', 'point-a')['events'] == [1, 2]
    assert len(reads) == 1
    # A second reader sees the write before the first store closes.
    second = Store()
    assert second.get('analyses', 'point-a')['latitude'] == 17
    second.close()
    store.close()


def test_weather_batch_flushes_once_and_is_durable(tmp_path, monkeypatch):
    monkeypatch.setenv('DB_BACKEND', 'tinydb')
    monkeypatch.setenv('LOCAL_DB_PATH', str(tmp_path / 'cache.json'))
    writes = []
    original = JSONStorage.write
    def write(storage, data):
        writes.append(1)
        return original(storage, data)
    monkeypatch.setattr(JSONStorage, 'write', write)
    store = Store()
    store.put_many('weather', [(str(year), {'year': year}) for year in range(2000, 2010)])
    assert len(writes) == 1
    assert store.db.storage.WRITE_CACHE_SIZE == 1
    second = Store()
    assert second.get('weather', '2009') == {'year': 2009}
    second.close()
    store.close()
