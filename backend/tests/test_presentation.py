from backend.presentation import present_analysis


def test_cached_report_names_update_without_mutating_data_or_metrics():
    annual = [{"year": 2019, "events": 3}]
    cached = {
        "annual": annual,
        "insights": ["3 dry-spell drought-proxy events; high-wind proxy and river-flood proxy."],
        "warnings": [],
        "methodology": {"rule": "A river-flood proxy event.", "threshold_value": 42},
    }
    report = present_analysis(cached)
    assert report["insights"] == ["3 drought events; wind and flood."]
    assert report["methodology"]["rule"] == "A flood event."
    assert report["methodology"]["threshold_value"] == 42
    assert report["annual"] is annual
    assert "proxy" in cached["methodology"]["rule"]
