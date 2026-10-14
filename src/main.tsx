import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClientProvider, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { locationOptions, queryClient } from "./api";
import { AppBoundary } from "./AppBoundary";
import { ExplorerApp } from "./ExplorerApp";
import { Loading } from "./shared";
import { theme } from "./theme";
import type { Option } from "./types";
function ExplorerBoot() {
  const { data } = useSuspenseQuery(
    locationOptions<Option[]>("/locations/countries"),
  );
  return <ExplorerApp initialCountries={data} />;
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <QueryClientProvider client={queryClient}>
      <AppBoundary>
        <Suspense fallback={<Loading label="Loading your climate workspace" />}>
          <ExplorerBoot />
        </Suspense>
      </AppBoundary>
    </QueryClientProvider>
  </ThemeProvider>,
);
