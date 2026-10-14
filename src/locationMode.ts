import type { LocationMode, Place } from "./types";

export type BoundingBoxInput = {
  south: string;
  north: string;
  west: string;
  east: string;
};

export function parseCoordinateList(
  input: string,
  template: Place | null,
): Place[] | null {
  if (!template) return null;
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines.length > 10) return null;
  const points: Place[] = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split(",");
    const values = parts.map((part) => Number(part.trim()));
    if (
      values.length !== 2 ||
      parts.some((part) => !part.trim()) ||
      !values.every(Number.isFinite) ||
      values[0] < -90 ||
      values[0] > 90 ||
      values[1] < -180 ||
      values[1] > 180
    ) {
      return null;
    }
    points.push({
      ...template,
      name: `Coordinate ${index + 1}`,
      latitude: values[0],
      longitude: values[1],
    });
  }
  const keys = points.map(
    (point) => `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`,
  );
  return new Set(keys).size === keys.length ? points : null;
}

export function parseBoundingBox(input: BoundingBoxInput) {
  if (Object.values(input).some((value) => !value.trim())) return null;
  const bounds = {
    south: Number(input.south),
    north: Number(input.north),
    west: Number(input.west),
    east: Number(input.east),
  };
  if (
    Object.values(bounds).some((value) => !Number.isFinite(value)) ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south >= bounds.north ||
    bounds.west >= bounds.east
  ) {
    return null;
  }
  return bounds;
}

export function locationScopeReady(
  mode: LocationMode,
  place: Place | null,
  list: string,
  bounds: BoundingBoxInput,
) {
  if (mode === "coordinates") return !!place;
  if (mode === "list") return !!parseCoordinateList(list, place);
  return !!parseBoundingBox(bounds);
}
