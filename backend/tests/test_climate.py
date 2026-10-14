from datetime import date, timedelta
import pytest
from backend.climate import analyze, detect_events, map_series, normalize


def days(start, values):
    return {date.fromisoformat(start) + timedelta(days=i): value for i, value in enumerate(values)}


@pytest.mark.parametrize("values,expected", [([30,31],0), ([30,31,32],1), ([30,31,32,33],1), ([30,30,30,20,31,31,31],2), ([30,30,None,30,30],0), ([25,25,25],0)])
def test_runs(values, expected):
    records = days("2020-01-01", values)
    result = detect_events(records, 25, min(records), max(records))
    assert len(result) == expected
    if len(values) == 4:
        assert result[0]["duration"] == 4


def test_absent_day_breaks_event():
    records = days("2020-01-01", [30]*5)
    del records[date(2020,1,3)]
    assert detect_events(records, 25, date(2020,1,1), date(2020,1,5)) == []


def baseline():
    first, last = date(1981,1,1), date(2010,12,31)
    return [{"date": (first+timedelta(days=i)).isoformat(), "tmax": 20} for i in range((last-first).days+1)]


def year_data(year, value=20):
    first, last = date(year,1,1), date(year,12,31)
    return [{"date": (first+timedelta(days=i)).isoformat(), "tmax":value} for i in range((last-first).days+1)]


def test_cross_year_event_and_leap_year():
    data = baseline() + year_data(2019) + year_data(2020)
    for row in data:
        if "2019-12-30" <= row["date"] <= "2020-01-02":
            row["tmax"] = 30
    result = analyze(data,2019,2020)
    assert result["summary"]["total_events"] == 1
    assert result["annual"][0]["events"] == 1
    assert result["annual"][1]["events"] == 0
    assert [r["heatwave_days"] for r in result["annual"]] == [2,2]
    assert result["annual"][1]["coverage"] == 1
    assert not result["events"][0]["boundary_clipped"]


def test_baseline_missing_year_rejected():
    with pytest.raises(ValueError, match="Baseline year"):
        analyze([r for r in baseline() if not r["date"].startswith('2000')], 1990,2000)


def test_no_events_zero_comparison_and_constant_regression():
    data = baseline() + [r for y in range(2011,2021) for r in year_data(y)]
    result = analyze(data,2011,2020)
    assert result["comparison"]["percent"] is None
    assert result["summary"]["total_events"] == 0
    assert result["trend"]["slope_per_decade"] == 0
    assert result["annual"][3]["rolling_events"] is None
    assert result["annual"][4]["rolling_events"] == 0
    assert result["duration_trend"]["slope_per_decade"] is None
    assert result["duration_trend"]["eligible_years"] == 0
    assert all(r['rolling_duration'] is None and r['regression_duration'] is None for r in result['annual'])


def test_incomplete_year_excluded_and_rolling_not_bridged():
    data = baseline() + [r for y in range(2011,2021) for r in year_data(y) if not (y == 2015 and r["date"][5:7] == '02')]
    result = analyze(data,2011,2020)
    assert result["trend"]["eligible_years"] == 9
    assert result["comparison"] is None
    assert result["annual"][8]["rolling_events"] is None
    assert result["annual"][9]["rolling_events"] == 0


def test_normalization_rejects_conflicts_and_preserves_missing():
    with pytest.raises(ValueError, match="Conflicting"):
        normalize([{"date":"2020-01-01","tmax":20},{"date":"2020-01-01","tmax":30}])
    records, invalid = normalize([{"date":"2020-01-01","tmax":90},{"date":"2020-01-02","tmax":None}])
    assert list(records.values()) == [None,None]
    assert invalid == 1


def duration_data():
    data = baseline()
    for year, duration in [(2011, 3), (2012, 4), (2013, 0), (2014, 6), (2015, 7)]:
        rows = year_data(year)
        for row in rows[150:150 + duration]:
            row['tmax'] = 30
        data.extend(rows)
    return data


def test_duration_trend_excludes_no_event_years_and_pools_complete_windows():
    result = analyze(duration_data(), 2011, 2015)
    assert result['duration_trend']['slope_per_decade'] == 10
    assert result['duration_trend']['r_squared'] == 1
    assert result['duration_trend']['eligible_years'] == 4
    assert [r['regression_duration'] for r in result['annual']] == [3, 4, None, 6, 7]
    assert [r['rolling_duration'] for r in result['annual']] == [None, None, None, None, 5]
    assert any('days per decade' in insight for insight in result['insights'])


def test_duration_rolling_does_not_bridge_inadequate_year_and_short_fit_is_undefined():
    data = [r for r in duration_data() if not r['date'].startswith('2014-02')]
    result = analyze(data, 2011, 2015)
    assert result['annual'][3]['regression_duration'] is None
    assert result['annual'][4]['rolling_duration'] is None
    assert result['duration_trend']['eligible_years'] == 3
    short = analyze(duration_data(), 2011, 2013)
    assert short['duration_trend']['slope_per_decade'] is None
    assert all(r['regression_duration'] is None for r in short['annual'])


def precipitation_data(start_year, end_year, baseline_value=2):
    observations = []
    for year in range(start_year, end_year + 1):
        observations.extend(
            {"date": (date(year, 1, 1) + timedelta(days=index)).isoformat(),
             "tmax": 20, "precipitation": baseline_value}
            for index in range((date(year + 1, 1, 1) - date(year, 1, 1)).days)
        )
    return observations


def test_heavy_rainfall_uses_wet_day_percentile_and_counts_extreme_days():
    data = precipitation_data(1981, 2013)
    for item in data:
        if item["date"].startswith("2011-05-"):
            day = int(item["date"][-2:])
            if 10 <= day <= 12:
                item["precipitation"] = 20
    result = analyze(data, 2011, 2013, "heavy_rainfall")
    assert result["methodology"]["threshold_unit"] == "mm/day"
    assert result["methodology"]["percentile"] == 95
    assert result["summary"]["total_events"] == 1
    assert result["annual"][0]["hazard_days"] == 3
    assert result["events"][0]["duration"] == 3


def test_drought_proxy_requires_ten_consecutive_dry_days():
    data = precipitation_data(1981, 2013, baseline_value=0.5)
    for item in data:
        year = int(item["date"][:4])
        if 2011 <= year <= 2013:
            item["precipitation"] = 2
        if item["date"].startswith("2011-06-"):
            day = int(item["date"][-2:])
            if 1 <= day <= 12:
                item["precipitation"] = 0
    result = analyze(data, 2011, 2013, "drought")
    assert result["methodology"]["minimum_days"] == 10
    assert result["summary"]["total_events"] == 1
    assert result["annual"][0]["hazard_days"] == 12
    assert result["annual"][0]["mean_intensity"] == 1
    assert "not a comprehensive drought diagnosis" in result["methodology"]["limitations"]


def test_map_series_supports_climatological_periods_and_valid_coverage():
    data = [
        {
            "date": (date(2020, 1, 1) + timedelta(days=index)).isoformat(),
            "tmax": 20,
            "precipitation": 2,
            "wind_speed": 10,
            "discharge": 100,
        }
        for index in range(366)
    ]
    monthly = map_series(data, 2020, 2020, "rainfall", "monthly")
    quarterly = map_series(data, 2020, 2020, "temperature", "quarterly")
    halfyearly = map_series(data, 2020, 2020, "wind", "halfyearly")
    yearly = map_series(data, 2020, 2020, "dry_days", "yearly")
    decades = map_series(data, 2020, 2020, "rainfall", "decades")
    discharge = map_series(data, 2020, 2020, "discharge", "yearly")
    assert len(monthly["points"]) == 12
    assert monthly["points"][0] == {"period": "January", "value": 62, "coverage": 1}
    assert len(quarterly["points"]) == 4
    assert quarterly["points"][0] == {"period": "Q1", "value": 20, "coverage": 1}
    assert len(halfyearly["points"]) == 2
    assert halfyearly["points"][0] == {"period": "First half (Jan–Jun)", "value": 10, "coverage": 1}
    assert yearly["points"][0] == {"period": "2020", "value": 0, "coverage": 1}
    assert decades["points"][0] == {"period": "2020–2020", "value": 732, "coverage": 1}
    assert discharge["points"][0]["value"] == 100


def test_map_series_nulls_periods_below_coverage_threshold():
    data = [{"date": "2020-01-01", "tmax": 20, "precipitation": 3}]
    result = map_series(data, 2020, 2020, "temperature", "monthly")
    assert result["points"][0] == {"period": "January", "value": None, "coverage": 0.0323}
