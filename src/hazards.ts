import type { Hazard } from "./types";
export const hazardMeta: Record<
  Hazard,
  { label: string; days: string; intensity: string }
> = {
  heatwave: {
    label: "Heatwave",
    days: "Heatwave days",
    intensity: "Mean threshold exceedance",
  },
  heavy_rainfall: {
    label: "Heavy rainfall",
    days: "Heavy-rain days",
    intensity: "Mean rainfall above threshold",
  },
  drought: {
    label: "Drought",
    days: "Drought days",
    intensity: "Mean precipitation deficit",
  },
  wind: {
    label: "Wind",
    days: "Wind days",
    intensity: "Mean wind above threshold",
  },
  flood: {
    label: "Flood",
    days: "Flood days",
    intensity: "Mean discharge above threshold",
  },
  cyclone: {
    label: "Tropical cyclones",
    days: "Storm-track days",
    intensity: "Mean peak wind",
  },
  earthquake: {
    label: "Earthquakes (M5.0+)",
    days: "Largest magnitude",
    intensity: "Mean magnitude",
  },
};
export const hazardRule: Record<Hazard, string> = {
  heatwave:
    "At least 3 consecutive days above the 95th percentile of daily maximum temperature in the fixed 1981–2010 baseline.",
  heavy_rainfall:
    "Daily precipitation above the 95th percentile of wet-day totals (at least 1 mm) in the fixed 1981–2010 baseline.",
  drought: "At least 10 consecutive days with daily precipitation below 1 mm.",
  cyclone:
    "Count unique worldwide IBTrACS storms that reach at least 34 knots.",
  earthquake:
    "Count worldwide USGS ComCat events with catalog magnitude at least 5.0.",
  wind: "One or more consecutive days when ERA5 maximum 10 m wind speed is above the location's 1991–2020 95th percentile.",
  flood:
    "One or more consecutive days when GloFAS river discharge is above the selected location's 1991–2020 95th percentile.",
};

export const isGlobalCatalog = (hazard: Hazard) =>
  hazard === "cyclone" || hazard === "earthquake";
