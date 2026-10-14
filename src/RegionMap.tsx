import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DomEvent, type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Globe2, Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { MapDisplayControls } from "./MapDisplayControls";
import { MapInspector } from "./MapInspector";
import { MapSelection } from "./MapSelection";
import { useExplorer } from "./ExplorerContext";
import { placeLabel } from "./placeLabel";
import type { Analysis, Hazard, MapVariable, Place } from "./types";
import { useClimateTimeline } from "./useClimateTimeline";
type Props = {
  place: Place | null;
  hazard: Hazard;
  onPick: (lat: number, lon: number) => void;
  result: Analysis | null;
  busy: boolean;
  start: number;
  end: number;
};
const indiaCenter: LatLngTuple = [22.35, 80];
function MapControls({ place, onPick }: Pick<Props, "place" | "onPick">) {
  const map = useMap();
  const navigation = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useMapEvents({
    click: (e) =>
      onPick(e.latlng.lat, ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180),
  });
  useEffect(() => {
    if (place) {
      map.setView([place.latitude, place.longitude], first.current ? 5 : 7, {
        animate: false,
      });
      first.current = false;
    }
  }, [place?.latitude, place?.longitude, map]);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (navigation.current) {
      DomEvent.disableClickPropagation(navigation.current);
      DomEvent.disableScrollPropagation(navigation.current);
    }
  }, []);
  return (
    <Stack
      ref={navigation}
      sx={{ position: "absolute", left: 16, top: 74, zIndex: 800 }}
      spacing={1}
    >
      <Paper>
        <Stack>
          <IconButton aria-label="Zoom in" onClick={() => map.zoomIn()}>
            <Plus size={20} />
          </IconButton>
          <IconButton aria-label="Zoom out" onClick={() => map.zoomOut()}>
            <Minus size={20} />
          </IconButton>
        </Stack>
      </Paper>
      <Paper>
        <IconButton
          aria-label={`Focus ${placeLabel(place)}`}
          disabled={!place}
          onClick={() => {
            if (place) map.setView([place.latitude, place.longitude], 7);
          }}
        >
          <Crosshair size={20} />
        </IconButton>
      </Paper>
      <Paper>
        <IconButton
          aria-label="Show world"
          onClick={() => map.setView([20, 0], 2)}
        >
          <Globe2 size={20} />
        </IconButton>
      </Paper>
    </Stack>
  );
}
export default function RegionMap({
  place,
  hazard,
  onPick,
  result,
  busy,
  start,
  end,
}: Props) {
  const { locationMode } = useExplorer();
  const [basemap, setBasemap] = useState("street");
  const [variable, setVariable] = useState<MapVariable>("temperature");
  const [now, setNow] = useState(() => new Date());
  const [fullscreenError, setFullscreenError] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const defaultLayer: Record<Hazard, MapVariable> = {
      heatwave: "temperature",
      heavy_rainfall: "rainfall",
      drought: "dry_days",
      wind: "wind",
      flood: "discharge",
      cyclone: "temperature",
      earthquake: "temperature",
    };
    setVariable(defaultLayer[hazard]);
  }, [hazard]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const matches =
    result &&
    (locationMode === "coordinates"
      ? place &&
        Math.abs(result.parameters.location.latitude - place.latitude) <
          0.0001 &&
        Math.abs(result.parameters.location.longitude - place.longitude) <
          0.0001
      : result.parameters.location_mode === locationMode) &&
    result.parameters.start_year === start &&
    result.parameters.end_year === end &&
    (result.parameters.hazard ?? "heatwave") === hazard;
  const summary = matches && !busy ? result.summary : null;
  const timeline = useClimateTimeline(matches ? result : null, variable);
  const { series, selectedPoint } = timeline;
  const markerColor =
    variable === "temperature"
      ? "#d3593e"
      : variable === "rainfall"
        ? "#3886aa"
        : variable === "discharge"
          ? "#5ca2d1"
          : variable === "wind"
            ? "#9c83d9"
            : "#d3a83b";
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError("Fullscreen is unavailable in this browser.");
    }
  }
  return (
    <>
      <Paper
        component="section"
        id="location-map"
        aria-label="Climate location explorer"
        sx={{ mb: 3, overflow: "hidden" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", p: 2 }}>
          <Globe2 size={20} />
          <Typography variant="h2">Explore the climate record</Typography>
        </Stack>
        <Box
          className="map-explorer"
          ref={frame}
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0,1fr)",
              md: "minmax(0,1fr) 300px",
            },
            bgcolor: "background.paper",
            "&:fullscreen": { width: "100%", height: "100%", overflow: "auto" },
          }}
        >
          <Box
            className="map-canvas"
            sx={{
              position: "relative",
              height: { xs: 380, md: "auto" },
              alignSelf: "stretch",
              minHeight: { xs: 380, md: 510 },
              minWidth: 0,
              isolation: "isolate",
              "& .leaflet-container": {
                position: "absolute",
                inset: 0,
                height: "100%",
                width: "100%",
                cursor: "crosshair",
              },
              "& .leaflet-control-attribution": {
                fontSize: 9,
                maxWidth: "100%",
              },
              "& .leaflet-tooltip": { fontFamily: "inherit" },
            }}
          >
            <MapContainer
              center={indiaCenter}
              zoom={4}
              minZoom={2}
              maxZoom={16}
              zoomControl={false}
              worldCopyJump
            >
              <TileLayer
                key={basemap}
                url={
                  basemap === "street"
                    ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                }
                attribution={
                  basemap === "street"
                    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    : "Imagery &copy; Esri, Vantor, Earthstar Geographics"
                }
              />
              <MapControls place={place} onPick={onPick} />
              <MapSelection />
              {place && locationMode === "coordinates" && (
                <CircleMarker
                  center={[place.latitude, place.longitude]}
                  radius={9}
                  pathOptions={{
                    color: "#fff",
                    weight: 3,
                    fillColor: markerColor,
                    fillOpacity: 1,
                  }}
                >
                  <Tooltip direction="top">
                    {placeLabel(place)}
                    {selectedPoint?.value != null &&
                      ` · ${selectedPoint.period}: ${selectedPoint.value} ${series?.unit}`}
                  </Tooltip>
                </CircleMarker>
              )}
            </MapContainer>
            <Paper
              sx={{ position: "absolute", left: 16, top: 16, zIndex: 800 }}
            >
              <ToggleButtonGroup
                value={basemap}
                exclusive
                size="small"
                aria-label="Map background"
                onChange={(_, v) => {
                  if (v) setBasemap(v);
                }}
              >
                <ToggleButton value="street">Street</ToggleButton>
                <ToggleButton value="satellite">Satellite</ToggleButton>
              </ToggleButtonGroup>
            </Paper>
            <Paper
              sx={{ position: "absolute", right: 16, top: 16, zIndex: 800 }}
            >
              <IconButton
                aria-label="Toggle map fullscreen"
                onClick={() => void fullscreen()}
              >
                <Maximize2 size={20} />
              </IconButton>
            </Paper>
            <Chip
              label="Click the map to explore a location"
              sx={{
                position: "absolute",
                bottom: 34,
                right: 12,
                zIndex: 800,
                bgcolor: "background.paper",
                pointerEvents: "none",
                fontSize: 11,
              }}
            />
            {fullscreenError && (
              <Paper
                role="status"
                sx={{
                  position: "absolute",
                  top: 68,
                  right: 16,
                  zIndex: 800,
                  p: 1,
                }}
              >
                {fullscreenError}
              </Paper>
            )}
          </Box>
          <MapInspector
            {...{
              place,
              hazard,
              summary,
              start,
              end,
              busy,
              now,
            }}
          />
        </Box>
      </Paper>
      {matches && (
        <MapDisplayControls
          {...{ hazard, variable, setVariable, timeline, markerColor }}
        />
      )}
    </>
  );
}
