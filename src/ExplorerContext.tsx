import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  Analysis,
  Annual,
  City,
  Hazard,
  LocationMode,
  Option,
  Place,
} from "./types";
type Setter<T> = Dispatch<SetStateAction<T>>;
type View = "frequency" | "duration" | "intensity";
export type DashboardProps = {
  countries: Option[];
  states: Option[];
  cities: City[];
  country: string;
  state: string;
  city: string;
  place: Place | null;
  locationMode: LocationMode;
  locationScopeReady: boolean;
  setLocationMode: Setter<LocationMode>;
  coordinateList: string;
  setCoordinateList: Setter<string>;
  bounds: { south: string; north: string; west: string; east: string };
  setBounds: Setter<{
    south: string;
    north: string;
    west: string;
    east: string;
  }>;
  hazard: Hazard;
  start: number;
  end: number;
  result: Analysis | null;
  busy: boolean;
  error: string;
  locationError: string;
  view: View;
  tab: "chart" | "table";
  mapOpen: boolean;
  methodOpen: boolean;
  downloadBusy: string;
  rolling: boolean;
  regression: boolean;
  invalidRange: boolean;
  citiesLoading: boolean;
  cityTotal: number;
  submitAnalysis: (data: FormData) => void;
  retryPending: boolean;
  chartData: Annual[] | undefined;
  annualYears: number;
  selectedName: string;
  download: (format: "csv" | "pdf") => Promise<void>;
  setStart: Setter<number>;
  setEnd: Setter<number>;
  setHazard: Setter<Hazard>;
  setMapOpen: Setter<boolean>;
  setMethodOpen: Setter<boolean>;
  setRolling: Setter<boolean>;
  setRegression: Setter<boolean>;
  setTab: Setter<"chart" | "table">;
  setView: Setter<View>;
  setError: Setter<string>;
  onCountry: (id: string) => void;
  onState: (id: string) => void;
  onCity: (id: string) => void;
  onSearch: (q: string) => void;
  onMore: () => void;
  onCoordinates: (lat: number, lon: number, timezone?: string) => void;
  onPick: (lat: number, lon: number) => void;
};

export const ExplorerContext = createContext<DashboardProps | null>(null);
export function useExplorer() {
  const state = useContext(ExplorerContext);
  if (!state) throw new Error("Explorer sections require ExplorerContext");
  return state;
}
