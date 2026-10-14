import { Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
export function Metric({
  icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value?: number | string;
  unit: string;
  detail: string;
}) {
  return (
    <Paper component="article" sx={{ p: 2.5 }}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Box sx={{ color: "secondary.main" }}>{icon}</Box>
      </Stack>
      <Typography
        className="metric-value"
        variant="h2"
        sx={{ my: 1, fontSize: "2rem" }}
      >
        {value ?? "—"}{" "}
        <Typography component="span" variant="body2" color="text.secondary">
          {unit}
        </Typography>
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Paper>
  );
}
export function Loading({ label }: { label: string }) {
  return (
    <Stack spacing={2} sx={{ alignItems: "center", p: 6 }} role="status">
      <CircularProgress />
      <Typography>{label}</Typography>
    </Stack>
  );
}
