import {
  Alert,
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { CoordinateControls } from "./CoordinateControls";
import { HazardControls } from "./HazardControls";
import { LocationModeControls } from "./LocationModeControls";
import { LocationPicker } from "./LocationPicker";
import { AnalysisPeriodControls } from "./AnalysisPeriodControls";
import { useExplorerPresentation } from "./useExplorerPresentation";

export function AnalysisConfiguration() {
  const { p, place, globalCatalog } = useExplorerPresentation();
  const [hideMapWhenAnalyzing, setHideMapWhenAnalyzing] = useState(true);
  return (
    <Paper
      component="form"
      id="analysis-configuration"
      onSubmit={(event) => {
        event.preventDefault();
        if (hideMapWhenAnalyzing) p.setMapOpen(false);
        p.submitAnalysis(new FormData(event.currentTarget));
        requestAnimationFrame(() => {
          document.getElementById("analysis-results")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }}
      aria-label="Configure analysis"
      sx={{ p: { xs: 2, md: 3 }, mb: 3 }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}
      >
        <SlidersHorizontal size={20} />
        <Typography variant="h2">Location and Time</Typography>
      </Stack>
      <HazardControls />
      {p.locationError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {p.locationError}
        </Alert>
      )}
      {globalCatalog ? (
        <Alert severity="info">
          Worldwide catalog analysis: the selected city does not filter cyclone
          or earthquake results. Event records come from one catalog source per
          hazard.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <LocationModeControls
            mode={p.locationMode}
            onModeChange={p.setLocationMode}
            coordinateList={p.coordinateList}
            onCoordinateListChange={p.setCoordinateList}
            bounds={p.bounds}
            onBoundsChange={p.setBounds}
            error={
              p.locationMode !== "coordinates" && !p.locationScopeReady
                ? p.locationMode === "list"
                  ? "Enter 2–10 unique, valid latitude/longitude pairs."
                  : "Enter valid bounds with south < north and west < east."
                : ""
            }
          />
          {p.locationMode === "coordinates" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(3,minmax(0,1fr))",
                },
                gap: 2,
              }}
            >
              <LocationPicker
                label="Country"
                value={p.country}
                options={p.countries}
                onChange={p.onCountry}
              />
              <LocationPicker
                label={
                  p.country === "IN"
                    ? "State / Union Territory"
                    : "State / Province / Region"
                }
                value={p.state}
                options={p.states}
                disabled={!p.states.length}
                onChange={p.onState}
              />
              <LocationPicker
                label="City / Town"
                value={p.city}
                options={
                  place && p.city && !p.cities.some((c) => c.id === p.city)
                    ? [{ id: p.city, name: place.name }, ...p.cities]
                    : p.cities
                }
                disabled={!p.state}
                loading={p.citiesLoading}
                onSearch={p.onSearch}
                more={p.cities.length < p.cityTotal}
                onMore={p.onMore}
                onChange={p.onCity}
              />
            </Box>
          )}
          {p.locationMode === "coordinates" && <CoordinateControls />}
        </Stack>
      )}
      <Divider sx={{ my: 3 }} />
      <AnalysisPeriodControls />
      <FormControlLabel
        control={
          <Checkbox
            checked={hideMapWhenAnalyzing}
            onChange={(event) => setHideMapWhenAnalyzing(event.target.checked)}
          />
        }
        label="Hide map when analyzing"
      />
    </Paper>
  );
}
