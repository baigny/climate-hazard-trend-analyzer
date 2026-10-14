import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import { hazardRule } from "./hazards";
import { useExplorerPresentation } from "./useExplorerPresentation";

export function Methodology() {
  const { p, result, globalCatalog } = useExplorerPresentation();
  return (
    <Accordion
      id="methodology"
      expanded={p.methodOpen}
      onChange={(_, expanded) => p.setMethodOpen(expanded)}
      disableGutters
    >
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Typography sx={{ fontWeight: 700 }}>
          Methodology, provenance &amp; limitations
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography>
            <b>Definition.</b>{" "}
            {result?.methodology.rule ?? hazardRule[p.hazard]}{" "}
            {result &&
              `${result.methodology.threshold_value != null ? `Threshold: ${result.methodology.threshold_value.toFixed(2)} ${result.methodology.threshold_unit ?? "°C"}. ` : ""}${result.methodology.baseline_coverage == null ? `Source catalog: ${result.methodology.baseline}.` : `Baseline coverage: ${(result.methodology.baseline_coverage * 100).toFixed(1)}%.`}`}
          </Typography>
          <Typography>
            <b>{globalCatalog ? "Catalog scope." : "Coverage."}</b>{" "}
            {globalCatalog
              ? "The same worldwide catalog is used regardless of selected city. Annual catalog counts are not an estimate of complete detection; historical source coverage varies and is described in the warnings."
              : "Missing days break events. At least 95% valid coverage is required in each baseline year. Analysis years below 95% are excluded from regression and rolling averages; observed counts remain visible in the data table. Invalid or implausible values are marked missing, not interpolated."}
          </Typography>
          <Typography>
            <b>Trends.</b> Five-year trailing averages use five complete
            calendar years. Regression uses adequately covered years; its slope
            is shown per decade. Five-year endpoint comparisons require ten
            years and complete windows; percentage change is undefined for a
            zero starting average.{" "}
            {result?.trend.r_squared != null &&
              `Regression R²: ${result.trend.r_squared.toFixed(3)}; p-value: ${result.trend.p_value ?? "undefined"} (ordinary least squares, no autocorrelation correction).`}
          </Typography>
          <Typography>
            <b>Duration trends.</b> Annual mean duration uses events starting in
            that year. Years without events have no defined mean duration and
            are excluded from duration regression. The five-year mean pools
            individual events across five complete, adequately covered years; it
            is undefined when the window contains no events. Duration regression
            gives each eligible annual mean equal weight.
            {result?.duration_trend?.r_squared != null &&
              ` Duration regression R²: ${result.duration_trend.r_squared.toFixed(3)}; p-value: ${result.duration_trend.p_value ?? "undefined"}.`}
          </Typography>
          <Typography>
            <b>Limits.</b>{" "}
            {result?.methodology.limitations ??
              (globalCatalog
                ? "Catalog coverage and event detection vary across geography and time."
                : "ERA5-Land reanalysis estimates a weather grid cell, not a station measurement or an administrative area average.")}{" "}
            {p.hazard === "heatwave" &&
              "This pooled annual percentile rule is a simplified case-study definition, not IMD operational criteria."}{" "}
            {globalCatalog
              ? "Event counts use the first qualifying catalog date; storm track duration uses the full best track. Trends do not establish causation."
              : "Events are counted by start year; days are split across calendar years. Boundary-touching events may be truncated. ERA5-Land reanalysis estimates a weather grid cell, not a station measurement or an administrative area average. Trends do not establish causation."}
          </Typography>
          <Typography>
            <b>Location data.</b> Community-maintained countries-states-cities
            snapshot through country-state-city 3.2.1. Some towns or
            administrative changes may be missing; use the map picker and verify
            coordinates.{" "}
            <Link
              href="https://github.com/dr5hn/countries-states-cities-database"
              target="_blank"
              rel="noreferrer"
            >
              Location source and license
            </Link>
            .
          </Typography>
          {result && (
            <Typography sx={{ overflowWrap: "anywhere" }}>
              <b>Provenance.</b> {result.provenance.attribution}{" "}
              Retrieved/processed {new Date(result.created_at).toLocaleString()}
              .{" "}
              {result.cache.analysis_hit
                ? "Analysis served from database cache."
                : `${result.cache.weather_years_hit}/${result.cache.weather_years_total} weather years reused from cache.`}{" "}
              Analysis ID: {result.id}.
            </Typography>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
