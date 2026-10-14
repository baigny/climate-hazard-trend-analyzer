import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Activity, ShieldCheck } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loading } from "./shared";
import { useExplorerPresentation } from "./useExplorerPresentation";
import { formatEventMetric } from "./metrics";
const TrendChart = lazy(() => import("./TrendChart"));

export function TrendPanel() {
  const {
    p,
    result,
    start,
    end,
    busy,
    view,
    meta,
    globalCatalog,
    worldwideName,
    metricUnit,
  } = useExplorerPresentation();
  return (
    <Paper component="section" sx={{ mb: 3, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
        }}
      >
        <Box>
          <Typography variant="h3">{meta.label} trends</Typography>
          <Typography variant="body2" color="text.secondary">
            {worldwideName} · {start}–{end} · Annual results; one decade = 10
            years
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={p.tab}
          exclusive
          size="small"
          aria-label="Results display"
          onChange={(_, v) => {
            if (v) p.setTab(v);
          }}
        >
          <ToggleButton value="chart">Chart</ToggleButton>
          <ToggleButton value="table">Data</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Tabs
        value={view}
        onChange={(_, v) => p.setView(v)}
        aria-label={`${meta.label} metric`}
        variant="scrollable"
        sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
      >
        {[
          "frequency",
          ...(p.hazard === "earthquake" ? [] : ["duration"]),
          "intensity",
        ].map((k) => (
          <Tab
            key={k}
            value={k}
            label={k.charAt(0).toUpperCase() + k.slice(1)}
          />
        ))}
      </Tabs>
      {busy ? (
        <Loading
          label={
            globalCatalog
              ? "Reading the worldwide event catalog"
              : "Reading the climate record"
          }
        />
      ) : !result ? (
        <Stack
          spacing={2}
          sx={{ alignItems: "center", py: 8, px: 2, textAlign: "center" }}
        >
          <Activity size={32} />
          <Typography variant="h3">
            A longer view of {meta.label.toLowerCase()}
          </Typography>
          <Typography color="text.secondary">
            {globalCatalog
              ? `Choose a time period to explore worldwide ${meta.label.toLowerCase()} records.`
              : `Choose a location and time period to explore its historical ${meta.label.toLowerCase()} record.`}
          </Typography>
          <Chip
            icon={<ShieldCheck size={15} />}
            label="Historical source data · calculated hazard indicators"
            variant="outlined"
          />
        </Stack>
      ) : p.tab === "table" ? (
        <TableContainer>
          <Table
            size="small"
            aria-label={`Annual ${meta.label.toLowerCase()} statistics`}
          >
            <TableHead>
              <TableRow>
                {(globalCatalog
                  ? p.hazard === "cyclone"
                    ? [
                        "Year",
                        "Tropical cyclones",
                        "Storm-track days",
                        "Mean track duration",
                        "Mean peak wind (knots)",
                        "Peak wind (knots)",
                      ]
                    : [
                        "Year",
                        "Earthquakes (M5.0+)",
                        "Mean magnitude",
                        "Largest magnitude",
                      ]
                  : [
                      "Year",
                      "Events",
                      meta.days,
                      "Mean duration",
                      `${meta.intensity} (${metricUnit})`,
                      "Coverage",
                    ]
                ).map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {result.annual.map((row) => (
                <TableRow key={row.year}>
                  <TableCell>{row.year}</TableCell>
                  <TableCell>{row.events}</TableCell>
                  {globalCatalog ? (
                    p.hazard === "cyclone" ? (
                      <>
                        <TableCell>{row.hazard_days}</TableCell>
                        <TableCell>
                          {row.events ? `${row.mean_duration} days` : "—"}
                        </TableCell>
                        <TableCell>
                          {formatEventMetric(row, row.mean_intensity, 1)}
                        </TableCell>
                        <TableCell>
                          {row.peak_value?.toFixed(1) ?? "—"}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          {formatEventMetric(row, row.mean_intensity, 2)}
                        </TableCell>
                        <TableCell>
                          {row.peak_value?.toFixed(2) ?? "—"}
                        </TableCell>
                      </>
                    )
                  ) : (
                    <>
                      <TableCell>
                        {row.hazard_days ?? row.heatwave_days}
                      </TableCell>
                      <TableCell>
                        {row.events ? `${row.mean_duration} days` : "—"}
                      </TableCell>
                      <TableCell>
                        {formatEventMetric(
                          row,
                          row.mean_intensity ?? row.mean_exceedance,
                          2,
                        )}
                      </TableCell>
                      <TableCell
                        sx={{ color: row.eligible ? undefined : "error.main" }}
                      >
                        {row.coverage == null
                          ? "—"
                          : `${(row.coverage * 100).toFixed(1)}%`}
                        {!row.eligible ? " *" : ""}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Suspense fallback={<Loading label="Loading visualization…" />}>
          <TrendChart
            rows={p.chartData!}
            view={view}
            hazard={p.hazard}
            rolling={p.rolling}
            regression={p.regression}
          />
        </Suspense>
      )}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {view !== "intensity" ? (
          <Stack direction="row" sx={{ flexWrap: "wrap" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={p.rolling}
                  onChange={(e) => p.setRolling(e.target.checked)}
                />
              }
              label={
                view === "duration" ? "5-year pooled mean" : "5-year average"
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={p.regression}
                  onChange={(e) => p.setRegression(e.target.checked)}
                />
              }
              label="Regression"
            />
          </Stack>
        ) : (
          <Typography variant="body2">
            {meta.intensity} ({metricUnit})
          </Typography>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ alignSelf: "center" }}
        >
          Source:{" "}
          {result?.provenance.provider ??
            (globalCatalog ? "Worldwide event catalog" : "ERA5-Land")}
        </Typography>
      </Stack>
      {view === "duration" && p.hazard !== "earthquake" && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Years without events have no defined mean duration. The 5-year line
            pools events across five adequately covered calendar years.
          </Typography>
          <Typography variant="body2" aria-label="Duration trend">
            {result?.duration_trend?.slope_per_decade != null
              ? `Fitted duration trend: ${result.duration_trend.slope_per_decade > 0 ? "+" : ""}${result.duration_trend.slope_per_decade.toFixed(2)} days per decade (${result.duration_trend.eligible_years} years containing events).`
              : "Duration regression requires at least three adequately covered years containing events."}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
