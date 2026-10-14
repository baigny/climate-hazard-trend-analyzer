import csv
import hashlib
import io
import json
import os
import re
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Literal
from functools import lru_cache
from xml.sax.saxutils import escape

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pymongo.errors import PyMongoError

from backend.schemas import AnalysisInput, BoundingBox, Location
from backend.spatial import resolve_analysis_points, combine_point_observations
from backend.climate import analyze, map_series, ALGORITHM_VERSION
from backend.catalogs import (
    CATALOG_VERSION,
    CatalogDataError,
    analyze_global_events,
    load_global_events,
)
from backend.flood import load_discharge
from backend.storage import Store
from backend.weather import load_weather, MODEL
from backend.concurrency import KeyedLocks
from backend.security import APIBoundary, HEADERS
from backend.presentation import present_analysis
from backend.places import nearest_place, search_key

load_dotenv(Path(__file__).parent / ".env")
DATA = Path(__file__).parent / "data/locations"
ROOT = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app):
    app.state.store = Store()
    yield
    app.state.store.close()


app = FastAPI(title="Climatrace API", version="1.0.0", lifespan=lifespan)
_origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if value.strip()]
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(APIBoundary, origins=_origins)
_hosts = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
if os.getenv("RENDER_EXTERNAL_HOSTNAME"):
    _hosts.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=[host.strip() for host in _hosts if host.strip()])
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
_buckets = defaultdict(deque)
_rate_lock = Lock()
_analysis_locks = KeyedLocks()
ANALYSIS_EVENT_PAGE_SIZE = 250


@app.middleware("http")
async def limits(request, call_next):
    if request.url.path.startswith("/api/"):
        # Trust the socket peer, not spoofable client-supplied forwarding headers.
        ip = request.client.host if request.client else "unknown"
        now = monotonic()
        with _rate_lock:
            for key in list(_buckets):
                if not _buckets[key] or now - _buckets[key][-1] >= 60:
                    del _buckets[key]
            category = "analysis" if request.method == "POST" and request.url.path == "/api/analyses" else "general"
            limit = int(os.getenv("ANALYSIS_LIMIT_PER_MINUTE", "6") if category == "analysis" else os.getenv("RATE_LIMIT_PER_MINUTE", "30"))
            bucket = _buckets[(ip, category)]
            while bucket and now - bucket[0] >= 60:
                bucket.popleft()
            if len(bucket) >= limit:
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Please wait a minute."}, headers={**HEADERS, "Retry-After": "60", "Cache-Control": "no-store"})
            bucket.append(now)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(PyMongoError)
async def database_error(request, exc):
    return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable. Please retry later."})


def safe_segment(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,8}", value):
        raise HTTPException(422, "Invalid location identifier")
    return value


@lru_cache(maxsize=128)
def read_list(path):
    file = DATA / path
    if not file.exists():
        return []
    return json.loads(file.read_text(encoding="utf-8"))


@app.get("/api/health")
def health(request: Request):
    return {"status": "ok", "storage": request.app.state.store.backend, "algorithm": ALGORITHM_VERSION, "locations_ready": (DATA / "countries.json").exists()}


@app.get("/api/locations/countries")
def countries():
    result = read_list("countries.json")
    if not result:
        raise HTTPException(503, "Location data is missing. Run npm run locations during setup.")
    return result


@app.get("/api/locations/reverse")
def reverse_location(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)):
    try:
        return nearest_place(DATA, latitude, longitude)
    except (FileNotFoundError, ValueError):
        raise HTTPException(503, "Location names are unavailable. Run npm run locations.")


@app.get("/api/locations/{country}/states")
def states(country: str):
    code = safe_segment(country)
    result = read_list(f"{code}/states.json")
    return result or [{"id": "_", "name": "All locations"}]


@app.get("/api/locations/{country}/{state}/cities")
def cities(country: str, state: str, q: str = Query(default="", max_length=100), offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)):
    result = read_list(f"{safe_segment(country)}/{safe_segment(state)}.json")
    if q:
        query = search_key(q)
        result = [c for c in result if query in search_key(c["name"])]
    return {"items": result[offset:offset+limit], "total": len(result), "offset": offset, "limit": limit}


def load_selection_observations(store, selection, points=None):
    """Load each distinct requested point once with bounded parallelism."""
    if points is None:
        points, _ = resolve_analysis_points(selection)
    def load_point(point):
        point = point.model_copy(update={"latitude": round(point.latitude, 4), "longitude": round(point.longitude, 4)})
        if selection.hazard == "flood":
            return load_discharge(store, point.latitude, point.longitude,
                                  selection.start_year, selection.end_year)
        options = {"baseline_start": 1991, "baseline_end": 2020} if selection.hazard == "wind" else {}
        return load_weather(store, point.latitude, point.longitude,
                            selection.start_year, selection.end_year, point.timezone, **options)
    if len(points) == 1:
        results = [load_point(points[0])]
    else:
        with ThreadPoolExecutor(max_workers=min(4, len(points))) as pool:
            results = list(pool.map(load_point, points))
    return (combine_point_observations(results),
            sum(item[1] for item in results), sum(item[2] for item in results))


@app.post("/api/analyses")
def create_analysis(body: AnalysisInput, request: Request, include_events: bool = True):
    store = request.app.state.store
    params = body.model_dump()
    global_catalog = body.hazard in ("cyclone", "earthquake")
    if global_catalog:
        params["location"] = {
            "name": "Worldwide", "country": "Worldwide", "state": "",
            "latitude": 0.0, "longitude": 0.0, "timezone": "UTC",
        }
    else:
        points, center = resolve_analysis_points(body)
        for point in points:
            point.latitude = round(point.latitude, 4)
            point.longitude = round(point.longitude, 4)
        params["location"] = center.model_dump()
        params["location"]["latitude"] = round(params["location"]["latitude"], 4)
        params["location"]["longitude"] = round(params["location"]["longitude"], 4)
        if body.location_mode == "list":
            params["locations"] = [point.model_dump() for point in points]
    model_key = f"{MODEL}:{CATALOG_VERSION}" if global_catalog else MODEL
    key = hashlib.sha256(json.dumps({"params": params, "model": model_key, "algorithm": ALGORITHM_VERSION}, sort_keys=True).encode()).hexdigest()[:24]
    with _analysis_locks.hold((id(store), key)):
        cached = store.get("analyses", key)
        if cached and datetime.now(timezone.utc) - datetime.fromisoformat(cached["created_at"]) < timedelta(days=30):
            cached["cache"]["analysis_hit"] = True
            return analysis_response(cached, include_events, store)
        if global_catalog:
            try:
                events = load_global_events(store, body.hazard, body.start_year, body.end_year)
            except httpx.HTTPStatusError as exc:
                raise HTTPException(503 if exc.response.status_code == 429 else 502, "Worldwide event catalog is temporarily unavailable. Retry shortly.") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(504, "Worldwide event catalog request timed out or could not connect. Retry shortly.") from exc
            except CatalogDataError as exc:
                raise HTTPException(502, str(exc)) from exc
            result = analyze_global_events(events, body.start_year, body.end_year, body.hazard)
            hits, years = 0, 0
        else:
            try:
                data, hits, years = load_selection_observations(store, body, points)
                result = analyze(data, body.start_year, body.end_year, body.hazard)
            except httpx.HTTPStatusError as exc:
                raise HTTPException(503 if exc.response.status_code == 429 else 502, "Historical weather service is temporarily unavailable. Retry shortly.") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(504, "Historical weather request timed out or could not connect. Retry shortly.") from exc
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            result["provenance"] = {
                "provider": "Open-Meteo Flood API (GloFAS v4)" if body.hazard == "flood" else "Open-Meteo Historical Weather API",
                "model": "glofas_v4" if body.hazard == "flood" else MODEL,
                "url": "https://open-meteo.com/en/docs/flood-api" if body.hazard == "flood" else "https://open-meteo.com/en/docs/historical-weather-api",
                "attribution": "Historical river discharge from GloFAS v4 via Open-Meteo." if body.hazard == "flood" else "Weather data by Open-Meteo, using Copernicus ERA5 / ERA5-Land seamless reanalysis (CC BY 4.0).",
                "spatial_scope": f"Arithmetic mean of {len(points)} requested grid-point samples; not an area-weighted spatial mean." if len(points) > 1 else "Single selected model grid point; not a city-wide or state-wide average.",
            }
        result.update(id=key, parameters=params, created_at=datetime.now(timezone.utc).isoformat(), cache={"analysis_hit": False, "weather_years_hit": hits, "weather_years_total": years})
        if global_catalog:
            all_events = result.pop("events")
            result["event_count"] = len(all_events)
            pages = [
                (
                    f"{key}:{page}",
                    {"items": all_events[offset:offset + ANALYSIS_EVENT_PAGE_SIZE]},
                )
                for page, offset in enumerate(range(0, len(all_events), ANALYSIS_EVENT_PAGE_SIZE))
            ]
            if pages:
                store.put_many("analysis_events", pages)
        store.put("analyses", key, result)
        return analysis_response(store.get("analyses", key), include_events, store)
    

def analysis_response(data, include_events, store=None):
    # The initial UI response carries small annual series, never thousands of events.
    total = data.get("event_count", len(data.get("events", [])))
    if include_events and "events" not in data and store is not None:
        events = analysis_event_page(store, data, 0, total)["items"]
    else:
        events = data.get("events", []) if include_events else []
    return present_analysis({**data, "event_count": total, "events": events})


def analysis_event_page(store, data, offset, limit):
    if "events" in data:
        return {
            "items": data["events"][offset:offset + limit],
            "total": len(data["events"]),
            "offset": offset,
            "limit": limit,
        }
    if offset >= data["event_count"]:
        return {
            "items": [],
            "total": data["event_count"],
            "offset": offset,
            "limit": limit,
        }
    first_page = offset // ANALYSIS_EVENT_PAGE_SIZE
    last_page = (offset + limit - 1) // ANALYSIS_EVENT_PAGE_SIZE
    items = []
    for page in range(first_page, last_page + 1):
        entry = store.get("analysis_events", f"{data['id']}:{page}")
        if not entry:
            raise HTTPException(503, "Stored event pages are incomplete. Retry the analysis.")
        items.extend(entry["items"])
    page_offset = offset - first_page * ANALYSIS_EVENT_PAGE_SIZE
    return {
        "items": items[page_offset:page_offset + limit],
        "total": data["event_count"],
        "offset": offset,
        "limit": limit,
    }


def get_analysis(store, analysis_id):
    if not re.fullmatch(r"[a-f0-9]{24}", analysis_id):
        raise HTTPException(422, "Invalid analysis ID")
    result = store.get("analyses", analysis_id)
    if not result:
        raise HTTPException(404, "Analysis not found. Run an analysis first.")
    return present_analysis(result)


@app.get("/api/analyses/{analysis_id}")
def retrieve_analysis(analysis_id: str, request: Request):
    return get_analysis(request.app.state.store, analysis_id)


@app.get("/api/analyses/{analysis_id}/events")
def analysis_events(analysis_id: str, request: Request, offset: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)):
    data = get_analysis(request.app.state.store, analysis_id)
    return analysis_event_page(request.app.state.store, data, offset, limit)


@app.get("/api/analyses/{analysis_id}/series")
def analysis_series(
    analysis_id: str,
    request: Request,
    variable: Literal["temperature", "rainfall", "dry_days", "wind", "discharge"] = "temperature",
    resolution: Literal["monthly", "quarterly", "halfyearly", "yearly", "decades"] = "monthly",
    year: int | None = Query(default=None, ge=1950),
    decade: int | None = Query(default=None, ge=1950),
):
    data = get_analysis(request.app.state.store, analysis_id)
    selection = AnalysisInput.model_validate(data["parameters"])
    if selection.hazard in ("cyclone", "earthquake"):
        raise HTTPException(422, "Worldwide event catalogs do not provide weather map series.")
    if (variable == "discharge") != (selection.hazard == "flood"):
        raise HTTPException(422, "Flood series use discharge; weather hazards use weather layers.")
    first, last = selection.start_year, selection.end_year
    if decade is not None:
        if decade % 10 or decade > last or decade + 9 < first:
            raise HTTPException(422, "Choose a calendar decade within the analyzed range.")
        first, last = max(first, decade), min(last, decade + 9)
    if year is not None:
        if not first <= year <= last or resolution == "decades":
            raise HTTPException(422, "Choose a year within the analyzed range for the selected time step.")
        first = last = year
    try:
        observations, _, _ = load_selection_observations(request.app.state.store, selection)
        series = map_series(observations, first, last, variable, resolution)
        series.update(start_year=first, end_year=last)
        if year is not None and resolution in ("monthly", "quarterly", "halfyearly"):
            for point in series["points"]:
                point["period"] = f"{point['period']} {year}"
        return series
    except httpx.HTTPStatusError as exc:
        raise HTTPException(503 if exc.response.status_code == 429 else 502, "Historical weather service is temporarily unavailable. Retry shortly.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(504, "Historical weather request timed out or could not connect. Retry shortly.") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/analyses/{analysis_id}/export.csv")
def export_csv(analysis_id: str, request: Request):
    data = get_analysis(request.app.state.store, analysis_id)
    stream = io.StringIO(newline="")
    fields = list(data["annual"][0])
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(data["annual"])
    return Response(stream.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="climatrace-{analysis_id}.csv"'})


@app.get("/api/analyses/{analysis_id}/export.pdf")
def export_pdf(analysis_id: str, request: Request):
    data = get_analysis(request.app.state.store, analysis_id)
    stream, styles = io.BytesIO(), getSampleStyleSheet()
    hazard = data["parameters"].get("hazard", "heatwave")
    hazard_name = {"heatwave": "Heatwave", "heavy_rainfall": "Heavy rainfall", "drought": "Drought", "wind": "Wind", "flood": "Flood", "cyclone": "Tropical cyclones", "earthquake": "Earthquakes (M5.0+)"}.get(hazard, "Climate hazard")
    doc = SimpleDocTemplate(stream, pagesize=(8.27*inch, 11.69*inch), rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42, title=f"Climatrace {hazard_name} Report")
    loc, params = data["parameters"]["location"], data["parameters"]
    paragraphs = [Paragraph(escape(f"CLIMATRACE / {hazard_name.upper()} REPORT"), styles["Title"]), Spacer(1, 12), Paragraph(escape(f"{loc['name']}, {loc['state']}, {loc['country']} | {params['start_year']}-{params['end_year']}"), styles["Heading2"])]
    for text in data["insights"]:
        paragraphs += [Paragraph(escape(text), styles["BodyText"]), Spacer(1, 8)]
    paragraphs += [Paragraph("Annual observations", styles["Heading2"])]
    rows = [["Year", "Events", "Hazard days", "Max duration", "Coverage"]] + [[str(r["year"]), str(r["events"]), str(r["hazard_days"] if r["hazard_days"] is not None else "—"), str(r["max_duration"]), f"{r['coverage']:.1%}" if r["coverage"] is not None else "—"] for r in data["annual"]]
    table = Table(rows, repeatRows=1, hAlign="LEFT", colWidths=[65, 70, 110, 110, 85])
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#183d32")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#f3f5f0"), colors.white]), ("BOTTOMPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 7), ("FONTSIZE", (0,0), (-1,-1), 9)]))
    paragraphs += [table, Spacer(1,16), Paragraph("Methodology and limitations", styles["Heading2"])]
    threshold = data["methodology"].get("threshold_value", data["methodology"].get("threshold_c"))
    threshold_unit = data["methodology"].get("threshold_unit", "°C")
    threshold_text = f"Threshold: {threshold:.2f} {threshold_unit}. Baseline: {data['methodology']['baseline']}." if threshold is not None else "Threshold is not applicable."
    for text in [threshold_text, data["methodology"]["rule"], data["methodology"]["limitations"], *data["warnings"], data["provenance"]["attribution"], data["provenance"]["url"], f"Generated {data['created_at']}. Algorithm: {ALGORITHM_VERSION}."]:
        paragraphs += [Paragraph(escape(text), styles["BodyText"]), Spacer(1,8)]
    doc.build(paragraphs)
    return Response(stream.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="climatrace-{analysis_id}.pdf"'})


# A single service can serve the compiled frontend; static-site hosting also works.
if (ROOT / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
