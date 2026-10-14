import { Box, Chip, Stack, Typography } from "@mui/material";
import { SelectField } from "./SelectField";
import { useExplorer } from "./ExplorerContext";

export const lastCompleteYear = new Date().getFullYear() - 1;
export const minimumYear = (hazard: string) =>
  hazard === "flood" ? 1984 : 1950;

export function TimeControls() {
  const { start, end, setStart, setEnd, hazard, invalidRange } = useExplorer();
  const first = minimumYear(hazard);
  const years = Array.from(
    { length: lastCompleteYear - first + 1 },
    (_, i) => lastCompleteYear - i,
  );
  return (
    <Stack spacing={2} sx={{ my: 2 }}>
      <Typography variant="h3">Time</Typography>
      <Box
        role="group"
        aria-label="Quick historical periods"
        sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}
      >
        {Array.from(
          { length: Math.floor((lastCompleteYear - 1950) / 10) + 1 },
          (_, i) => 1950 + i * 10,
        )
          .filter((year) => year >= first)
          .map((year) => {
            const last = Math.min(year + 9, lastCompleteYear);
            return (
              <Chip
                key={year}
                label={`${year}–${last}`}
                clickable
                color={start === year && end === last ? "primary" : "default"}
                onClick={() => {
                  setStart(year);
                  setEnd(last);
                }}
              />
            );
          })}
      </Box>
      <Stack direction="row" spacing={2}>
        {(
          [
            ["From", start, setStart],
            ["To", end, setEnd],
          ] as const
        ).map(([label, value, change]) => (
          <SelectField
            key={label}
            label={label}
            value={value}
            error={invalidRange}
            onChange={(value) => change(Number(value))}
            options={years.map((year) => ({
              value: year,
              label: String(year),
            }))}
          />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Decade shortcuts cover ten complete calendar years. Custom From / To
        ranges are inclusive.
      </Typography>
    </Stack>
  );
}
