"""Pure, independently testable climate hazard calculations. No I/O."""
from collections import defaultdict
from datetime import date, timedelta
import calendar
import math

import numpy as np
from scipy.stats import linregress

ALGORITHM_VERSION = "multi-hazard-daily-v3"
BASELINE_START, BASELINE_END = 1981, 2010
MIN_COVERAGE = .95
HAZARDS = ("heatwave", "heavy_rainfall", "drought", "wind", "flood")


def normalize(observations):
    """Preserve missing days, reject ambiguous dates, never clip real extremes."""
    records = {}
    invalid = 0
    for item in observations:
        day = date.fromisoformat(item["date"])
        value = item.get("tmax")
        if value is not None:
            value = float(value)
            if not math.isfinite(value) or not -90 <= value <= 65:
                value = None
                invalid += 1
        if day in records and records[day] != value:
            raise ValueError(f"Conflicting observations for {day}")
        records[day] = value
    return records, invalid


def detect_events(records, threshold, start, end):
    events, run = [], []

    def flush():
        if len(run) >= 3:
            values = [records[d] for d in run]
            events.append({
                "start": run[0].isoformat(), "end": run[-1].isoformat(),
                "duration": len(run), "peak_tmax": round(max(values), 2),
                "mean_exceedance": round(float(np.mean(values)) - threshold, 2),
                "peak_value": round(max(values), 2),
                "mean_intensity": round(float(np.mean(values)) - threshold, 2),
                "boundary_clipped": run[0] == start or run[-1] == end,
            })
        run.clear()

    day = start
    while day <= end:
        value = records.get(day)
        if value is not None and value > threshold:
            run.append(day)
        else:
            flush()
        day += timedelta(days=1)
    flush()
    return events


def analyze(observations, start_year, end_year, hazard="heatwave"):
    if hazard != "heatwave":
        if hazard not in HAZARDS:
            raise ValueError("Choose heatwave, heavy rainfall, or drought analysis.")
        return analyze_daily_proxy(observations, start_year, end_year, hazard)
    records, invalid = normalize(observations)
    baseline = [v for d, v in records.items() if BASELINE_START <= d.year <= BASELINE_END and v is not None]
    expected = sum(366 if calendar.isleap(y) else 365 for y in range(BASELINE_START, BASELINE_END + 1))
    if len(baseline) / expected < MIN_COVERAGE:
        raise ValueError("The 1981–2010 baseline has less than 95% valid daily coverage; a reliable threshold cannot be calculated.")
    # Check each baseline year too: a missing year must not hide in aggregate coverage.
    for year in range(BASELINE_START, BASELINE_END + 1):
        valid = sum(v is not None for d, v in records.items() if d.year == year)
        if valid / (366 if calendar.isleap(year) else 365) < MIN_COVERAGE:
            raise ValueError(f"Baseline year {year} has less than 95% valid daily coverage.")
    threshold = float(np.percentile(baseline, 95, method="linear"))
    start, end = date(start_year, 1, 1), date(end_year, 12, 31)
    events = detect_events(records, threshold, start, end)
    by_year = defaultdict(list)
    heat_days = defaultdict(list)
    for event in events:
        by_year[int(event["start"][:4])].append(event)
        day, finish = date.fromisoformat(event["start"]), date.fromisoformat(event["end"])
        while day <= finish:
            heat_days[day.year].append(records[day])
            day += timedelta(days=1)
    annual, warnings = [], []
    for year in range(start_year, end_year + 1):
        values = [v for d, v in records.items() if d.year == year and v is not None]
        coverage = len(values) / (366 if calendar.isleap(year) else 365)
        eligible = coverage >= MIN_COVERAGE
        es, ds = by_year[year], heat_days[year]
        if not eligible:
            warnings.append(f"{year}: {coverage:.1%} coverage; excluded from trends. Observed event counts may be incomplete.")
        annual.append({
            "year": year, "events": len(es), "heatwave_days": len(ds),
            "hazard_days": len(ds),
            "mean_duration": round(float(np.mean([e['duration'] for e in es])), 2) if es else 0,
            "max_duration": max((e["duration"] for e in es), default=0),
            "mean_exceedance": round(float(np.mean(ds)) - threshold, 2) if ds else 0,
            "mean_intensity": round(float(np.mean(ds)) - threshold, 2) if ds else 0,
            "peak_tmax": round(max(values), 2) if values else None,
            "peak_value": round(max(values), 2) if values else None,
            "coverage": round(coverage, 4), "eligible": eligible,
        })
    for i, row in enumerate(annual):
        window = annual[max(0, i - 4): i + 1]
        row["rolling_events"] = round(float(np.mean([r["events"] for r in window])), 3) if len(window) == 5 and all(r["eligible"] for r in window) else None
        # Pool events across five complete years. A year without events does not
        # contribute a fictitious zero-day event; an all-zero window is undefined.
        event_count = sum(r["events"] for r in window)
        window_events = [e["duration"] for r in window for e in by_year[r["year"]]]
        row["rolling_duration"] = round(float(np.mean(window_events)), 3) if len(window) == 5 and all(r["eligible"] for r in window) and event_count else None
    eligible = [r for r in annual if r["eligible"]]
    trend = {"slope_per_decade": None, "r_squared": None, "p_value": None, "eligible_years": len(eligible)}
    if len(eligible) >= 3:
        fit = linregress([r["year"] for r in eligible], [r["events"] for r in eligible])
        trend.update(slope_per_decade=round(float(fit.slope) * 10, 4), r_squared=round(float(fit.rvalue ** 2), 4) if math.isfinite(fit.rvalue) else None, p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None)
        for row in annual:
            row["regression_events"] = round(float(fit.intercept + fit.slope * row["year"]), 3) if row["eligible"] else None
    else:
        for row in annual:
            row["regression_events"] = None
        warnings.append("At least three adequately covered years are needed for regression.")
    duration_years = [r for r in eligible if r["events"] > 0]
    duration_trend = {"slope_per_decade": None, "r_squared": None, "p_value": None, "eligible_years": len(duration_years)}
    for row in annual:
        row["regression_duration"] = None
    if len(duration_years) >= 3:
        fit = linregress([r["year"] for r in duration_years], [r["mean_duration"] for r in duration_years])
        duration_trend.update(slope_per_decade=round(float(fit.slope) * 10, 4), r_squared=round(float(fit.rvalue ** 2), 4) if math.isfinite(fit.rvalue) else None, p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None)
        for row in duration_years:
            row["regression_duration"] = round(float(fit.intercept + fit.slope * row["year"]), 3)
    else:
        warnings.append("At least three adequately covered years containing events are needed for duration regression.")
    change = None
    insights = []
    if len(annual) >= 10 and all(r["eligible"] for r in annual[:5] + annual[-5:]):
        first = float(np.mean([r["events"] for r in annual[:5]]))
        last = float(np.mean([r["events"] for r in annual[-5:]]))
        change = {"first_period": f"{start_year}–{start_year+4}", "last_period": f"{end_year-4}–{end_year}", "first_average": round(first, 2), "last_average": round(last, 2), "percent": round((last-first)/first*100, 1) if first else None}
        insights.append(f"Average annual events changed from {first:.1f} ({change['first_period']}) to {last:.1f} ({change['last_period']})." + (f" This is a {(last-first)/first*100:+.1f}% change." if first else " Percentage change is undefined because the starting average is zero."))
    else:
        insights.append("Percentage comparison requires at least ten years and complete first/last five-year windows.")
    if trend["slope_per_decade"] is not None:
        insights.append(f"The fitted frequency trend is {trend['slope_per_decade']:+.2f} events per decade. This describes this location and period; it does not establish causation.")
    if duration_trend["slope_per_decade"] is not None:
        insights.append(f"The fitted mean-duration trend is {duration_trend['slope_per_decade']:+.2f} days per decade, using {len(duration_years)} adequately covered years containing events. Years without events have no defined mean duration and are excluded. This is descriptive, not causal.")
    if not events:
        insights.append("No qualifying heatwave events were detected in the available observations.")
    if any(e["boundary_clipped"] for e in events):
        warnings.append("An event touches the selected date boundary; its duration may be truncated.")
    if invalid:
        warnings.append(f"{invalid} non-finite or implausible temperatures were treated as missing, not corrected or interpolated.")
    return {
        "annual": annual, "events": events, "trend": trend, "duration_trend": duration_trend, "comparison": change,
        "summary": {"total_events": len(events), "heatwave_days": sum(r["heatwave_days"] for r in annual), "hazard_days": sum(r["hazard_days"] for r in annual), "longest_event": max((e["duration"] for e in events), default=0), "eligible_years": len(eligible)},
        "insights": insights, "warnings": warnings,
        "methodology": {"algorithm": ALGORITHM_VERSION, "threshold_c": round(threshold, 4), "threshold_value": round(threshold, 4), "threshold_unit": "°C", "baseline": "1981–2010", "baseline_coverage": round(len(baseline)/expected, 4), "percentile": 95, "minimum_days": 3, "rule": "Daily maximum temperature strictly above a fixed baseline annual 95th percentile for 3+ consecutive days.", "limitations": "Simplified case-study definition, not IMD operational criteria. A pooled annual threshold does not adjust for seasonal variation. Missing days break events. Frequency is attributed to event start year; heatwave days to their calendar year. Reanalysis represents a grid cell, not a station or whole administrative area."},
    }


def normalize_variable(observations, field, low, high, description):
    records, invalid = {}, 0
    for item in observations:
        day = date.fromisoformat(item["date"])
        value = item.get(field)
        if value is not None:
            value = float(value)
            if not math.isfinite(value) or not low <= value <= high:
                value = None
                invalid += 1
        if day in records and records[day] != value:
            raise ValueError(f"Conflicting observations for {day}")
        records[day] = value
    return records, invalid, description


def threshold_events(records, threshold, start, end, predicate, minimum_days, invert_intensity=False):
    events, run = [], []

    def flush():
        if len(run) >= minimum_days:
            values = [records[day] for day in run]
            intensity = float(np.mean(values)) - threshold
            if invert_intensity:
                intensity *= -1
            events.append({
                "start": run[0].isoformat(), "end": run[-1].isoformat(),
                "duration": len(run), "peak_value": round(max(values), 2),
                "mean_intensity": round(intensity, 2),
                "boundary_clipped": run[0] == start or run[-1] == end,
            })
        run.clear()

    day = start
    while day <= end:
        value = records.get(day)
        if value is not None and predicate(value, threshold):
            run.append(day)
        else:
            flush()
        day += timedelta(days=1)
    flush()
    return events


def analyze_precipitation_hazard(observations, start_year, end_year, hazard):
    return analyze_daily_proxy(observations, start_year, end_year, hazard)


def analyze_daily_proxy(observations, start_year, end_year, hazard):
    flood = hazard == "flood"
    wind = hazard == "wind"
    field, low, high, description = (
        ("discharge", 0, 10_000_000, "daily river discharge")
        if flood
        else ("wind_speed", 0, 500, "daily maximum wind speed")
        if wind
        else ("precipitation", 0, 2000, "daily precipitation")
    )
    records, invalid, _ = normalize_variable(observations, field, low, high, description)
    baseline_start, baseline_end = (1991, 2020) if (flood or wind) else (BASELINE_START, BASELINE_END)
    baseline_years = range(baseline_start, baseline_end + 1)
    expected = sum(366 if calendar.isleap(year) else 365 for year in baseline_years)
    baseline = [value for day, value in records.items()
                if baseline_start <= day.year <= baseline_end and value is not None]
    if len(baseline) / expected < MIN_COVERAGE:
        raise ValueError(f"The {baseline_start}–{baseline_end} {description} baseline has less than 95% valid daily coverage.")
    for year in baseline_years:
        valid = sum(value is not None for day, value in records.items() if day.year == year)
        if valid / (366 if calendar.isleap(year) else 365) < MIN_COVERAGE:
            raise ValueError(f"Baseline year {year} has less than 95% valid {description} coverage.")

    if hazard == "heavy_rainfall":
        wet_days = [value for value in baseline if value >= 1.0]
        if len(wet_days) < 100:
            raise ValueError("At least 100 valid wet days (≥1 mm/day) are needed to estimate the baseline heavy-rainfall threshold.")
        threshold = float(np.percentile(wet_days, 95, method="linear"))
        minimum_days = 1
        predicate = lambda value, limit: value > limit
        rule = "A heavy-rainfall event is one or more consecutive days with precipitation strictly above the 1981–2010 95th percentile of wet-day totals (days ≥1 mm)."
        limits = "The fixed, pooled wet-day threshold does not adjust for seasonality or local impacts. It measures daily precipitation extremes, not flooding. Consecutive qualifying days are grouped; missing days break events."
        hazard_name = "heavy rainfall"
        baseline_description = "1981–2010"
        unit = "mm/day"
    elif wind:
        threshold = float(np.percentile(baseline, 95, method="linear"))
        minimum_days = 1
        predicate = lambda value, limit: value > limit
        rule = "A wind event is one or more consecutive days with maximum 10 m wind speed strictly above the location's 1991–2020 95th percentile."
        limits = "This is a local statistical extreme, not an official severe-wind warning or damage threshold. ERA5 daily maximum 10 m wind does not represent gusts; terrain, exposure, and impacts are not modeled."
        hazard_name = "wind"
        baseline_description = "1991–2020"
        unit = "km/h"
    elif flood:
        threshold = float(np.percentile(baseline, 95, method="linear"))
        minimum_days = 1
        predicate = lambda value, limit: value > limit
        rule = "A flood event is one or more consecutive days when GloFAS daily river discharge exceeds the selected area’s 1991–2020 95th percentile."
        limits = "High river discharge is a hydrological indicator, not a verified flood extent, warning, or impact record. GloFAS selects a river within about 5 km; some locations have no suitable river cell and area averaging is an arithmetic summary of sampled discharges, not river-network routing."
        hazard_name = "flood"
        baseline_description = "1991–2020"
        unit = "m³/s"
    else:
        threshold = 1.0
        minimum_days = 10
        predicate = lambda value, limit: value < limit
        rule = "A drought event is at least 10 consecutive days with daily precipitation strictly below 1 mm."
        limits = "This is a meteorological dry-spell indicator, not a comprehensive drought diagnosis. It does not include soil moisture, evapotranspiration, streamflow, water demand, or impacts; a fixed dry-day rule is not equivalent to SPI/SPEI."
        hazard_name = "drought"
        baseline_description = "1981–2010"
        unit = "mm/day"

    start, end = date(start_year, 1, 1), date(end_year, 12, 31)
    events = threshold_events(
        records, threshold, start, end, predicate, minimum_days,
        invert_intensity=hazard == "drought",
    )
    by_year, hazard_days = defaultdict(list), defaultdict(list)
    for event in events:
        by_year[int(event["start"][:4])].append(event)
        day, finish = date.fromisoformat(event["start"]), date.fromisoformat(event["end"])
        while day <= finish:
            if day.year in range(start_year, end_year + 1):
                hazard_days[day.year].append(records[day])
            day += timedelta(days=1)

    annual, warnings = [], []
    for year in range(start_year, end_year + 1):
        values = [value for day, value in records.items() if day.year == year and value is not None]
        coverage = len(values) / (366 if calendar.isleap(year) else 365)
        eligible = coverage >= MIN_COVERAGE
        year_events, event_values = by_year[year], hazard_days[year]
        intensity = (
            (threshold - float(np.mean(event_values)) if hazard == "drought"
             else float(np.mean(event_values)) - threshold)
            if event_values else 0
        )
        days_count = len(event_values)
        annual.append({
            "year": year, "events": len(year_events),
            "hazard_days": days_count,
            "mean_duration": round(float(np.mean([event["duration"] for event in year_events])), 2) if year_events else 0,
            "max_duration": max((event["duration"] for event in year_events), default=0),
            "mean_intensity": round(intensity, 2),
            "peak_value": round(max(values), 2) if values else None,
            "coverage": round(coverage, 4), "eligible": eligible,
            "rolling_events": None, "regression_events": None,
            "rolling_duration": None, "regression_duration": None,
        })
        if not eligible:
            warnings.append(f"{year}: {coverage:.1%} coverage; excluded from trends. Observed event counts may be incomplete.")

    for index, row in enumerate(annual):
        window = annual[max(0, index - 4):index + 1]
        if len(window) == 5 and all(item["eligible"] for item in window):
            row["rolling_events"] = round(float(np.mean([item["events"] for item in window])), 3)
            pooled = [event["duration"] for item in window for event in by_year[item["year"]]]
            row["rolling_duration"] = round(float(np.mean(pooled)), 3) if pooled else None

    eligible = [row for row in annual if row["eligible"]]
    trend = {"slope_per_decade": None, "r_squared": None, "p_value": None, "eligible_years": len(eligible)}
    if len(eligible) >= 3:
        fit = linregress([row["year"] for row in eligible], [row["events"] for row in eligible])
        trend.update(slope_per_decade=round(float(fit.slope) * 10, 4),
                     r_squared=round(float(fit.rvalue ** 2), 4) if math.isfinite(fit.rvalue) else None,
                     p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None)
        for row in eligible:
            row["regression_events"] = round(float(fit.intercept + fit.slope * row["year"]), 3)
    else:
        warnings.append("At least three adequately covered years are needed for regression.")

    duration_years = [row for row in eligible if row["events"]]
    duration_trend = {"slope_per_decade": None, "r_squared": None, "p_value": None, "eligible_years": len(duration_years)}
    if len(duration_years) >= 3:
        fit = linregress([row["year"] for row in duration_years], [row["mean_duration"] for row in duration_years])
        duration_trend.update(slope_per_decade=round(float(fit.slope) * 10, 4),
                              r_squared=round(float(fit.rvalue ** 2), 4) if math.isfinite(fit.rvalue) else None,
                              p_value=round(float(fit.pvalue), 4) if math.isfinite(fit.pvalue) else None)
        for row in duration_years:
            row["regression_duration"] = round(float(fit.intercept + fit.slope * row["year"]), 3)

    comparison = None
    insights = []
    if len(annual) >= 10 and all(row["eligible"] for row in annual[:5] + annual[-5:]):
        first = float(np.mean([row["events"] for row in annual[:5]]))
        last = float(np.mean([row["events"] for row in annual[-5:]]))
        comparison = {"first_period": f"{start_year}–{start_year+4}", "last_period": f"{end_year-4}–{end_year}",
                      "first_average": round(first, 2), "last_average": round(last, 2),
                      "percent": round((last-first)/first*100, 1) if first else None}
    insights.append(f"Detected {len(events)} {hazard_name} events affecting {sum(row['hazard_days'] for row in annual)} days.")
    if trend["slope_per_decade"] is not None:
        insights.append(f"The fitted event-frequency trend is {trend['slope_per_decade']:+.2f} events per decade. This is descriptive and does not establish causation.")
    if not events:
        insights.append(f"No qualifying {hazard_name} events were detected in the available observations.")
    if any(event["boundary_clipped"] for event in events):
        warnings.append("An event touches the selected date boundary; its duration may be truncated.")
    if invalid:
        warnings.append(f"{invalid} non-finite or implausible {description} values were treated as missing, not corrected or interpolated.")
    return {
        "annual": annual, "events": events, "trend": trend, "duration_trend": duration_trend,
        "comparison": comparison,
        "summary": {"total_events": len(events), "hazard_days": sum(row["hazard_days"] for row in annual),
                    "longest_event": max((event["duration"] for event in events), default=0),
                    "eligible_years": len(eligible)},
        "insights": insights, "warnings": warnings,
        "methodology": {
            "algorithm": ALGORITHM_VERSION, "threshold_c": None,
            "threshold_value": round(threshold, 4),             "threshold_unit": unit,
            "baseline": baseline_description, "baseline_coverage": round(len(baseline)/expected, 4),
            "percentile": 95 if hazard in ("heavy_rainfall", "wind", "flood") else None,
            "minimum_days": minimum_days, "rule": rule, "limitations": limits,
        },
    }


def map_series(observations, start_year, end_year, variable, resolution):
    """Prepare selected climate layer summaries over standard calendar periods."""
    fields = {
        "temperature": ("tmax", -90, 65),
        "rainfall": ("precipitation", 0, 2000),
        "wind": ("wind_speed", 0, 500),
        "discharge": ("discharge", 0, 10_000_000),
    }
    if variable not in (*fields, "dry_days"):
        raise ValueError("Choose a supported map layer.")
    if resolution not in ("monthly", "quarterly", "halfyearly", "yearly", "decades"):
        raise ValueError("Choose monthly, quarterly, half-yearly, yearly, or decadal map resolution.")
    field, low, high = fields.get(variable, ("precipitation", 0, 2000))
    records, _, _ = normalize_variable(observations, field, low, high, variable)
    labels = {
        "temperature": ("Maximum temperature", "°C", "mean"),
        "rainfall": ("Precipitation", "mm", "total"),
        "dry_days": ("Dry days (<1 mm)", "days", "count"),
        "wind": ("Maximum 10 m wind speed", "km/h", "mean"),
        "discharge": ("River discharge", "m³/s", "mean"),
    }
    label, unit, aggregation = labels[variable]
    groups = {}
    if resolution in ("monthly", "quarterly", "halfyearly"):
        group_count = {"monthly": 12, "quarterly": 4, "halfyearly": 2}[resolution]
        group_months = {
            "monthly": 1,
            "quarterly": 3,
            "halfyearly": 6,
        }[resolution]
        for index in range(group_count):
            first_month = index * group_months + 1
            months = range(first_month, first_month + group_months)
            groups[index] = (
                f"{calendar.month_name[first_month]}" if resolution == "monthly"
                else f"Q{index + 1}" if resolution == "quarterly"
                else ("First half (Jan–Jun)" if index == 0 else "Second half (Jul–Dec)"),
                tuple(months),
                tuple(range(start_year, end_year + 1)),
            )
    elif resolution == "yearly":
        for year in range(start_year, end_year + 1):
            groups[year] = (str(year), tuple(range(1, 13)), (year,))
    else:
        first_decade = (start_year // 10) * 10
        for decade in range(first_decade, end_year + 1, 10):
            period_start, period_end = max(start_year, decade), min(end_year, decade + 9)
            groups[decade] = (
                f"{period_start}–{period_end}",
                tuple(range(1, 13)),
                tuple(range(period_start, period_end + 1)),
            )

    points = []
    for _, (period, months, years) in groups.items():
        expected = valid_days = 0
        aggregates = []
        aggregate_weights = []
        for year in years:
            year_values = []
            for month in months:
                days_in_month = calendar.monthrange(year, month)[1]
                month_values = [
                    records.get(date(year, month, day))
                    for day in range(1, days_in_month + 1)
                ]
                valid_month = [value for value in month_values if value is not None]
                expected += days_in_month
                valid_days += len(valid_month)
                if len(valid_month) / days_in_month >= MIN_COVERAGE:
                    year_values.extend(valid_month)
            if year_values:
                if variable == "dry_days":
                    year_aggregate = float(sum(value < 1 for value in year_values))
                elif aggregation == "total":
                    year_aggregate = float(np.sum(year_values))
                else:
                    year_aggregate = float(np.mean(year_values))
                aggregates.append(year_aggregate)
                aggregate_weights.append(len(year_values))
        coverage = valid_days / expected if expected else 0.0
        if not aggregates:
            value = None
        elif resolution in ("monthly", "quarterly", "halfyearly"):
            value = float(np.mean(aggregates))
        elif aggregation == "mean":
            value = float(np.average(aggregates, weights=aggregate_weights))
        else:
            value = float(np.sum(aggregates))
        if coverage < MIN_COVERAGE:
            value = None
        points.append({
            "period": period,
            "value": round(value, 2) if value is not None else None,
            "coverage": round(coverage, 4),
        })
    return {"variable": variable, "label": label, "unit": unit,
            "resolution": resolution, "aggregation": aggregation, "points": points}
