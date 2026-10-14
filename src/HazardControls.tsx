import { Box, Button, Typography } from "@mui/material";
import { useExplorer } from "./ExplorerContext";
import { hazardMeta, hazardRule, isGlobalCatalog } from "./hazards";
import type { Hazard } from "./types";

export function HazardControls() {
  const { hazard, setHazard } = useExplorer();
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        Climate hazards and event catalogs
      </Typography>
      <Box
        role="group"
        aria-label="Hazard"
        sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}
      >
        {(Object.keys(hazardMeta) as Hazard[]).map((value) => (
          <Button
            key={value}
            type="button"
            aria-pressed={hazard === value}
            variant={hazard === value ? "contained" : "outlined"}
            onClick={() => setHazard(value)}
          >
            {hazardMeta[value].label}
          </Button>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {hazardRule[hazard]}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {isGlobalCatalog(hazard)
          ? hazard === "cyclone"
            ? "Source: NOAA IBTrACS worldwide cyclone catalog."
            : "Source: USGS ComCat worldwide earthquake catalog. Earthquakes are geophysical hazards."
          : hazard === "flood"
            ? "Source: Open-Meteo Flood API / GloFAS river discharge."
            : "Source: Open-Meteo Historical Weather API / ERA5 and ERA5-Land."}
      </Typography>
    </Box>
  );
}
