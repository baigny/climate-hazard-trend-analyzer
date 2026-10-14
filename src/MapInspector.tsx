import { Box, Divider, Link, Stack, Typography } from "@mui/material";
import { ArrowUpRight, MapPin } from "lucide-react";
import { hazardMeta } from "./hazards";
import { MapRecord } from "./MapRecord";
import { useExplorer } from "./ExplorerContext";
import { placeLabel } from "./placeLabel";
import type { Analysis, Hazard, Place } from "./types";
type Props = {
  place: Place | null;
  hazard: Hazard;
  summary: Analysis["summary"] | null;
  start: number;
  end: number;
  busy: boolean;
  now: Date;
};
export function MapInspector({
  place,
  hazard,
  summary,
  start,
  end,
  busy,
  now,
}: Props) {
  const { locationMode } = useExplorer();
  const locationLabel =
    locationMode === "coordinates"
      ? placeLabel(place)
      : locationMode === "list"
        ? "Coordinate list"
        : "Bounding box";
  const coordinate = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(4)}\u00b0 ${v < 0 ? neg : pos}`;
  return (
    <Stack
      component="aside"
      aria-label={`Location details for ${locationLabel}`}
      spacing={2}
      sx={{
        gridColumn: { xs: 1, md: 2 },
        gridRow: { xs: 2, md: 1 },
        p: 3,
        bgcolor: "#192c40",
        color: "#f2f7fa",
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <MapPin size={22} />
        <Box>
          <Typography variant="overline" sx={{ color: "#92cfb8" }}>
            LOCATION INTELLIGENCE
          </Typography>
          <Typography variant="h3">{locationLabel}</Typography>
        </Box>
      </Stack>
      {locationMode === "coordinates" && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Location details
          </Typography>
          {place?.distance_km != null && (
            <Typography
              variant="caption"
              sx={{ color: "#b8c9d7", display: "block", mb: 1 }}
            >
              Nearest listed settlement, {place.distance_km} km away. Data uses
              the clicked coordinates.
            </Typography>
          )}
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2">Latitude</Typography>
            <Typography variant="body2">
              {place ? coordinate(place.latitude, "N", "S") : "—"}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2">Longitude</Typography>
            <Typography variant="body2">
              {place ? coordinate(place.longitude, "E", "W") : "—"}
            </Typography>
          </Stack>
        </Box>
      )}
      <Divider sx={{ borderColor: "#ffffff25" }} />
      <Typography variant="subtitle2">
        {hazardMeta[hazard].label} record · {start}–{end}
      </Typography>
      <MapRecord summary={summary} busy={busy} />
      <Divider sx={{ borderColor: "#ffffff25" }} />
      <Typography role="status" variant="caption" sx={{ color: "#b8c9d7" }}>
        {busy
          ? `Loading historical data for ${placeLabel(place)}…`
          : start > end
            ? "Choose an ordered historical period."
            : summary
              ? `${summary.eligible_years} years meet data coverage requirements`
              : "Choose a location and click Analyze trends."}
      </Typography>
      <Link
        href="#analysis-results"
        sx={{
          color: "#92cfb8",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        Explore trends &amp; analysis <ArrowUpRight size={16} />
      </Link>
      <Typography
        variant="caption"
        aria-label="Current date in India"
        sx={{ color: "#b8c9d7" }}
      >
        Today · IST ·{" "}
        {now.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        })}
      </Typography>
    </Stack>
  );
}
