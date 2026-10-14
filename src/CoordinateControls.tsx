import { Box, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { SelectField } from "./SelectField";
import { useExplorer } from "./ExplorerContext";

const availableTimezones = Intl.supportedValuesOf("timeZone");

export function CoordinateControls() {
  const { place, onCoordinates } = useExplorer();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [timezone, setTimezone] = useState("auto");
  const timezones = Array.from(
    new Set([
      "auto",
      "UTC",
      timezone,
      ...(place?.timezone ? [place.timezone] : []),
      ...availableTimezones,
    ]),
  );
  useEffect(() => {
    setLatitude(place ? String(place.latitude) : "");
    setLongitude(place ? String(place.longitude) : "");
    setTimezone(place?.timezone ?? "auto");
  }, [place]);
  const valid =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Math.abs(Number(latitude)) <= 90 &&
    Math.abs(Number(longitude)) <= 180;
  const applyCoordinates = (zone = timezone) => {
    if (
      valid &&
      (place?.latitude !== Number(latitude) ||
        place?.longitude !== Number(longitude) ||
        place?.timezone !== zone)
    )
      onCoordinates(Number(latitude), Number(longitude), zone);
  };
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2,minmax(0,1fr))",
          lg: "repeat(3,minmax(0,1fr))",
        },
        gap: 2,
        mt: 2,
        alignItems: "center",
      }}
    >
      <TextField
        label="Latitude"
        type="number"
        value={latitude}
        required
        onBlur={() => applyCoordinates()}
        onChange={(e) => setLatitude(e.target.value)}
        slotProps={{ htmlInput: { min: -90, max: 90, step: "any" } }}
      />
      <TextField
        label="Longitude"
        type="number"
        value={longitude}
        required
        onBlur={() => applyCoordinates()}
        onChange={(e) => setLongitude(e.target.value)}
        slotProps={{ htmlInput: { min: -180, max: 180, step: "any" } }}
      />
      <SelectField
        label="Timezone"
        value={timezone}
        onChange={(zone) => {
          setTimezone(zone);
          applyCoordinates(zone);
        }}
        options={timezones.map((zone) => ({
          value: zone,
          label:
            zone === "auto"
              ? "Automatically detect"
              : zone === "UTC"
                ? "GMT+0 (UTC)"
                : zone,
        }))}
      />
    </Box>
  );
}
