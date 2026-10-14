import { useEffect, useMemo, useRef, useState } from "react";
import { API } from "./api";
import { Dashboard } from "./Dashboard";
import { isGlobalCatalog } from "./hazards";
import { eventMetric } from "./metrics";
import {
  parseBoundingBox,
  parseCoordinateList,
  type BoundingBoxInput,
} from "./locationMode";
import { placeLabel } from "./placeLabel";
import { lastCompleteYear, minimumYear } from "./TimeControls";
import type { Hazard, LocationMode, Option, Place } from "./types";
import { useAnalysis } from "./useAnalysis";
import { useLocationCatalog } from "./useLocationCatalog";
type View = "frequency" | "duration" | "intensity";
export function ExplorerApp({
  initialCountries,
}: {
  initialCountries: Option[];
}) {
  const [place, setPlace] = useState<Place | null>(null),
    [start, setStart] = useState(1990),
    [end, setEnd] = useState(2020);
  const {
    countries,
    states,
    cities,
    country,
    state,
    city,
    cityTotal,
    citiesLoading,
    setCities,
    setCountry,
    setState,
    setCity,
    setCityQuery,
    setCityOffset,
    boot,
    locationError,
    setLocationError,
  } = useLocationCatalog(initialCountries, setPlace);
  const placeLookup = useRef<AbortController | null>(null);
  useEffect(() => () => placeLookup.current?.abort(), []);
  const [locationMode, setLocationMode] = useState<LocationMode>("coordinates");
  const [coordinateList, setCoordinateList] = useState("");
  const [bounds, setBounds] = useState<BoundingBoxInput>({
    south: "",
    north: "",
    west: "",
    east: "",
  });
  const [hazard, setHazard] = useState<Hazard>("heatwave");
  const [view, setView] = useState<View>("frequency"),
    [tab, setTab] = useState<"chart" | "table">("chart"),
    [mapOpen, setMapOpen] = useState(true),
    [methodOpen, setMethodOpen] = useState(false),
    [downloadBusy, setDownloadBusy] = useState("");
  const [rolling, setRolling] = useState(true),
    [regression, setRegression] = useState(true);
  useEffect(() => {
    if (hazard === "earthquake" && view === "duration") setView("frequency");
  }, [hazard, view]);
  useEffect(() => {
    setStart((year) => Math.max(year, minimumYear(hazard)));
  }, [hazard]);
  const selectedName = isGlobalCatalog(hazard)
    ? "Worldwide"
    : placeLabel(place);
  const invalidRange =
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < minimumYear(hazard) ||
    end > lastCompleteYear ||
    start > end ||
    end - start + 1 > 80;
  const requestLocation = useMemo(
    () =>
      place ?? {
        name: "Selected coordinates",
        country:
          countries.find((option) => option.id === country)?.name ?? country,
        state: "",
        latitude: 0,
        longitude: 0,
        timezone: "auto",
      },
    [place, countries, country],
  );
  const selectedLocations = useMemo(
    () => parseCoordinateList(coordinateList, requestLocation),
    [coordinateList, requestLocation],
  );
  const selectedBounds = useMemo(() => parseBoundingBox(bounds), [bounds]);
  const scopeReady =
    locationMode === "coordinates"
      ? !!place
      : locationMode === "list"
        ? !!selectedLocations
        : !!selectedBounds;
  const {
    result,
    setResult,
    busy,
    error,
    setError,
    submitAnalysis,
    retryPending,
    abortAnalysis,
  } = useAnalysis({
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
  });
  async function download(format: "csv" | "pdf") {
    if (!result) return;
    setDownloadBusy(format);
    setError("");
    try {
      const response = await fetch(
        `${API}/api/analyses/${result.id}/export.${format}`,
      );
      if (!response.ok)
        throw new Error(`Export failed (${response.status}). Please retry.`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `climatrace-${result.parameters.location.name.replace(/[^a-z0-9]/gi, "-")}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadBusy("");
    }
  }
  // Hide stale results immediately when the draft selection changes.
  const resultLocationMatches =
    !!result &&
    (locationMode === "coordinates"
      ? !!place &&
        result.parameters.location_mode !== "list" &&
        result.parameters.location_mode !== "bounding_box" &&
        result?.parameters.location.name === place.name &&
        Math.abs(result.parameters.location.latitude - place.latitude) <
          0.0001 &&
        Math.abs(result.parameters.location.longitude - place.longitude) <
          0.0001
      : locationMode === "list"
        ? !!selectedLocations &&
          result.parameters.location_mode === "list" &&
          result.parameters.locations?.length === selectedLocations.length &&
          result.parameters.locations.every(
            (location, index) =>
              location.latitude.toFixed(4) ===
                selectedLocations[index].latitude.toFixed(4) &&
              location.longitude.toFixed(4) ===
                selectedLocations[index].longitude.toFixed(4),
          )
        : !!selectedBounds &&
          result.parameters.location_mode === "bounding_box" &&
          JSON.stringify(result.parameters.bounding_box) ===
            JSON.stringify(selectedBounds));
  const currentResult =
    result &&
    (isGlobalCatalog(hazard) || resultLocationMatches) &&
    result.parameters.start_year === start &&
    result.parameters.end_year === end &&
    (result.parameters.hazard ?? "heatwave") === hazard
      ? result
      : null;
  const metricKey: "events" | "mean_duration" | "mean_intensity" =
    view === "frequency"
      ? "events"
      : view === "duration"
        ? "mean_duration"
        : "mean_intensity";
  const chartData = useMemo(
    () =>
      currentResult?.annual.map((row) => ({
        ...row,
        [metricKey]:
          view === "frequency"
            ? row.eligible
              ? row.events
              : null
            : eventMetric(
                row,
                view === "duration"
                  ? row.mean_duration
                  : (row.mean_intensity ?? row.mean_exceedance),
              ),
      })),
    [currentResult, metricKey, view],
  );
  const annualYears = currentResult?.annual.length || 0;

  return (
    <Dashboard
      {...{
        countries,
        states,
        cities,
        country,
        state,
        city,
        place,
        locationMode,
        locationScopeReady: scopeReady,
        coordinateList,
        bounds,
        hazard,
        start,
        end,
        result: currentResult,
        busy,
        error,
        locationError,
        view,
        tab,
        mapOpen,
        methodOpen,
        downloadBusy,
        rolling,
        regression,
        invalidRange,
        citiesLoading,
        cityTotal,
        submitAnalysis,
        retryPending,
        chartData,
        annualYears,
        selectedName,
        download,
        setStart,
        setEnd,
        setHazard,
        setLocationMode,
        setCoordinateList,
        setBounds,
        setMapOpen,
        setMethodOpen,
        setRolling,
        setRegression,
        setTab,
        setView,
        setError,
      }}
      onCountry={(id) => {
        if (id === country) return;
        placeLookup.current?.abort();
        boot.current = false;
        setState("");
        setCity("");
        setPlace(null);
        setCities([]);
        setCityQuery("");
        setCityOffset(0);
        setCountry(id);
      }}
      onState={(id) => {
        if (id === state) return;
        placeLookup.current?.abort();
        boot.current = false;
        setState(id);
        setCity("");
        setPlace(null);
        setCities([]);
        setCityQuery("");
        setCityOffset(0);
      }}
      onCity={(id) => {
        placeLookup.current?.abort();
        const c = cities.find((c) => c.id === id);
        if (c) {
          boot.current = false;
          setCity(id);
          setPlace({
            name: c.name,
            latitude: c.latitude,
            longitude: c.longitude,
            country: countries.find((o) => o.id === country)?.name || country,
            state: states.find((o) => o.id === state)?.name || "",
            timezone: country === "IN" ? "Asia/Kolkata" : "auto",
          });
        }
      }}
      onSearch={(q) => {
        setCityQuery(q);
        setCityOffset(0);
      }}
      onMore={() => setCityOffset((n) => n + 100)}
      onCoordinates={(latitude, longitude, timezone = "auto") => {
        placeLookup.current?.abort();
        boot.current = false;
        setCity("");
        setPlace({
          name: "Selected coordinates",
          country: "Unspecified",
          state: "",
          latitude,
          longitude,
          timezone,
        });
      }}
      onPick={async (latitude, longitude) => {
        setLocationMode("coordinates");
        boot.current = false;
        placeLookup.current?.abort();
        const controller = new AbortController();
        placeLookup.current = controller;
        setCity("");
        setPlace(null);
        setLocationError("");
        setResult(null);
        abortAnalysis();
        try {
          const response = await fetch(
            `${API}/api/locations/reverse?latitude=${latitude}&longitude=${longitude}`,
            {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(15_000),
              ]),
              cache: "no-store",
            },
          );
          if (!response.ok)
            throw new Error(
              "Could not identify this place. Please select the map location again.",
            );
          const namedPlace: Place = await response.json();
          if (!controller.signal.aborted) setPlace(namedPlace);
        } catch (e) {
          if (!controller.signal.aborted)
            setLocationError((e as Error).message);
        }
      }}
    />
  );
}
