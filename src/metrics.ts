import type { Annual } from "./types";

export function eventMetric(row: Annual, value: number | null | undefined) {
  return row.eligible &&
    row.events > 0 &&
    value != null &&
    Number.isFinite(value)
    ? value
    : null;
}

export function formatEventMetric(
  row: Annual,
  value: number | null | undefined,
  digits: number,
) {
  return eventMetric(row, value)?.toFixed(digits) ?? "—";
}
