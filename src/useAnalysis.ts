import { useEffect, useRef, useState } from "react";
import { API } from "./api";
import { isGlobalCatalog } from "./hazards";
import {
  parseBoundingBox,
  parseCoordinateList,
  type BoundingBoxInput,
} from "./locationMode";
import type { Analysis, Hazard, LocationMode, Place } from "./types";
const worldwidePlace: Place = {
  name: "Worldwide",
  country: "Worldwide",
  state: "",
  latitude: 0,
  longitude: 0,
  timezone: "UTC",
};
export function useAnalysis({
  place,
  requestLocation,
  start,
  end,
  hazard,
  locationMode,
  coordinateList,
  bounds,
  scopeReady,
  invalidRange,
}: {
  place: Place | null;
  requestLocation: Place;
  start: number;
  end: number;
  hazard: Hazard;
  locationMode: LocationMode;
  coordinateList: string;
  bounds: BoundingBoxInput;
  scopeReady: boolean;
  invalidRange: boolean;
}) {
  const [result, setResult] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const analysisAbort = useRef<AbortController | null>(null);
  function submitAnalysis(_data: FormData) {
    if ((scopeReady || isGlobalCatalog(hazard)) && !invalidRange && !busy)
      void analyzePlace(requestLocation, start, end, hazard);
  }
  async function analyzePlace(
    location: Place,
    startYear: number,
    endYear: number,
    selectedHazard: Hazard,
    selectedMode: LocationMode = locationMode,
    selectedList = coordinateList,
    selectedBounds = bounds,
  ) {
    analysisAbort.current?.abort();
    const controller = new AbortController();
    analysisAbort.current = controller;
    setBusy(true);
    setResult(null);
    setError("");
    const request = ++requestNumber.current;
    try {
      const globalCatalog = isGlobalCatalog(selectedHazard);
      const requestMode = globalCatalog ? "coordinates" : selectedMode;
      const requestPlace = globalCatalog ? worldwidePlace : location;
      const { distance_km: _distance, ...analysisLocation } = requestPlace;
      const response = await fetch(`${API}/api/analyses?include_events=false`, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(600_000),
        ]),
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: analysisLocation,
          location_mode: requestMode,
          ...(requestMode === "list"
            ? { locations: parseCoordinateList(selectedList, requestPlace) }
            : {}),
          ...(requestMode === "bounding_box"
            ? { bounding_box: parseBoundingBox(selectedBounds) }
            : {}),
          start_year: startYear,
          end_year: endYear,
          hazard: selectedHazard,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(
          typeof failure?.detail === "string"
            ? failure.detail
            : `Historical data request failed (${response.status}). Please retry.`,
        );
      }
      const data: Analysis = await response.json();
      if (request === requestNumber.current) {
        setResult(data);
      }
    } catch (e) {
      if (request === requestNumber.current && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Analysis failed. Please retry.",
        );
    } finally {
      if (request === requestNumber.current) setBusy(false);
    }
  }
  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    return () => {
      ++requestNumber.current;
      analysisAbort.current?.abort();
    };
  }, [
    place,
    start,
    end,
    hazard,
    locationMode,
    coordinateList,
    bounds,
    scopeReady,
  ]);
  return {
    result,
    setResult,
    busy,
    error,
    setError,
    submitAnalysis,
    analyzePlace,
    retryPending: busy,
    abortAnalysis: () => analysisAbort.current?.abort(),
  };
}
