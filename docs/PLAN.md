# Climate Hazard Trend Analyzer - Implementation Plan

## Goal

Build a simple full-stack app to explore historical climate hazards for a selected location and period. Keep Heatwave as the default and prioritize a working end-to-end analysis.

## 1. Project setup

- [x] Set up React/TypeScript in `src/` and Python/FastAPI in `backend/`.
- [x] Add a health endpoint at `/api/health`.
- [x] Configure MongoDB and environment variables, with TinyDB for local development.
- [x] Connect the frontend to the backend.

## 2. Weather data and caching

- [x] Retrieve historical weather using location coordinates and selected years.
- [x] Normalize dates and units and handle missing or invalid observations.
- [x] Store source data and analysis reports.
- [x] Reuse cached data and handle provider errors/timeouts.

## 3. Heatwave detection

- [x] Detect at least three consecutive days above the local 95th-percentile maximum-temperature threshold.
- [x] Use a fixed 1981-2010 baseline and expose the method with results.
- [x] Treat missing days as breaks in events.
- [x] Calculate event dates, duration, annual frequency, and affected days.
- [x] Add tests for event detection and missing-data behavior.

## 4. Backend API

- [x] Submit analysis through `POST /api/analyses`.
- [x] Validate location and year inputs and return clear errors.
- [x] Return cached or newly calculated metrics and summaries as JSON.
- [x] Add request throttling and reuse cached results.

## 5. Dashboard

- [x] Add city/coordinate selection and common start/end year controls.
- [x] Keep Heatwave selected initially.
- [x] Add one Analyze trends button with loading and error states.
- [x] Show frequency, duration, and intensity charts.
- [x] Show event summaries and factual insights from calculations.

## 6. Additional features

- [x] Add map selection, point lists, and sampled bounding boxes.
- [x] Add event pagination and decade/year timeline exploration.
- [x] Add CSV and PDF exports.
- [x] Add rolling statistics and linear regression.
- [x] Add heavy rainfall, drought/dry-spell, wind, and river flood indicators.
- [x] Add worldwide cyclone and earthquake catalogs; earthquakes are geophysical hazards.

## 7. Verification and delivery

- [x] Add checks for invalid inputs, data gaps, API failures, and cache reuse.
- [x] Verify the local analysis flow, charts, and exports.
- [x] Prepare Docker and deployment configuration.
- [x] Document installation, configuration, and run commands in README.
- [x] Deploy publicly and verify a complete analysis on the hosted app.
- [x] Verify the public repository and deployed URLs before submission.

Verified the hosted Mumbai heatwave analysis for 2020–2024: frequency, duration, and intensity charts, plus CSV and PDF downloads. Confirmed the GitHub repository is public and the Render API health endpoint reports MongoDB storage and ready location data.

- Public repository: https://github.com/baigny/climate-hazard-trend-analyzer
- Hosted frontend: https://climatrace-baigny.netlify.app/
- Hosted backend: https://climate-hazard-trend-analyzer-q4jl.onrender.com/

## Scope notes

City analysis uses a location point. Country/state controls filter cities. Lists and boxes use sampled inputs, rather than complete regional coverage. Cyclone and earthquake catalogs are worldwide views. Insights describe historical results, not future predictions.
