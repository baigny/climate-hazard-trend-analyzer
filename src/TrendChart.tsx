import { Box, Typography } from "@mui/material";
import { memo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Hazard } from "./types";
const labels = {
  frequency: "Events",
  duration: "Mean event duration (days)",
  intensity: "Mean threshold difference",
};
type ChartRow = {
  year: number;
  events: number | null;
  mean_duration: number | null;
  mean_intensity?: number | null;
  rolling_events: number | null;
  regression_events: number | null;
  rolling_duration: number | null;
  regression_duration: number | null;
};
export default memo(function TrendChart({
  rows,
  view,
  hazard,
  rolling,
  regression,
}: {
  rows: ChartRow[];
  view: keyof typeof labels;
  hazard: Hazard;
  rolling: boolean;
  regression: boolean;
}) {
  const hazardLabel =
    hazard === "heatwave"
      ? "Heatwave"
      : hazard === "heavy_rainfall"
        ? "Heavy-rainfall"
        : hazard === "drought"
          ? "Drought"
          : hazard === "wind"
            ? "Wind"
            : hazard === "flood"
              ? "Flood"
              : hazard === "cyclone"
                ? "Tropical cyclone"
                : "Earthquake (M5.0+)";
  const metricLabel =
    view === "frequency"
      ? `${hazardLabel} events`
      : view === "duration"
        ? labels.duration
        : hazard === "heatwave"
          ? "Mean temperature exceedance (°C)"
          : hazard === "heavy_rainfall"
            ? "Mean rainfall above threshold (mm/day)"
            : hazard === "drought"
              ? "Mean precipitation deficit (mm/day)"
              : hazard === "wind"
                ? "Mean wind above threshold (km/h)"
                : hazard === "flood"
                  ? "Mean discharge above threshold (m³/s)"
                  : hazard === "cyclone"
                    ? "Mean peak wind (knots)"
                    : "Mean magnitude";
  const metricKey =
    view === "frequency"
      ? "events"
      : view === "duration"
        ? "mean_duration"
        : "mean_intensity";
  return (
    <Box sx={{ p: 2.5, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {metricLabel}
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={rows}
          margin={{ top: 14, right: 20, left: -20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d9804e" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#d9804e" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e8ebe5"
          />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#849088" }}
            minTickGap={35}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#849088" }}
            allowDecimals={view !== "frequency"}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e2e7df",
              fontSize: 12,
            }}
            labelFormatter={(v) => `Year ${v}`}
          />
          {view === "frequency" ? (
            <Bar
              isAnimationActive={false}
              dataKey={metricKey}
              name={metricLabel}
              fill="#df956a"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
            />
          ) : (
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey={metricKey}
              name={metricLabel}
              stroke="#d17743"
              fill="url(#trendFill)"
              strokeWidth={2}
            />
          )}{" "}
          {view !== "intensity" && rolling && (
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey={
                view === "duration" ? "rolling_duration" : "rolling_events"
              }
              name={
                view === "duration"
                  ? "5-year pooled mean duration"
                  : "5-year rolling average"
              }
              stroke="#244d3f"
              dot={false}
              strokeWidth={2.4}
              connectNulls={false}
            />
          )}{" "}
          {view !== "intensity" && regression && (
            <Line
              isAnimationActive={false}
              dataKey={
                view === "duration"
                  ? "regression_duration"
                  : "regression_events"
              }
              name="Linear regression"
              stroke="#839c8b"
              dot={false}
              strokeWidth={1.8}
              strokeDasharray="5 4"
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
});
