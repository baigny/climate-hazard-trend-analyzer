export type Option = { id: string; name: string };
export type City = Option & { latitude: number; longitude: number };
export type Place = {
  name: string;
  country: string;
  state: string;
  latitude: number;
  longitude: number;
  timezone: string;
  distance_km?: number;
};
export type Hazard =
  | "heatwave"
  | "heavy_rainfall"
  | "drought"
  | "wind"
  | "flood"
  | "cyclone"
  | "earthquake";
export type LocationMode = "coordinates" | "list" | "bounding_box";
export type MapVariable =
  "temperature" | "rainfall" | "dry_days" | "wind" | "discharge";
export type MapResolution =
  "monthly" | "quarterly" | "halfyearly" | "yearly" | "decades";
export type MapSeries = {
  variable: MapVariable;
  label: string;
  unit: string;
  resolution: MapResolution;
  aggregation: "mean" | "total" | "count";
  points: { period: string; value: number | null; coverage: number }[];
};
export type Annual = {
  year: number;
  events: number;
  heatwave_days?: number;
  hazard_days?: number;
  mean_duration: number;
  max_duration: number;
  mean_exceedance?: number;
  mean_intensity?: number;
  peak_tmax?: number | null;
  peak_value?: number | null;
  coverage: number | null;
  eligible: boolean;
  rolling_events: number | null;
  regression_events: number | null;
  rolling_duration: number | null;
  regression_duration: number | null;
};
export type Analysis = {
  id: string;
  created_at: string;
  parameters: {
    location: Place;
    start_year: number;
    end_year: number;
    hazard?: Hazard;
    location_mode?: LocationMode;
    locations?: Place[];
    bounding_box?: {
      south: number;
      north: number;
      west: number;
      east: number;
    } | null;
  };
  annual: Annual[];
  events: {
    source_event_id?: string;
    event_year?: number;
    start: string;
    end: string;
    duration: number;
    peak_tmax?: number;
    mean_exceedance?: number;
    peak_value?: number;
    mean_intensity?: number;
    magnitude?: number;
    max_wind_kt?: number;
    depth_km?: number;
    latitude?: number;
    longitude?: number;
    place?: string;
    name?: string;
    basin?: string;
    threshold_date?: string;
    url?: string;
    boundary_clipped: boolean;
  }[];
  event_count?: number;
  summary: {
    total_events: number;
    heatwave_days?: number;
    hazard_days?: number;
    longest_event: number;
    largest_magnitude?: number | null;
    eligible_years: number;
  };
  trend: {
    slope_per_decade: number | null;
    r_squared: number | null;
    p_value: number | null;
    eligible_years: number;
  };
  duration_trend: {
    slope_per_decade: number | null;
    r_squared: number | null;
    p_value: number | null;
    eligible_years: number;
  };
  comparison: {
    first_period: string;
    last_period: string;
    first_average: number;
    last_average: number;
    percent: number | null;
  } | null;
  insights: string[];
  warnings: string[];
  methodology: {
    threshold_c: number | null;
    threshold_value?: number | null;
    threshold_unit?: string;
    baseline: string;
    baseline_coverage: number | null;
    rule: string;
    limitations: string;
    algorithm: string;
  };
  provenance: {
    provider: string;
    attribution: string;
    spatial_scope: string;
    url: string;
  };
  cache: {
    analysis_hit: boolean;
    weather_years_hit: number;
    weather_years_total: number;
  };
};
