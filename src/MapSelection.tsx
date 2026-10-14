import { useEffect, useMemo } from "react";
import { CircleMarker, Rectangle, useMap } from "react-leaflet";
import { useExplorer } from "./ExplorerContext";
import { parseBoundingBox, parseCoordinateList } from "./locationMode";

export function MapSelection() {
  const { locationMode, coordinateList, bounds, place } = useExplorer();
  const map = useMap();
  const locations = useMemo(
    () => (place ? parseCoordinateList(coordinateList, place) : null),
    [coordinateList, place],
  );
  const box = useMemo(() => parseBoundingBox(bounds), [bounds]);
  useEffect(() => {
    if (locationMode === "list" && locations)
      map.fitBounds(
        locations.map((point) => [point.latitude, point.longitude]),
        { padding: [30, 30], maxZoom: 9, animate: false },
      );
    if (locationMode === "bounding_box" && box)
      map.fitBounds(
        [
          [box.south, box.west],
          [box.north, box.east],
        ],
        { padding: [30, 30], maxZoom: 9, animate: false },
      );
  }, [locationMode, locations, box, map]);
  if (locationMode === "bounding_box" && box)
    return (
      <Rectangle
        bounds={[
          [box.south, box.west],
          [box.north, box.east],
        ]}
        pathOptions={{ color: "#215b58" }}
      />
    );
  if (locationMode === "list" && locations)
    return (
      <>
        {locations.map((point) => (
          <CircleMarker
            key={`${point.latitude},${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={6}
            pathOptions={{ color: "#215b58" }}
          />
        ))}
      </>
    );
  return null;
}
