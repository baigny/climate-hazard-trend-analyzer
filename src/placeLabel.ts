import type { Place } from "./types";

export function placeLabel(place: Place | null): string {
  return place
    ? [
        ...new Set([place.name, place.state, place.country].filter(Boolean)),
      ].join(", ")
    : "Choose a location";
}
