"""Small regression cases: geometry, input validity, and source baseline identity."""
import pytest
from backend.main import AnalysisInput, combine_point_observations, resolve_analysis_points
from backend.climate import analyze
from backend.tests.test_climate import baseline, year_data


@pytest.mark.parametrize("north,east", [(17.1, 79), (18, 78.1), (17.1, 78.1)])
def test_narrow_boxes_sample_the_midpoint_in_each_narrow_dimension(north, east):
    body = AnalysisInput.model_validate({
        "location": {"name": "Test", "country": "Unspecified", "state": "", "latitude": 17, "longitude": 78, "timezone": "UTC"},
        "start_year": 2011, "end_year": 2012, "location_mode": "bounding_box",
        "bounding_box": {"south": 17, "north": north, "west": 78, "east": east},
    })
    points, _ = resolve_analysis_points(body)
    if north == 17.1:
        assert all(point.latitude == pytest.approx(17.05) for point in points)
    if east == 78.1:
        assert all(point.longitude == pytest.approx(78.05) for point in points)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1, 600, True])
def test_spatial_average_cannot_hide_invalid_wind_samples(bad):
    data = combine_point_observations([
        ([{"date": "2020-01-01", "wind_speed": bad}], 0, 1),
        ([{"date": "2020-01-01", "wind_speed": 10}], 0, 1),
    ])
    assert data[0]["wind_speed"] is None


def test_wind_uses_the_documented_1991_2020_baseline():
    observations = baseline() + [row for year in range(2011, 2021) for row in year_data(year)]
    for row in observations:
        row["wind_speed"] = 100 if row["date"] < "1991-01-01" else 10
    result = analyze(observations, 2011, 2020, "wind")
    assert result["methodology"]["baseline"] == "1991–2020"
    assert result["methodology"]["threshold_value"] == 10
