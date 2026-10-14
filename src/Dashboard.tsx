import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Link,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { lazy, Suspense } from "react";
import { AnalysisConfiguration } from "./AnalysisConfiguration";
import { AnalysisResults } from "./AnalysisResults";
import { ExplorerContext, type DashboardProps } from "./ExplorerContext";
import { Loading } from "./shared";
import { useExplorerPresentation } from "./useExplorerPresentation";
const RegionMap = lazy(() => import("./RegionMap"));
export function Dashboard(p: DashboardProps) {
  return (
    <ExplorerContext value={p}>
      <DashboardLayout />
    </ExplorerContext>
  );
}

function DashboardLayout() {
  const {
    p,
    place,
    result,
    start,
    end,
    busy,
    globalCatalog,
    sourceUrl,
    sourceLabel,
    method,
  } = useExplorerPresentation();
  return (
    <>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar sx={{ gap: 1, flexWrap: "wrap", py: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flex: 1 }}
          >
            <Layers3 />
            <Typography
              variant="h2"
              component="a"
              href="/"
              sx={{ textDecoration: "none" }}
            >
              climatrace.
            </Typography>
          </Stack>
          <Button href="#explorer">Explorer</Button>
          <Button onClick={method}>Methodology</Button>
          <Button
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            endIcon={<ArrowUpRight size={14} />}
          >
            {sourceLabel}
          </Button>
        </Toolbar>
      </AppBar>
      <Container
        component="main"
        id="explorer"
        maxWidth="xl"
        sx={{ py: { xs: 3, md: 5 } }}
      >
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          <Typography variant="overline" color="primary">
            CLIMATE HAZARD OBSERVATORY
          </Typography>
          <Typography variant="h1">
            Climate hazard intelligence.
            <br />
            <Box component="span" sx={{ color: "text.secondary" }}>
              Grounded in historical evidence.
            </Box>
          </Typography>
          <Typography color="text.secondary">
            Explore historical hazards worldwide: heatwaves, heavy rainfall,
            drought, wind and floods, tropical cyclones, and earthquakes. Track
            frequency, duration, and intensity using transparent climate and
            event records.
          </Typography>
        </Stack>
        <AnalysisConfiguration />
        {!globalCatalog && (
          <Button onClick={() => p.setMapOpen((open) => !open)} sx={{ mb: 2 }}>
            {p.mapOpen ? "Hide map" : "Show map"}
          </Button>
        )}
        {p.mapOpen && globalCatalog ? (
          <Alert severity="info" sx={{ mb: 3 }}>
            Worldwide event catalogs are not filtered to a point location. See
            the annual counts and catalog-linked event records below.
          </Alert>
        ) : (
          p.mapOpen && (
            <Suspense fallback={<Loading label="Loading map…" />}>
              <RegionMap
                place={place}
                hazard={p.hazard}
                result={result}
                busy={busy}
                start={start}
                end={end}
                onPick={p.onPick}
              />
            </Suspense>
          )
        )}
        <AnalysisResults />
        <Stack
          component="footer"
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", pt: 4 }}
        >
          <Typography variant="caption">
            CLIMATRACE / A clearer view of a changing climate.
          </Typography>
          <Link
            variant="caption"
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {sourceLabel}
          </Link>
        </Stack>
      </Container>
    </>
  );
}
