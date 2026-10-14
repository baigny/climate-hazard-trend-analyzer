import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  CartesianGrid,
  Tooltip as ChartTooltip,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { MapResolution } from "./types";
import type { useMapSeries } from "./useMapSeries";

type Props = Omit<ReturnType<typeof useMapSeries>, "setSelectedIndex"> & {
  setSelectedIndex: (index: number) => void;
  resolution: MapResolution;
  markerColor: string;
  chartPoints: ReturnType<typeof useMapSeries>["points"];
  contextLabel: string;
};
export function MapTimeline({
  series,
  seriesBusy,
  seriesError,
  retrySeries,
  selectedIndex,
  setSelectedIndex,
  points,
  selectedPoint,
  resolution,
  markerColor,
  chartPoints,
  contextLabel,
}: Props) {
  if (seriesError)
    return (
      <Stack spacing={1}>
        <Typography role="alert" color="error">
          {seriesError}
        </Typography>
        <Button onClick={retrySeries}>Retry map data</Button>
      </Stack>
    );
  if (!series)
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center" }}
        role="status"
      >
        {seriesBusy && <CircularProgress size={18} />}
        <Typography variant="body2">
          {seriesBusy
            ? "Loading climate timeline..."
            : "Run Analyze trends to load the climate timeline."}
        </Typography>
      </Stack>
    );
  const selected = Math.min(selectedIndex, Math.max(points.length - 1, 0));
  return (
    <Stack spacing={2} aria-label={`${series.label} timeline`}>
      <Typography variant="subtitle2" aria-live="polite">
        {contextLabel}
      </Typography>
      <TextField
        select
        fullWidth
        size="small"
        label="Period"
        value={selected}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(event) => setSelectedIndex(Number(event.target.value))}
      >
        {points.map((point, index) => (
          <MenuItem key={point.period} value={index}>
            {point.period}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ px: 1 }}>
        <Slider
          aria-label={`Select a ${resolution} map period`}
          aria-valuetext={selectedPoint?.period}
          value={selected}
          min={0}
          max={Math.max(points.length - 1, 0)}
          disabled={points.length < 2}
          onChange={(_, value) => {
            if (typeof value === "number") setSelectedIndex(value);
          }}
        />
      </Box>
      <Stack
        direction="row"
        sx={{
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h3" aria-live="polite">
            {selectedPoint?.value == null
              ? "No data"
              : `${selectedPoint.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${series.unit}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {series.label} · {selectedPoint?.period}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {selectedPoint
            ? `${(selectedPoint.coverage * 100).toFixed(1)}% valid data`
            : "No period selected"}
        </Typography>
      </Stack>
      <Box
        aria-label={`Graph: ${contextLabel}`}
        sx={{ height: 220, minWidth: 0 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
          >
            <CartesianGrid stroke="#dce5eb" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#617684" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              width={45}
              tick={{ fontSize: 10, fill: "#617684" }}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              labelFormatter={(value) => String(value)}
              formatter={(value) => [
                value == null ? "No data" : `${value} ${series.unit}`,
                series.label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={markerColor}
              strokeWidth={2}
              dot={chartPoints.length === 1 ? { r: 4 } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {series.aggregation === "mean"
          ? "Period mean"
          : series.aggregation === "total"
            ? "Period total"
            : "Count of dry days"}
        .
        {resolution === "decades"
          ? " Decades are clipped to the analyzed range."
          : resolution === "yearly"
            ? " Annual values within the selected decade."
            : " Values are for the selected year only."}
      </Typography>
    </Stack>
  );
}
