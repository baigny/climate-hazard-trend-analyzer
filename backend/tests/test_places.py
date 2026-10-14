import json

from backend.places import nearest_place


def test_nearest_place_keeps_clicked_coordinates_and_handles_dateline(tmp_path):
    (tmp_path / 'countries.json').write_text(json.dumps([{'id': 'XX', 'name': 'Example'}]))
    folder = tmp_path / 'XX'
    folder.mkdir()
    (folder / 'states.json').write_text(json.dumps([{'id': 'A', 'name': 'Region'}]))
    (folder / 'A.json').write_text(json.dumps([
        {'name': 'Dateline town', 'latitude': 0, 'longitude': 179.9},
        {'name': 'Other town', 'latitude': 0, 'longitude': 0},
    ]))
    result = nearest_place(tmp_path, 0, -179.9)
    assert result['name'] == 'Near Dateline town'
    assert result['state'] == 'Region'
    assert result['longitude'] == -179.9
    assert 22 < result['distance_km'] < 23
