import csv
from datetime import datetime, timezone
from io import StringIO

from backend.catalogs import (
    analyze_global_events,
    load_earthquakes,
    _parse_ibtracs,
)


class MemoryStore:
    def __init__(self):
        self.values = {}

    def get(self, collection, key):
        return self.values.get((collection, key))

    def put_many(self, collection, pairs):
        for key, value in pairs:
            self.values[(collection, key)] = value


def test_ibtracs_counts_each_sid_once_at_first_34_knot_point():
    fields = ["SID", "ISO_TIME", "WMO_WIND", "LAT", "LON", "NAME", "BASIN"]
    rows = [
        ["storm-1", "1999-12-30 00:00:00", "25", "10", "80", "ALPHA", "NI"],
        ["storm-1", "2000-01-02 00:00:00", "34", "11", "81", "ALPHA", "NI"],
        ["storm-1", "2000-01-03 00:00:00", "60", "12", "82", "ALPHA", "NI"],
        ["storm-1", "2000-01-04 00:00:00", "40", "13", "83", "ALPHA", "NI"],
        ["storm-2", "2000-08-01 00:00:00", "33", "15", "85", "BETA", "WP"],
    ]
    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow(fields)
    writer.writerows(rows)

    records = _parse_ibtracs(stream.getvalue().splitlines(), 2000, 2000)
    assert len(records[2000]) == 1
    event = records[2000][0]
    assert event["source_event_id"] == "storm-1"
    assert event["threshold_date"] == "2000-01-02"
    assert event["max_wind_kt"] == 60
    assert event["duration"] == 6


def test_global_earthquake_loader_deduplicates_and_caches(monkeypatch):
    import backend.catalogs as catalogs

    store = MemoryStore()
    calls = []
    monkeypatch.setattr(
        catalogs,
        "_fetch_earthquake_year",
        lambda client, year: calls.append(year) or [
            {"source_event_id": f"usgs-{year}", "event_year": year, "start": f"{year}-01-01Z"}
        ],
    )
    first = load_earthquakes(store, 2000, 2001)
    second = load_earthquakes(store, 2000, 2001)
    assert calls == [2000, 2001]
    assert first == second
    assert len({event["source_event_id"] for event in first}) == 2


def test_global_analysis_emits_annual_series_and_no_false_coverage():
    events = [
        {
            "source_event_id": "quake-1",
            "event_year": 2000,
            "start": "2000-01-01T00:00:00Z",
            "end": "2000-01-01T00:00:00Z",
            "duration": 0,
            "peak_value": 5.4,
            "magnitude": 5.4,
        },
        {
            "source_event_id": "quake-2",
            "event_year": 2002,
            "start": "2002-01-01T00:00:00Z",
            "end": "2002-01-01T00:00:00Z",
            "duration": 0,
            "peak_value": 6.1,
            "magnitude": 6.1,
        },
    ]
    result = analyze_global_events(events, 2000, 2002, "earthquake")
    assert [row["events"] for row in result["annual"]] == [1, 0, 1]
    assert all(row["coverage"] is None for row in result["annual"])
    assert result["summary"]["largest_magnitude"] == 6.1
    assert result["methodology"]["threshold_value"] == 5.0
    assert result["provenance"]["spatial_scope"].startswith("Worldwide")


def test_usgs_events_use_unique_catalog_ids_and_utc_timestamps(monkeypatch):
    import backend.catalogs as catalogs

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "features": [
                    {
                        "id": "usgs-1",
                        "properties": {"time": 946684800000, "mag": 5.2, "place": "Test"},
                        "geometry": {"coordinates": [80.0, 10.0, 12.0]},
                    },
                    {
                        "id": "usgs-1",
                        "properties": {"time": 946684800000, "mag": 5.2, "place": "Duplicate"},
                        "geometry": {"coordinates": [80.0, 10.0, 12.0]},
                    },
                ]
            }

    class Client:
        def get(self, *args, **kwargs):
            return Response()

    event_list = catalogs._fetch_earthquake_year(Client(), 2000)
    assert len(event_list) == 1
    assert event_list[0]["source_event_id"] == "usgs-1"
    assert event_list[0]["start"].endswith("Z")
    assert event_list[0]["magnitude"] == 5.2
