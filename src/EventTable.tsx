import {
  Alert,
  Button,
  Chip,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { API } from "./api";
import { placeLabel } from "./placeLabel";
import type { Analysis } from "./types";

export function EventTable({ analysis }: { analysis: Analysis }) {
  const hazard = analysis.parameters.hazard ?? "heatwave";
  const globalCatalog = hazard === "cyclone" || hazard === "earthquake";
  const hazardName =
    hazard === "heatwave"
      ? "heatwave"
      : hazard === "heavy_rainfall"
        ? "heavy-rainfall"
        : hazard === "drought"
          ? "drought"
          : hazard === "wind"
            ? "wind"
            : hazard === "flood"
              ? "flood"
              : hazard === "cyclone"
                ? "tropical cyclone"
                : "magnitude 5.0+ earthquake";
  const valueUnit =
    hazard === "heatwave"
      ? "°C"
      : hazard === "wind"
        ? "km/h"
        : hazard === "flood"
          ? "m³/s"
          : "mm/day";
  const peakLabel =
    hazard === "heatwave"
      ? "Peak temperature"
      : hazard === "heavy_rainfall"
        ? "Peak daily rainfall"
        : hazard === "drought"
          ? "Highest rainfall in spell"
          : hazard === "wind"
            ? "Peak wind speed"
            : "Peak river discharge";
  const differenceLabel =
    hazard === "heatwave"
      ? "Mean temperature exceedance"
      : hazard === "heavy_rainfall"
        ? "Mean rainfall above threshold"
        : hazard === "drought"
          ? "Mean precipitation deficit in spell"
          : hazard === "wind"
            ? "Mean wind above threshold"
            : "Mean discharge above threshold";
  const [page, setPage] = useState(0),
    [items, setItems] = useState<Analysis["events"]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const total = analysis.event_count ?? analysis.events.length;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setItems([]);
    fetch(
      `${API}/api/analyses/${analysis.id}/events?offset=${page * 10}&limit=10`,
      {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15_000),
        ]),
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load events. Please retry.");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setItems(data.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [analysis.id, page, retry]);
  const columns =
    hazard === "cyclone"
      ? ["Threshold reached", "Storm", "Basin", "Track duration", "Peak wind"]
      : hazard === "earthquake"
        ? ["Origin time (UTC)", "Magnitude", "Location", "Depth", "Source"]
        : ["Start date", "End date", "Duration", peakLabel, differenceLabel];
  return (
    <Paper component="section" sx={{ mb: 3, overflow: "hidden" }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", p: 2.5 }}>
        <Stack spacing={0.5}>
          <Typography variant="h3">
            {globalCatalog
              ? `Worldwide ${hazardName} events`
              : `Detected ${hazardName} events for ${placeLabel(analysis.parameters.location)}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {globalCatalog
              ? `${analysis.provenance.provider} · `
              : `${placeLabel(analysis.parameters.location)} · `}
            {analysis.parameters.start_year}–{analysis.parameters.end_year}
          </Typography>
        </Stack>
        <Chip size="small" label={`${total} events`} />
      </Stack>
      {busy && <LinearProgress aria-label="Loading detected events" />}
      {error && (
        <Alert
          severity="error"
          action={<Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
        >
          {error}
        </Alert>
      )}
      <TableContainer>
        <Table
          size="small"
          aria-label={`Detected ${hazardName} events`}
          aria-busy={busy}
        >
          <TableHead>
            <TableRow>
              {columns.map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.source_event_id ?? e.start}>
                {hazard === "cyclone" ? (
                  <>
                    <TableCell>{e.threshold_date ?? e.start}</TableCell>
                    <TableCell>{e.name}</TableCell>
                    <TableCell>{e.basin || "—"}</TableCell>
                    <TableCell>
                      {e.duration} days{e.boundary_clipped ? " *" : ""}
                    </TableCell>
                    <TableCell>
                      {e.max_wind_kt?.toFixed(1) ?? "—"} knots
                    </TableCell>
                  </>
                ) : hazard === "earthquake" ? (
                  <>
                    <TableCell>{e.start}</TableCell>
                    <TableCell>{e.magnitude?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell>{e.place}</TableCell>
                    <TableCell>{e.depth_km?.toFixed(1) ?? "—"} km</TableCell>
                    <TableCell>
                      {e.url ? (
                        <Link href={e.url} target="_blank" rel="noreferrer">
                          USGS
                        </Link>
                      ) : (
                        "USGS"
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      {e.start}
                      {e.boundary_clipped ? " *" : ""}
                    </TableCell>
                    <TableCell>{e.end}</TableCell>
                    <TableCell>{e.duration} days</TableCell>
                    <TableCell>
                      {(e.peak_value ?? e.peak_tmax)?.toFixed(1) ?? "—"}{" "}
                      {valueUnit}
                    </TableCell>
                    <TableCell>
                      {(e.mean_intensity ?? e.mean_exceedance)?.toFixed(2) ??
                        "—"}{" "}
                      {valueUnit}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!busy && !error && !total && (
        <Typography sx={{ p: 2 }}>
          No qualifying events in this period.
        </Typography>
      )}
      {total > 10 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "flex-end", alignItems: "center", p: 2 }}
        >
          <Typography variant="body2">
            Page {page + 1} of {Math.ceil(total / 10)}
          </Typography>
          <Button
            disabled={!page || busy}
            onClick={() => setPage((n) => n - 1)}
          >
            Previous
          </Button>
          <Button
            disabled={(page + 1) * 10 >= total || busy}
            onClick={() => setPage((n) => n + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
