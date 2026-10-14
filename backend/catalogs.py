"""Worldwide, single-source event catalogs for tropical cyclones and earthquakes."""
import csv
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import math
from threading import BoundedSemaphore

import httpx

from backend.concurrency import KeyedLocks

IBTRACS_URL = (
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/"
    "v04r01/access/csv/ibtracs.ALL.list.v04r01.csv"
)
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
CATALOG_VERSION = "global-catalogs-v1"
CATALOG_TTL = timedelta(days=30)
EARTHQUAKE_MIN_MAGNITUDE = 5.0
CYCLONE_MIN_WIND_KNOTS = 34.0
_catalog_locks = KeyedLocks()
_upstream_slots = BoundedSemaphore(4)


class CatalogDataError(ValueError):
    """An upstream catalog response could not be safely interpreted."""


def _fresh(entry):
    return (
        entry
        and datetime.now(timezone.utc) - datetime.fromisoformat(entry["fetched_at"])
        < CATALOG_TTL
    )


def _year_key(source, year):
    return f"{CATALOG_VERSION}:{source}:{year}"


def _fetch_earthquake_year(client, year):
    params = {
        "format": "geojson",
        "starttime": f"{year}-01-01",
        "endtime": f"{year}-12-31T23:59:59",
        "minmagnitude": EARTHQUAKE_MIN_MAGNITUDE,
        "orderby": "time-asc",
        "limit": 20000,
    }
    with _upstream_slots:
        response = client.get(USGS_URL, params=params)
        response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise CatalogDataError(f"USGS returned an invalid catalog response for {year}.")
    features = payload.get("features")
    if not isinstance(features, list) or len(features) >= params["limit"]:
        raise CatalogDataError(
            f"USGS returned an invalid or possibly truncated event list for {year}."
        )
    events, seen = [], set()
    for feature in features:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        event_id = feature.get("id")
        timestamp = properties.get("time")
        magnitude = properties.get("mag")
        if not event_id or event_id in seen or not isinstance(timestamp, (int, float)):
            continue
        if not isinstance(magnitude, (int, float)) or not math.isfinite(magnitude):
            continue
        if magnitude < EARTHQUAKE_MIN_MAGNITUDE or len(coords) < 3:
            continue
        instant = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        if instant.year != year or not all(
            isinstance(value, (int, float)) and math.isfinite(value)
            for value in coords[:3]
        ) or not -180 <= coords[0] <= 180 or not -90 <= coords[1] <= 90:
            continue
        seen.add(event_id)
        date_time = instant.isoformat(timespec="seconds").replace("+00:00", "Z")
        events.append(
            {
                "source_event_id": event_id,
                "start": date_time,
                "end": date_time,
                "duration": 0,
                "event_year": year,
                "peak_value": round(float(magnitude), 2),
                "mean_intensity": round(float(magnitude), 2),
                "magnitude": round(float(magnitude), 2),
                "place": str(properties.get("place") or "Location not reported"),
                "latitude": float(coords[1]),
                "longitude": float(coords[0]),
                "depth_km": float(coords[2]),
                "url": str(properties.get("url") or ""),
                "boundary_clipped": False,
            }
        )
    return events


def load_earthquakes(store, start_year, end_year):
    years = list(range(start_year, end_year + 1))
    lock_key = (id(store), "usgs-comcat", tuple(years))
    with _catalog_locks.hold(lock_key):
        records = {
            year: store.get("hazard_catalogs", _year_key("usgs-comcat", year))
            for year in years
        }
        stale = [year for year in years if not _fresh(records[year])]
        if stale:
            with httpx.Client(
                timeout=httpx.Timeout(45, connect=10),
                limits=httpx.Limits(max_connections=4, max_keepalive_connections=4),
                follow_redirects=False,
            ) as client:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    fetched = list(pool.map(lambda y: _fetch_earthquake_year(client, y), stale))
            fetched_at = datetime.now(timezone.utc).isoformat()
            store.put_many(
                "hazard_catalogs",
                [
                    (_year_key("usgs-comcat", year), {"fetched_at": fetched_at, "events": events})
                    for year, events in zip(stale, fetched)
                ],
            )
            records.update(
                {
                    year: {"events": events, "fetched_at": fetched_at}
                    for year, events in zip(stale, fetched)
                }
            )
        return [event for year in years for event in records[year]["events"]]


def _parse_ibtracs(lines, start_year, end_year):
    storms = {}
    reader = csv.DictReader(lines)
    if not reader.fieldnames or not {"SID", "ISO_TIME", "WMO_WIND", "LAT", "LON"} <= set(reader.fieldnames):
        raise CatalogDataError("NOAA IBTrACS response is missing required track fields.")
    for row in reader:
        sid = (row.get("SID") or "").strip()
        time_text = (row.get("ISO_TIME") or "").strip()
        if not sid or not time_text:
            continue
        try:
            observed = datetime.fromisoformat(time_text.replace("Z", "+00:00"))
        except ValueError:
            continue
        try:
            wind = float(row.get("WMO_WIND", ""))
            latitude = float(row.get("LAT", ""))
            longitude = float(row.get("LON", ""))
        except (TypeError, ValueError):
            wind, latitude, longitude = math.nan, math.nan, math.nan
        if (
            not math.isfinite(wind)
            or not 0 <= wind <= 250
            or not math.isfinite(latitude)
            or not -90 <= latitude <= 90
            or not math.isfinite(longitude)
            or not -180 <= longitude <= 180
        ):
            wind = math.nan
        storm = storms.get(sid)
        if storm is None:
            storm = {
                "first": observed,
                "last": observed,
                "name": (row.get("NAME") or "UNNAMED").strip(),
                "basin": (row.get("BASIN") or "").strip(),
                "max_wind": wind,
                "peak_latitude": latitude if math.isfinite(wind) else None,
                "peak_longitude": longitude if math.isfinite(wind) else None,
                "threshold_time": observed if wind >= CYCLONE_MIN_WIND_KNOTS else None,
            }
            storms[sid] = storm
        else:
            storm["first"] = min(storm["first"], observed)
            storm["last"] = max(storm["last"], observed)
            if math.isfinite(wind) and (
                not math.isfinite(storm["max_wind"]) or wind > storm["max_wind"]
            ):
                storm["max_wind"] = wind
                storm["peak_latitude"] = latitude
                storm["peak_longitude"] = longitude
            if wind >= CYCLONE_MIN_WIND_KNOTS and (
                storm["threshold_time"] is None or observed < storm["threshold_time"]
            ):
                storm["threshold_time"] = observed

    yearly = {year: [] for year in range(start_year, end_year + 1)}
    for sid, storm in storms.items():
        threshold_time = storm["threshold_time"]
        if threshold_time is None or threshold_time.year not in yearly:
            continue
        duration = max(1, (storm["last"].date() - storm["first"].date()).days + 1)
        start = storm["first"].isoformat(timespec="minutes").replace("+00:00", "Z")
        end = storm["last"].isoformat(timespec="minutes").replace("+00:00", "Z")
        maximum = round(float(storm["max_wind"]), 1)
        yearly[threshold_time.year].append(
            {
                "source_event_id": sid,
                "name": storm["name"],
                "basin": storm["basin"],
                "start": start,
                "end": end,
                "threshold_date": threshold_time.date().isoformat(),
                "duration": duration,
                "event_year": threshold_time.year,
                "peak_value": maximum,
                "mean_intensity": maximum,
                "max_wind_kt": maximum,
                "latitude": storm["peak_latitude"],
                "longitude": storm["peak_longitude"],
                "boundary_clipped": (
                    storm["first"].year < start_year or storm["last"].year > end_year
                ),
            }
        )
    for year in yearly:
        yearly[year].sort(key=lambda event: (event["threshold_date"], event["source_event_id"]))
    return yearly


def _fetch_ibtracs(start_year, end_year):
    fetched_at = datetime.now(timezone.utc).isoformat()
    with httpx.Client(
        timeout=httpx.Timeout(180, connect=15),
        limits=httpx.Limits(max_connections=1),
        follow_redirects=False,
    ) as client:
        with client.stream("GET", IBTRACS_URL) as response:
            response.raise_for_status()
            declared_size = response.headers.get("Content-Length")
            if declared_size:
                try:
                    if int(declared_size) > 150_000_000:
                        raise CatalogDataError("NOAA IBTrACS catalog exceeded the accepted download size.")
                except ValueError as exc:
                    raise CatalogDataError("NOAA IBTrACS returned an invalid content length.") from exc
            byte_count = 0

            def bounded_lines():
                nonlocal byte_count
                for index, line in enumerate(response.iter_lines()):
                    byte_count += len(line.encode("utf-8")) + 1
                    if byte_count > 150_000_000:
                        raise CatalogDataError("NOAA IBTrACS catalog exceeded the accepted download size.")
                    if index == 0:
                        line = line.removeprefix("\ufeff")
                    yield line

            events_by_year = _parse_ibtracs(bounded_lines(), start_year, end_year)
    return fetched_at, events_by_year


def load_cyclones(store, start_year, end_year):
    years = list(range(start_year, end_year + 1))
    lock_key = (id(store), "noaa-ibtracs-v04r01", tuple(years))
    with _catalog_locks.hold(lock_key):
        records = {
            year: store.get("hazard_catalogs", _year_key("noaa-ibtracs-v04r01", year))
            for year in years
        }
        if any(not _fresh(records[year]) for year in years):
            fetched_at, events_by_year = _fetch_ibtracs(start_year, end_year)
            store.put_many(
                "hazard_catalogs",
                [
                    (
                        _year_key("noaa-ibtracs-v04r01", year),
                        {"fetched_at": fetched_at, "events": events_by_year[year]},
                    )
                    for year in years
                ],
            )
            records = {
                year: {"events": events_by_year[year], "fetched_at": fetched_at}
                for year in years
            }
        return [event for year in years for event in records[year]["events"]]


def load_global_events(store, hazard, start_year, end_year):
    if hazard == "cyclone":
        return load_cyclones(store, start_year, end_year)
    if hazard == "earthquake":
        return load_earthquakes(store, start_year, end_year)
    raise ValueError(f"Unsupported global event hazard: {hazard}")


def analyze_global_events(events, start_year, end_year, hazard):
    is_cyclone = hazard == "cyclone"
    annual_events = {year: [] for year in range(start_year, end_year + 1)}
    for event in events:
        event["boundary_clipped"] = (
            int(event["start"][:4]) < start_year or int(event["end"][:4]) > end_year
        )
        year = event["event_year"]
        if year in annual_events:
            annual_events[year].append(event)

    annual = []
    for year, year_events in annual_events.items():
        durations = [event["duration"] for event in year_events if event["duration"] > 0]
        annual.append(
            {
                "year": year,
                "events": len(year_events),
                "hazard_days": sum(durations) if is_cyclone else None,
                "mean_duration": round(sum(durations) / len(durations), 2) if durations else 0,
                "max_duration": max(durations, default=0),
                "mean_intensity": (
                    round(sum(event["peak_value"] for event in year_events) / len(year_events), 2)
                    if year_events
                    else 0
                ),
                "peak_value": max((event["peak_value"] for event in year_events), default=None),
                "coverage": None,
                "eligible": True,
                "rolling_events": None,
                "regression_events": None,
                "rolling_duration": None,
                "regression_duration": None,
            }
        )

    for index, row in enumerate(annual):
        window = annual[max(0, index - 4) : index + 1]
        if len(window) == 5:
            row["rolling_events"] = round(sum(item["events"] for item in window) / 5, 3)
            duration_values = [
                event["duration"]
                for item in window
                for event in annual_events[item["year"]]
                if event["duration"] > 0
            ]
            row["rolling_duration"] = (
                round(sum(duration_values) / len(duration_values), 3)
                if duration_values
                else None
            )

    from scipy.stats import linregress

    years = [row["year"] for row in annual]
    counts = [row["events"] for row in annual]
    trend = {"slope_per_decade": None, "r_squared": None, "p_value": None, "eligible_years": len(annual)}
    if len(annual) >= 3:
        fit = linregress(years, counts)
        trend.update(
            slope_per_decade=round(float(fit.slope) * 10, 4),
            r_squared=round(float(fit.rvalue**2), 4) if math.isfinite(fit.rvalue) else None,
            p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None,
        )
        for row in annual:
            row["regression_events"] = round(float(fit.intercept + fit.slope * row["year"]), 3)
    duration_values = [
        (year, event["duration"])
        for year, year_events in annual_events.items()
        for event in year_events
        if event["duration"] > 0
    ]
    duration_trend = {
        "slope_per_decade": None,
        "r_squared": None,
        "p_value": None,
        "eligible_years": len({year for year, _ in duration_values}),
    }
    years_with_storms = sorted({year for year, _ in duration_values})
    if is_cyclone and len(years_with_storms) >= 3:
        means = [
            sum(value for event_year, value in duration_values if event_year == year)
            / sum(event_year == year for event_year, _ in duration_values)
            for year in years_with_storms
        ]
        fit = linregress(years_with_storms, means)
        duration_trend.update(
            slope_per_decade=round(float(fit.slope) * 10, 4),
            r_squared=round(float(fit.rvalue**2), 4) if math.isfinite(fit.rvalue) else None,
            p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None,
        )
        for year, mean in zip(years_with_storms, means):
            annual[year - start_year]["regression_duration"] = round(
                float(fit.intercept + fit.slope * year), 3
            )

    name = "tropical cyclone" if is_cyclone else "magnitude 5.0+ earthquake"
    total = len(events)
    insights = [
        f"Found {total} unique {name} events worldwide from {start_year} through {end_year}.",
        "Annual counts are descriptive catalog counts, not evidence that climate change caused a trend.",
    ]
    warnings = [
        "Worldwide historic catalog completeness varies by basin, era, monitoring capability, and reporting practice; a missing event is not proof that none occurred."
    ]
    if start_year < 1980:
        warnings.append(
            "Earlier records are less complete; apparent long-term changes may reflect improved observing and reporting."
        )
    if is_cyclone:
        source = "NOAA NCEI International Best Track Archive for Climate Stewardship (IBTrACS) v04r01"
        source_url = IBTRACS_URL
        rule = "A unique IBTrACS storm (SID) is counted once, in the year it first reaches a WMO-reported maximum sustained wind of at least 34 knots. Event duration and peak wind use the complete best track."
        limitations = "IBTrACS combines agency best tracks; wind averaging periods and historical coverage vary. WMO_WIND is used as supplied and converted to no other wind averaging convention. This catalog does not measure landfall, damage, storm surge, or climate attribution."
        threshold, unit = CYCLONE_MIN_WIND_KNOTS, "knots"
        longest = max((event["duration"] for event in events), default=0)
        hazard_days = sum(row["hazard_days"] or 0 for row in annual)
    else:
        source = "USGS Earthquake Hazards Program ComCat"
        source_url = USGS_URL
        rule = "A unique USGS ComCat event is counted when its catalog magnitude is at least 5.0; its catalog origin time determines the year."
        limitations = "Magnitude types can vary; ComCat's reported preferred magnitude is used without homogenizing to moment magnitude. Detection and reporting completeness vary by place and era. Counts do not represent shaking intensity, losses, or risk."
        threshold, unit = EARTHQUAKE_MIN_MAGNITUDE, "magnitude"
        longest, hazard_days = 0, None
        largest = max((event["magnitude"] for event in events), default=None)
        if largest is not None:
            insights.append(f"The largest catalog magnitude in the selected period was {largest:.1f}.")
    return {
        "annual": annual,
        "events": sorted(events, key=lambda event: (event["start"], event["source_event_id"])),
        "trend": trend,
        "duration_trend": duration_trend,
        "comparison": None,
        "summary": {
            "total_events": total,
            "hazard_days": hazard_days,
            "longest_event": longest,
            "largest_magnitude": (
                max((event["magnitude"] for event in events), default=None)
                if not is_cyclone
                else None
            ),
            "eligible_years": len(annual),
        },
        "insights": insights,
        "warnings": warnings,
        "methodology": {
            "threshold_c": None,
            "threshold_value": threshold,
            "threshold_unit": unit,
            "baseline": source,
            "baseline_coverage": None,
            "rule": rule,
            "limitations": limitations,
            "algorithm": CATALOG_VERSION,
        },
        "provenance": {
            "provider": source,
            "attribution": source,
            "spatial_scope": "Worldwide event catalog; selected city is not a spatial filter.",
            "url": source_url,
        },
    }
