import { useExplorer } from "./ExplorerContext";
import { hazardMeta, isGlobalCatalog } from "./hazards";
export function useExplorerPresentation() {
  const p = useExplorer();
  const { place, result, start, end, busy, invalidRange, view } = p;
  const meta = hazardMeta[p.hazard];
  const globalCatalog = isGlobalCatalog(p.hazard);
  const nonPointSelection = p.locationMode !== "coordinates";
  const worldwideName = globalCatalog
    ? "Worldwide"
    : p.locationMode === "list"
      ? "Coordinate list"
      : p.locationMode === "bounding_box"
        ? "Bounding box"
        : p.selectedName;
  const sourceUrl =
    p.hazard === "cyclone"
      ? "https://www.ncei.noaa.gov/products/international-best-track-archive"
      : p.hazard === "earthquake"
        ? "https://earthquake.usgs.gov/fdsnws/event/1/"
        : p.hazard === "flood"
          ? "https://open-meteo.com/en/docs/flood-api"
          : "https://open-meteo.com/en/docs/historical-weather-api";
  const sourceLabel = globalCatalog
    ? p.hazard === "cyclone"
      ? "NOAA IBTrACS"
      : "USGS ComCat"
    : p.hazard === "flood"
      ? "Open-Meteo Flood · GloFAS v4"
      : "Open-Meteo · Copernicus ERA5 / ERA5-Land";
  const metricUnit = result?.methodology.threshold_unit ?? "°C";
  const method = () => {
    p.setMethodOpen(true);
    document.getElementById("methodology")?.scrollIntoView();
  };
  return {
    p,
    place,
    result,
    start,
    end,
    busy,
    invalidRange,
    view,
    meta,
    globalCatalog,
    nonPointSelection,
    worldwideName,
    sourceUrl,
    sourceLabel,
    metricUnit,
    method,
  };
}
