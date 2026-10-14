import { useEffect, useState } from "react";
import type { Analysis, MapResolution, MapVariable } from "./types";
import { useMapSeries } from "./useMapSeries";

type Selection = {
  analysisId?: string;
  decade: number;
  year: number | null;
  resolution: MapResolution;
};

export function useClimateTimeline(
  analysis: Analysis | null,
  variable: MapVariable,
) {
  const first = analysis?.parameters.start_year ?? 1990;
  const last = analysis?.parameters.end_year ?? first;
  const [selection, setSelection] = useState<Selection | null>(null);
  const current: Selection =
    selection?.analysisId === analysis?.id && selection
      ? selection
      : {
          analysisId: analysis?.id,
          decade: Math.floor(first / 10) * 10,
          year: null,
          resolution: "decades",
        };
  const { decade, year, resolution } = current;
  const decades = Array.from(
    { length: Math.floor(last / 10) - Math.floor(first / 10) + 1 },
    (_, i) => {
      const value = Math.floor(first / 10) * 10 + i * 10;
      return {
        value,
        label: `${Math.max(first, value)}\u2013${Math.min(last, value + 9)}`,
      };
    },
  );
  const yearStart = Math.max(first, decade);
  const years = Array.from(
    { length: Math.max(0, Math.min(last, decade + 9) - yearStart + 1) },
    (_, i) => yearStart + i,
  );
  const data = useMapSeries(
    analysis?.id,
    variable,
    resolution,
    resolution === "decades"
      ? undefined
      : resolution === "yearly"
        ? { decade }
        : { year: year ?? undefined },
  );
  const update = (next: Partial<Selection>) =>
    setSelection({ ...current, ...next });
  useEffect(() => {
    if (!data.points.length) return;
    const index =
      resolution === "decades"
        ? decades.findIndex((option) => option.value === decade)
        : resolution === "yearly"
          ? data.points.findIndex((point) => point.period === String(year))
          : -1;
    if (index >= 0) data.setSelectedIndex(index);
  }, [data.points, resolution, decade, year]);
  function selectPeriod(index: number) {
    data.setSelectedIndex(index);
    if (resolution === "decades" && decades[index])
      update({ decade: decades[index].value });
    if (resolution === "yearly" && data.points[index])
      update({ year: Number(data.points[index].period) });
  }
  return {
    ...data,
    resolution,
    decade,
    year,
    decades,
    years,
    ready: !!analysis,
    rangeLabel: `${first}\u2013${last}`,
    selectDecade: (value: number) =>
      update({ decade: value, year: null, resolution: "decades" }),
    selectYear: (value: string) =>
      update({
        year: value ? Number(value) : null,
        resolution: value ? "yearly" : "decades",
      }),
    selectResolution: (value: MapResolution) => {
      if (value === "decades") update({ resolution: value, year: null });
      else if (year !== null) update({ resolution: value });
    },
    setSelectedIndex: selectPeriod,
  };
}
