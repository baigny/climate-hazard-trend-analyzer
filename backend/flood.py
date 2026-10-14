"""Cached historical GloFAS river-discharge data for a river-flood proxy."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from threading import BoundedSemaphore
import time

import httpx

from backend.concurrency import KeyedLocks

FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
FLOOD_MODEL = "glofas_v4"
FLOOD_VERSION = "glofas-v4-river-discharge-v1"
FLOOD_BASELINE_START = 1991
FLOOD_BASELINE_END = 2020
FLOOD_MIN_YEAR = 1984
FLOOD_TTL = timedelta(days=30)
_flood_locks = KeyedLocks()
_upstream_slots = BoundedSemaphore(4)


def _key(lat, lon, year):
    return f"{FLOOD_VERSION}:{lat:.4f}:{lon:.4f}:{year}"


def _fetch_batch(store, lat, lon, years, client):
    start, end = f"{years[0]}-01-01", f"{years[-1]}-12-31"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "river_discharge",
        "timezone": "GMT",
    }
    with _upstream_slots:
        for attempt in range(3):
            try:
                response = client.get(FLOOD_URL, params=params)
                if (response.status_code == 429 or response.status_code >= 500) and attempt < 2:
                    time.sleep(.5 * 2**attempt)
                    continue
                response.raise_for_status()
                payload = response.json()
                break
            except httpx.TransportError:
                if attempt == 2:
                    raise
                time.sleep(.5 * 2**attempt)
    daily = payload.get("daily", {})
    dates, discharge = daily.get("time", []), daily.get("river_discharge", [])
    if (
        payload.get("daily_units", {}).get("river_discharge") != "m³/s"
        or not dates
        or len(dates) != len(discharge)
    ):
        raise ValueError(
            "GloFAS returned no historical river-discharge data or unexpected units for the selected coordinates."
        )
    by_year = {year: [] for year in years}
    seen = set()
    for date_text, value in zip(dates, discharge):
        observed = date.fromisoformat(date_text)
        if observed.year not in by_year or observed in seen:
            raise ValueError("GloFAS returned duplicate dates or dates outside the requested period.")
        seen.add(observed)
        by_year[observed.year].append(
            {"date": date_text, "discharge": value}
        )
    if any(not records for records in by_year.values()):
        raise ValueError("GloFAS omitted a requested year of river-discharge data.")
    fetched_at = datetime.now(timezone.utc).isoformat()
    store.put_many(
        "flood_weather",
        [
            (
                _key(lat, lon, year),
                {
                    "fetched_at": fetched_at,
                    "grid_latitude": payload.get("latitude"),
                    "grid_longitude": payload.get("longitude"),
                    "observations": observations,
                },
            )
            for year, observations in by_year.items()
        ],
    )
    return {
        year: store.get("flood_weather", _key(lat, lon, year))["observations"]
        for year in years
    }


def load_discharge(store, lat, lon, start_year, end_year):
    years = sorted(
        set(range(FLOOD_BASELINE_START, FLOOD_BASELINE_END + 1))
        | set(range(start_year, end_year + 1))
    )
    with _flood_locks.hold((id(store), round(lat, 4), round(lon, 4))):
        records, missing = {}, []
        for year in years:
            cached = store.get("flood_weather", _key(lat, lon, year))
            if cached and datetime.now(timezone.utc) - datetime.fromisoformat(
                cached["fetched_at"]
            ) < FLOOD_TTL:
                records[year] = cached["observations"]
            else:
                missing.append(year)
        batches = []
        for year in missing:
            if not batches or len(batches[-1]) >= 10 or batches[-1][-1] + 1 != year:
                batches.append([])
            batches[-1].append(year)
        if batches:
            with httpx.Client(
                timeout=httpx.Timeout(90, connect=10),
                limits=httpx.Limits(max_connections=4, max_keepalive_connections=4),
                follow_redirects=False,
            ) as client:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    for batch in pool.map(
                        lambda years: _fetch_batch(store, lat, lon, years, client),
                        batches,
                    ):
                        records.update(batch)
    return [row for year in years for row in records[year]], len(years) - len(missing), len(years)
