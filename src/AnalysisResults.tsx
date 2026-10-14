import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Activity,
  ArrowDownToLine,
  Clock3,
  Flame,
  MapPin,
  Thermometer,
} from "lucide-react";
import { EventTable } from "./EventTable";
import { hazardRule } from "./hazards";
import { Methodology } from "./Methodology";
import { Metric } from "./shared";
import { TrendPanel } from "./TrendPanel";
import { useExplorerPresentation } from "./useExplorerPresentation";

export function AnalysisResults() {
  const {
    p,
    place,
    result,
    start,
    end,
    busy,
    meta,
    globalCatalog,
    nonPointSelection,
    worldwideName,
    method,
  } = useExplorerPresentation();
  return (
    <Box id="analysis-results" sx={{ scrollMarginTop: 24 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", mb: 3 }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <MapPin size={20} />
            <Typography variant="h2">
              {["drought", "wind", "flood"].includes(p.hazard)
                ? `${meta.label} Analysis`
                : globalCatalog
                  ? `Worldwide ${meta.label.toLowerCase()} analysis`
                  : nonPointSelection
                    ? `${meta.label} analysis for ${p.locationMode === "bounding_box" ? "bounding box" : "coordinate list"}`
                    : place
                      ? `${meta.label} analysis for ${p.selectedName}`
                      : "Choose a location"}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {["drought", "wind", "flood"].includes(p.hazard)
              ? `${worldwideName} · ${start}–${end}`
              : globalCatalog
                ? `${start}–${end} · Worldwide catalog; location-independent`
                : nonPointSelection
                  ? `${start}–${end} · Arithmetic mean of sampled points`
                  : place
                    ? `${place.state ? place.state + " · " : ""}${start}–${end} · ${meta.label} analysis`
                    : "Select a location to load historical data"}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            disabled={!result || !!p.downloadBusy || busy}
            onClick={() => p.download("csv")}
            startIcon={<ArrowDownToLine size={16} />}
          >
            CSV
          </Button>
          <Button
            variant="outlined"
            disabled={!result || !!p.downloadBusy || busy}
            onClick={() => p.download("pdf")}
            startIcon={<ArrowDownToLine size={16} />}
          >
            {p.downloadBusy ? "Exporting…" : "Report"}
          </Button>
        </Stack>
      </Stack>
      {p.error && (
        <Alert severity="error" onClose={() => p.setError("")} sx={{ mb: 2 }}>
          {p.error}
        </Alert>
      )}
      {!result && !busy && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {p.error
            ? "No analysis is available yet. Select “Analyze trends” to retry loading the summary and charts."
            : globalCatalog
              ? "Select a worldwide event hazard and historical period, then click Analyze trends."
              : nonPointSelection
                ? "Enter valid coordinates or bounding-box limits, then click Analyze trends."
                : "Choose a city, coordinates, or map point, then click Analyze trends."}
        </Alert>
      )}
      {busy && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {globalCatalog
            ? `Loading worldwide ${meta.label.toLowerCase()} catalog for ${start}–${end}. The first request can take a few minutes.`
            : nonPointSelection
              ? `Loading ${p.locationMode === "bounding_box" ? "bounding-box" : "coordinate-list"} ${meta.label.toLowerCase()} data for ${start}–${end}.`
              : `Loading historical data for ${p.selectedName}, ${start}–${end}. The first request for a location can take a few minutes.`}
          <LinearProgress sx={{ mt: 1 }} />
        </Alert>
      )}
      {result && (
        <Box
          component="section"
          aria-label="Analysis summary"
          aria-busy={busy}
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2,minmax(0,1fr))",
              lg: "repeat(4,minmax(0,1fr))",
            },
            gap: 2,
            mb: 3,
          }}
        >
          <Metric
            icon={<Flame size={20} />}
            label={`TOTAL ${meta.label.toUpperCase()} EVENTS`}
            value={result?.summary.total_events}
            unit="events"
            detail={
              result
                ? `${worldwideName} · ${start}–${end} (${p.annualYears} years)`
                : meta.label === "Heatwave"
                  ? "Qualifying 3+ day events"
                  : globalCatalog
                    ? "Unique events in the worldwide catalog"
                    : "Events detected by the selected climate rule"
            }
          />
          <Metric
            icon={<Thermometer size={20} />}
            label={
              globalCatalog && p.hazard === "earthquake"
                ? "LARGEST MAGNITUDE"
                : meta.days.toUpperCase()
            }
            value={
              p.hazard === "earthquake"
                ? (result?.summary.largest_magnitude ?? undefined)
                : (result?.summary.hazard_days ?? result?.summary.heatwave_days)
            }
            unit={p.hazard === "earthquake" ? "magnitude" : "days"}
            detail={
              p.hazard === "earthquake"
                ? "Largest USGS catalog magnitude"
                : globalCatalog
                  ? "Days across qualifying storm tracks"
                  : "Days within qualifying events"
            }
          />
          <Metric
            icon={<Clock3 size={20} />}
            label={p.hazard === "earthquake" ? "EVENT CUTOFF" : "LONGEST EVENT"}
            value={
              p.hazard === "earthquake" ? "≥ 5.0" : result?.summary.longest_event
            }
            unit={p.hazard === "earthquake" ? "magnitude" : "days"}
            detail={
              p.hazard === "earthquake"
                ? "USGS preferred magnitude ≥ 5.0"
                : globalCatalog
                  ? "Full best-track lifetime"
                  : `Consecutive ${meta.label.toLowerCase()} days`
            }
          />
          <Metric
            icon={<Activity size={20} />}
            label="FREQUENCY TREND"
            value={
              result?.trend.slope_per_decade == null
                ? undefined
                : `${result.trend.slope_per_decade > 0 ? "+" : ""}${result.trend.slope_per_decade.toFixed(2)}`
            }
            unit="events / decade"
            detail={`Change in annual ${meta.label.toLowerCase()} event count per 10 years`}
          />
        </Box>
      )}
      <TrendPanel />
      {!!result?.warnings.length && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {result.warnings.map((w) => (
            <Typography key={w} variant="body2">
              {w}
            </Typography>
          ))}
        </Alert>
      )}
      {result && <EventTable key={result.id} analysis={result} />}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
          gap: 3,
          mb: 3,
        }}
      >
        <Paper component="section" sx={{ p: 3, bgcolor: "#edf5f1" }}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            What the data tells us
          </Typography>
          {result ? (
            result.insights.map((insight, i) => (
              <Typography key={i} sx={{ mb: 1 }}>
                {insight.replace(
                  "this location and period",
                  `${p.selectedName} during ${start}–${end}`,
                )}
              </Typography>
            ))
          ) : (
            <Typography color="text.secondary">
              Your analysis will summarize {meta.label.toLowerCase()} event
              frequency, duration, and the limits of what the data can tell us.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Calculated from historical data, without AI-generated claims.
          </Typography>
        </Paper>
        <Paper component="section" sx={{ p: 3 }}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            What counts as {meta.label.toLowerCase()}?
          </Typography>
          <Typography variant="body2" sx={{ my: 2 }}>
            {result?.methodology.rule ?? hazardRule[p.hazard]}
          </Typography>
          {result && result.methodology.threshold_value != null && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Calculated threshold:{" "}
              {(
                result.methodology.threshold_value ??
                result.methodology.threshold_c
              ).toFixed(2)}{" "}
              {result.methodology.threshold_unit ?? "°C"}
            </Typography>
          )}
          <Button onClick={method}>View full methodology</Button>
        </Paper>
      </Box>
      <Methodology />
    </Box>
  );
}
