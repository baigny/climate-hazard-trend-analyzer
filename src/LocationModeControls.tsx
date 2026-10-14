import { Box, Tabs, Tab, TextField, Typography } from "@mui/material";
import { Crosshair, List, Scan } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocationMode } from "./types";

type Bounds = { south: string; north: string; west: string; east: string };

export function LocationModeControls({
  mode,
  onModeChange,
  coordinateList,
  onCoordinateListChange,
  bounds,
  onBoundsChange,
  error,
}: {
  mode: LocationMode;
  onModeChange: (mode: LocationMode) => void;
  coordinateList: string;
  onCoordinateListChange: (value: string) => void;
  bounds: Bounds;
  onBoundsChange: (value: Bounds) => void;
  error: string;
}) {
  const [listTouched, setListTouched] = useState(false);
  useEffect(() => setListTouched(false), [mode]);
  const showError =
    !!error &&
    (mode === "list"
      ? listTouched && !!coordinateList.trim()
      : Object.values(bounds).every((value) => value.trim() !== ""));
  const setBound = (key: keyof Bounds, value: string) =>
    onBoundsChange({ ...bounds, [key]: value });
  return (
    <Box>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Location</Typography>
      <Tabs
        aria-label="Location input"
        variant="scrollable"
        scrollButtons="auto"
        value={mode}
        onChange={(_event, value: LocationMode) => onModeChange(value)}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          maxWidth: "100%",
          width: "fit-content",
        }}
      >
        <Tab
          value="coordinates"
          label="Coordinates"
          icon={<Crosshair size={18} />}
          iconPosition="start"
        />
        <Tab
          value="list"
          label="List"
          icon={<List size={18} />}
          iconPosition="start"
        />
        <Tab
          value="bounding_box"
          label="Bounding box"
          icon={<Scan size={18} />}
          iconPosition="start"
        />
      </Tabs>
      {mode === "list" && (
        <TextField
          multiline
          minRows={5}
          maxRows={10}
          fullWidth
          label="Coordinates (latitude, longitude per line)"
          placeholder={"17.385, 78.4867\n19.076, 72.8777"}
          value={coordinateList}
          onChange={(event) => onCoordinateListChange(event.target.value)}
          onBlur={() => setListTouched(true)}
          helperText="Enter 2–10 unique WGS84 coordinates. Each line is analyzed once; weather results are arithmetic means."
          error={showError}
          sx={{ mt: 2 }}
        />
      )}
      {mode === "bounding_box" && (
        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 2,
            maxWidth: 760,
          }}
        >
          {(
            [
              ["north", "North latitude", -90, 90],
              ["west", "West longitude", -180, 180],
              ["east", "East longitude", -180, 180],
              ["south", "South latitude", -90, 90],
            ] as const
          ).map(([key, label, min, max]) => (
            <TextField
              key={key}
              type="number"
              size="small"
              label={label}
              value={bounds[key]}
              onChange={(event) => setBound(key, event.target.value)}
              slotProps={{ htmlInput: { min, max, step: "any" } }}
              sx={{
                minWidth: 0,
                ...(key === "north" || key === "south"
                  ? {
                      gridColumn: "1 / -1",
                      width: "60%",
                      justifySelf: "center",
                    }
                  : {}),
              }}
            />
          ))}
          <Box
            sx={{
              gridColumn: "1 / -1",
              typography: "caption",
              color: "text.secondary",
            }}
          >
            Up to 9 evenly spaced sample coordinates. Weather values are
            averaged across points; this is not an area-weighted gridded map.
          </Box>
        </Box>
      )}
      {showError && (
        <Box
          role="alert"
          sx={{ mt: 1, color: "error.main", typography: "caption" }}
        >
          {error}
        </Box>
      )}
    </Box>
  );
}
