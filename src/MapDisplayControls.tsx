import {
  Box,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import { useExplorer } from "./ExplorerContext";
import { MapTimeline } from "./MapTimeline";
import { SelectField } from "./SelectField";
import type { Hazard, MapResolution, MapVariable } from "./types";
import type { useClimateTimeline } from "./useClimateTimeline";

type Props = {
  hazard: Hazard;
  variable: MapVariable;
  setVariable: Dispatch<SetStateAction<MapVariable>>;
  timeline: ReturnType<typeof useClimateTimeline>;
  markerColor: string;
};
const steps: { value: MapResolution; label: string }[] = [
  { value: "decades", label: "Decades" },
  { value: "yearly", label: "Yearly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "halfyearly", label: "Half-yearly" },
];

export function MapDisplayControls({
  hazard,
  variable,
  setVariable,
  timeline,
  markerColor,
}: Props) {
  const { locationMode } = useExplorer();
  const { decade, year, decades, years, resolution, rangeLabel } = timeline;
  const decadeLabel =
    decades.find((option) => option.value === decade)?.label ?? rangeLabel;
  const context =
    resolution === "decades"
      ? `Decade overview: ${rangeLabel}`
      : resolution === "yearly"
        ? `Annual values: ${decadeLabel} \u00b7 selected year ${year}`
        : `${steps.find((step) => step.value === resolution)?.label} values for ${year}`;
  const layers: { value: MapVariable; label: string }[] =
    hazard === "wind"
      ? [{ value: "wind", label: "Wind speed" }]
      : hazard === "flood"
        ? [{ value: "discharge", label: "River discharge" }]
        : [
            { value: "temperature", label: "Temperature" },
            { value: "rainfall", label: "Rainfall" },
            { value: "dry_days", label: "Dry days" },
          ];
  return (
    <Paper
      component="section"
      aria-label="Map display controls"
      sx={{ p: { xs: 2, md: 3 }, mb: 3 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h2">Climate timeline</Typography>
          <Typography variant="body2" color="text.secondary">
            Analyzed range: {rangeLabel}. Choose a decade, then a year for more
            detail.
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Climate variable
          </Typography>
          <ToggleButtonGroup
            value={variable}
            exclusive
            size="small"
            aria-label="Climate map layer"
            onChange={(_, value: MapVariable | null) => {
              if (value) setVariable(value);
            }}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              "& .MuiToggleButton-root": {
                flex: "1 0 auto",
                whiteSpace: "nowrap",
              },
            }}
          >
            {layers.map((layer) => (
              <ToggleButton key={layer.value} value={layer.value}>
                {layer.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0,1fr)",
              sm: "repeat(2,minmax(0,1fr))",
            },
            gap: 2,
          }}
        >
          <SelectField
            label="Decade"
            value={decade}
            options={decades}
            onChange={(value) => timeline.selectDecade(Number(value))}
          />
          <SelectField
            label="Year"
            value={year === null ? "" : String(year)}
            options={[
              { value: "", label: "Whole decade" },
              ...years.map((value) => ({
                value: String(value),
                label: String(value),
              })),
            ]}
            onChange={timeline.selectYear}
          />
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Time step
          </Typography>
          <ToggleButtonGroup
            value={resolution}
            exclusive
            size="small"
            aria-label="Map time resolution"
            onChange={(_, value: MapResolution | null) => {
              if (value) timeline.selectResolution(value);
            }}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              "& .MuiToggleButton-root": {
                flex: "1 0 auto",
                whiteSpace: "nowrap",
              },
            }}
          >
            {steps
              .filter((step) => year !== null || step.value === "decades")
              .map((step) => (
                <ToggleButton key={step.value} value={step.value}>
                  {step.label}
                </ToggleButton>
              ))}
          </ToggleButtonGroup>
          {year === null && (
            <Typography variant="caption" color="text.secondary">
              Select a year to show yearly, monthly, quarterly, and half-yearly
              views.
            </Typography>
          )}
        </Box>
        <Box sx={{ minHeight: 500 }}>
          <MapTimeline
            {...timeline}
            markerColor={markerColor}
            chartPoints={timeline.points}
            contextLabel={context}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {locationMode === "coordinates"
            ? "Values describe the selected model grid cell."
            : "Values describe the arithmetic mean across selected samples."}{" "}
          To explore a year outside {rangeLabel}, change From/To above and click
          Analyze trends.
        </Typography>
      </Stack>
    </Paper>
  );
}
