"""Spatial sampling and arithmetic means. No network or database operations."""
import math
from backend.schemas import Location

def resolve_analysis_points(body):
    if body.location_mode == "list":
        return body.locations, body.location
    if body.location_mode == "bounding_box":
        box = body.bounding_box
        lat_steps = min(3, max(1, int((box.north - box.south) / 0.25) + 1))
        lon_steps = min(3, max(1, int((box.east - box.west) / 0.25) + 1))
        latitudes = (
            [(box.south + box.north) / 2]
            if lat_steps == 1
            else [box.south + (box.north - box.south) * i / (lat_steps - 1) for i in range(lat_steps)]
        )
        longitudes = (
            [(box.west + box.east) / 2]
            if lon_steps == 1
            else [box.west + (box.east - box.west) * i / (lon_steps - 1) for i in range(lon_steps)]
        )
        points = [
            Location(
                name=f"Area sample {i + 1}",
                country=body.location.country,
                state="",
                latitude=lat,
                longitude=lon,
                timezone=body.location.timezone,
            )
            for i, (lat, lon) in enumerate(
                (lat, lon) for lat in latitudes for lon in longitudes
            )
        ]
        center = Location(
            name="Bounding box",
            country=body.location.country,
            state="",
            latitude=(box.south + box.north) / 2,
            longitude=(box.west + box.east) / 2,
            timezone=body.location.timezone,
        )
        return points, center
    return [body.location], body.location


def combine_point_observations(series):
    if len(series) == 1:
        return series[0][0]
    by_point = [
        {item["date"]: item for item in observations}
        for observations, _, _ in series
    ]
    days = sorted(set.intersection(*(set(point) for point in by_point)))
    fields = {"tmax": (-90, 65), "precipitation": (0, 2000), "wind_speed": (0, 500), "discharge": (0, 10_000_000)}
    result = []
    for day in days:
        row = {"date": day}
        for field, (low, high) in fields.items():
            values = [point[day].get(field) for point in by_point]
            row[field] = (
                sum(values) / len(values)
                if all(type(value) in (int, float) and math.isfinite(value) and low <= value <= high for value in values)
                else None
            )
        result.append(row)
    return result


