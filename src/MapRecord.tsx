import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useExplorer } from "./ExplorerContext";
import type { Analysis } from "./types";

export function MapRecord({
  summary,
  busy,
}: {
  summary: Analysis["summary"] | null;
  busy: boolean;
}) {
  const { error } = useExplorer();
  return (
    <Box className="map-headline-stat">
      {summary ? (
        <>
          <Typography variant="h2" sx={{ fontSize: "2.5rem" }}>
            {summary.total_events.toLocaleString()}
          </Typography>
          <Typography variant="body2">qualifying events</Typography>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mt: 2 }}
          >
            <Box>
              <Typography variant="h3">
                {summary.hazard_days ?? summary.heatwave_days ?? "—"}
              </Typography>
              <Typography variant="caption">Hazard days</Typography>
            </Box>
            <Box>
              <Typography variant="h3">
                {summary.longest_event ?? "—"} days
              </Typography>
              <Typography variant="caption">Longest event</Typography>
            </Box>
          </Stack>
        </>
      ) : busy ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CircularProgress size={22} sx={{ color: "#92cfb8" }} />
          <Typography variant="body2">Analyzing selected period…</Typography>
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Typography variant="body2">
            {error
              ? "Analysis could not load. See the error below and retry."
              : "Click Analyze trends to load data for this location and period."}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
