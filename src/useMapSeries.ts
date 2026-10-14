import { useEffect, useState } from "react";
import { api } from "./api";
import type { MapResolution, MapSeries, MapVariable } from "./types";

type SeriesState = {
  key: string;
  data: MapSeries | null;
  error: string;
  busy: boolean;
};
export function useMapSeries(
  analysisId: string | undefined,
  variable: MapVariable,
  resolution: MapResolution,
  scope?: { year?: number; decade?: number },
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SeriesState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scopeQuery = `${scope?.year == null ? "" : `&year=${scope.year}`}${scope?.decade == null ? "" : `&decade=${scope.decade}`}`;
  const key = `${analysisId}:${variable}:${resolution}:${scopeQuery}:${attempt}`;
  useEffect(() => {
    setSelectedIndex(0);
    if (!analysisId) return;
    const controller = new AbortController();
    setState({ key, data: null, error: "", busy: true });
    api<MapSeries>(
      `/analyses/${analysisId}/series?variable=${variable}&resolution=${resolution}${scopeQuery}`,
      { signal: controller.signal },
    ).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ key, data, error: "", busy: false });
      },
      (error: Error) => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: error.message, busy: false });
      },
    );
    return () => controller.abort();
  }, [analysisId, variable, resolution, key]);
  // Hide old data during render, before the request effect runs.
  const current = state?.key === key && analysisId ? state : null;
  const series = current?.data ?? null;
  const points = series?.points ?? [];
  const selectedPoint =
    points[Math.min(selectedIndex, Math.max(points.length - 1, 0))];
  return {
    series,
    seriesBusy: current?.busy ?? !!analysisId,
    seriesError: current?.error ?? "",
    selectedIndex,
    setSelectedIndex,
    points,
    selectedPoint,
    retrySeries: () => setAttempt((value) => value + 1),
  };
}
