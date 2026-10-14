import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { Activity } from "lucide-react";
import { TimeControls } from "./TimeControls";
import { useExplorerPresentation } from "./useExplorerPresentation";

export function AnalysisPeriodControls() {
  const { p, start, end, busy, invalidRange, globalCatalog } =
    useExplorerPresentation();
  const missingLocation = !p.locationScopeReady && !globalCatalog;
  const guidance = invalidRange
    ? "Choose an ordered range of at most 80 years."
    : missingLocation
      ? p.locationMode === "list"
        ? "Enter 2–10 unique latitude, longitude pairs to enable Analyze trends."
        : p.locationMode === "bounding_box"
          ? "Complete the four valid bounding-box limits to enable Analyze trends."
          : "Choose a city, map point, or valid coordinates to enable Analyze trends."
      : "Click Analyze trends to apply your location and period. Clicking a map location automatically loads its analysis.";
  return (
    <Box
      component="section"
      aria-label="Time and analysis"
      data-testid="shared-analysis-period"
    >
      <TimeControls />
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        sx={{ alignItems: { lg: "center" } }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>Historical period</Typography>
          <Typography
            variant="body2"
            color={invalidRange ? "error" : "text.secondary"}
          >
            {invalidRange
              ? "Check From and To years."
              : `${end - start + 1} complete calendar years`}
          </Typography>
        </Box>
        <Button
          variant="contained"
          type="submit"
          aria-describedby="analysis-guidance"
          disabled={missingLocation || invalidRange || busy || p.retryPending}
          startIcon={
            busy ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Activity size={17} />
            )
          }
        >
          {busy ? "Analyzing…" : "Analyze trends"}
        </Button>
      </Stack>
      <Typography
        id="analysis-guidance"
        variant="caption"
        color={invalidRange ? "error" : "text.secondary"}
        sx={{ display: "block", mt: 2 }}
      >
        {guidance}
      </Typography>
    </Box>
  );
}
