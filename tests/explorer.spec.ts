import { test, expect, type Page } from "@playwright/test";

const annual = Array.from({ length: 11 }, (_, i) => ({
  year: 2010 + i,
  events: i,
  heatwave_days: i * 4,
  mean_duration: 4,
  max_duration: 4,
  mean_exceedance: 2,
  peak_tmax: 42,
  coverage: 1,
  eligible: true,
  rolling_events: i < 4 ? null : i - 2,
  regression_events: i,
  rolling_duration: i < 4 ? null : 4,
  regression_duration: i ? 4 : null,
}));
const events = Array.from({ length: 25 }, (_, i) => ({
  start: `2020-05-${String(i + 1).padStart(2, "0")}`,
  end: "2020-05-30",
  duration: 4,
  peak_tmax: 42,
  mean_exceedance: 2,
  boundary_clipped: false,
}));
const fixture = {
  id: "a".repeat(24),
  created_at: "2026-10-11T00:00:00Z",
  annual,
  events: [],
  event_count: events.length,
  summary: {
    total_events: 55,
    heatwave_days: 220,
    longest_event: 4,
    eligible_years: 11,
  },
  trend: { slope_per_decade: 10, r_squared: 1, p_value: 0, eligible_years: 11 },
  duration_trend: {
    slope_per_decade: 0,
    r_squared: null,
    p_value: null,
    eligible_years: 10,
  },
  comparison: null,
  insights: ["UI test fixture: historical results loaded."],
  warnings: [],
  methodology: {
    threshold_c: 38,
    threshold_value: 38,
    threshold_unit: "°C",
    baseline: "1981–2010",
    baseline_coverage: 1,
    rule: "Test fixture",
    limitations: "Test fixture",
    algorithm: "test",
  },
  provenance: {
    provider: "Test fixture",
    attribution: "Synthetic UI test only",
    spatial_scope: "Test fixture",
    url: "https://example.com",
  },
  cache: { analysis_hit: false, weather_years_hit: 0, weather_years_total: 40 },
};
async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(value);
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function year(page: Page, label: string, value: string) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    await control.selectOption({ label: value });
  } else {
    await control.click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
}
async function analyze(page: Page) {
  await page.getByRole("checkbox", { name: "Hide map when analyzing", exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Analyze trends", exact: true })
    .click();
}
test("manual analysis can hide the map, shows progress immediately, and allows reopening it", async ({ page }) => {
  await setup(page);
  let release: (() => void) | undefined;
  await page.route("**/api/analyses?include_events=false", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { ...fixture, parameters: route.request().postDataJSON() } });
  });
  await page.route("**/api/analyses/*/events?*", route => route.fulfill({json:{items:[],total:0}}));
  await page.goto("/");
  await expect(page.getByRole("combobox", {name:"City / Town",exact:true})).toHaveValue("Hyderabad");
  await expect(page.getByRole("checkbox", {name:"Hide map when analyzing",exact:true})).toBeChecked();
  await page.getByRole("button", {name:"Analyze trends",exact:true}).click();
  await expect(page.getByRole("button", {name:"Analyzing…",exact:true})).toBeDisabled();
  await expect(page.getByText("Loading historical data for Hyderabad", {exact:false})).toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(page.locator("#analysis-results")).toBeInViewport();
  await expect.poll(() => !!release).toBe(true);
  release!();
  await expect(page.getByRole("region", {name:"Analysis summary"})).toBeVisible();
  for (const name of ["Frequency", "Duration", "Intensity"]) {
    await page.getByRole("tab", {name,exact:true}).click();
    await expect(page.locator("#analysis-results .recharts-surface")).toBeVisible();
  }
  await page.getByRole("button", {name:"Show map",exact:true}).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
});
async function setup(page: Page) {
  await page.route(
    /https:\/\/(tile\.openstreetmap\.org|server\.arcgisonline\.com)\//,
    (route) => route.abort(),
  );
  await page.route("**/api/locations/reverse?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        name: "Near Mysuru",
        country: "India",
        state: "Karnataka",
        latitude: Number(query.get("latitude")),
        longitude: Number(query.get("longitude")),
        timezone: "Asia/Kolkata",
        distance_km: 4.2,
      },
    });
  });
  await page.route("**/api/locations/countries", (r) =>
    r.fulfill({
      json: [
        { id: "IN", name: "India" },
        { id: "US", name: "United States" },
      ],
    }),
  );
  await page.route("**/api/locations/IN/states", (r) =>
    r.fulfill({
      json: [
        { id: "TG", name: "Telangana" },
        { id: "KA", name: "Karnataka" },
      ],
    }),
  );
  await page.route("**/api/locations/US/states", (r) =>
    r.fulfill({ json: [{ id: "CA", name: "California" }] }),
  );
  await page.route("**/api/locations/US/CA/cities?*", (r) => {
    const query = new URL(r.request().url()).searchParams.get("q");
    return r.fulfill({
      json: {
        items:
          query === "Los Angeles"
            ? [
                {
                  id: "la",
                  name: "Los Angeles",
                  latitude: 34.0522,
                  longitude: -118.2437,
                },
              ]
            : [
                {
                  id: "sf",
                  name: "San Francisco",
                  latitude: 37.7749,
                  longitude: -122.4194,
                },
              ],
        total: query ? 1 : 200,
      },
    });
  });
  await page.route("**/api/locations/IN/TG/cities?*", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: "hyd",
            name: "Hyderabad",
            latitude: 17.38405,
            longitude: 78.45636,
          },
          { id: "war", name: "Warangal", latitude: 18, longitude: 79 },
        ],
        total: 2,
      },
    }),
  );
  await page.route("**/api/locations/IN/KA/cities?*", (r) =>
    r.fulfill({
      json: {
        items: [
          { id: "blr", name: "Bengaluru", latitude: 12.97, longitude: 77.59 },
        ],
        total: 1,
      },
    }),
  );
  let analyzedRange = { start_year: 1990, end_year: 2020 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/analyses?"))
      analyzedRange = request.postDataJSON();
  });
  await page.route("**/api/analyses/*/series?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const variable = query.get("variable") ?? "temperature";
    const resolution = query.get("resolution") ?? "monthly";
    const layer = {
      temperature: { label: "Maximum temperature", unit: "°C", value: 32 },
      rainfall: { label: "Precipitation", unit: "mm", value: 12 },
      dry_days: { label: "Dry days (<1 mm)", unit: "days", value: 8 },
      wind: { label: "Maximum 10 m wind speed", unit: "km/h", value: 35 },
      discharge: { label: "River discharge", unit: "m³/s", value: 120 },
    }[variable];
    const selectedYear = Number(query.get("year") ?? analyzedRange.start_year);
    const selectedDecade = Number(
      query.get("decade") ?? Math.floor(analyzedRange.start_year / 10) * 10,
    );
    let periods: string[];
    if (resolution === "decades") {
      periods = Array.from(
        {
          length:
            Math.floor(analyzedRange.end_year / 10) -
            Math.floor(analyzedRange.start_year / 10) +
            1,
        },
        (_, i) => {
          const decade =
            Math.floor(analyzedRange.start_year / 10) * 10 + i * 10;
          return `${Math.max(decade, analyzedRange.start_year)}\u2013${Math.min(decade + 9, analyzedRange.end_year)}`;
        },
      );
    } else if (resolution === "yearly") {
      const first = Math.max(selectedDecade, analyzedRange.start_year);
      periods = Array.from(
        {
          length:
            Math.min(selectedDecade + 9, analyzedRange.end_year) - first + 1,
        },
        (_, i) => String(first + i),
      );
    } else {
      const labels =
        resolution === "monthly"
          ? Array.from({ length: 12 }, (_, i) =>
              new Date(2000, i).toLocaleString("en-US", { month: "long" }),
            )
          : resolution === "quarterly"
            ? ["Q1", "Q2", "Q3", "Q4"]
            : ["First half (Jan\u2013Jun)", "Second half (Jul\u2013Dec)"];
      periods = labels.map((label) => `${label} ${selectedYear}`);
    }
    return route.fulfill({
      json: {
        variable,
        resolution,
        aggregation: variable === "temperature" ? "mean" : "total",
        ...layer,
        points: periods.map((period) => ({
          period,
          value: layer.value,
          coverage: 1,
        })),
      },
    });
  });
}

test("map series retries independently and event-free years have no intensity", async ({
  page,
}) => {
  await setup(page);
  let analyses = 0;
  let seriesCalls = 0;
  await page.route("**/api/analyses?include_events=false", (route) => {
    analyses++;
    return route.fulfill({
      json: { ...fixture, parameters: route.request().postDataJSON() },
    });
  });
  await page.route("**/api/analyses/*/events?*", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.route("**/api/analyses/*/series?*", (route) => {
    seriesCalls++;
    return seriesCalls === 1
      ? route.fulfill({
          status: 503,
          json: { detail: "Map provider temporarily unavailable" },
        })
      : route.fulfill({
          json: {
            variable: "temperature",
            resolution: "monthly",
            label: "Maximum temperature",
            unit: "°C",
            aggregation: "mean",
            points: [{ period: "January", value: 32, coverage: 1 }],
          },
        });
  });
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect(
    page.getByText("Map provider temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry map data" }).click();
  await expect(
    page.getByRole("combobox", { name: "Period", exact: true }),
  ).toBeVisible();
  expect(seriesCalls).toBe(2);
  expect(analyses).toBe(1);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const firstRow = page
    .getByRole("table", { name: "Annual heatwave statistics" })
    .locator("tbody tr")
    .first();
  await expect(firstRow.locator("td").nth(1)).toHaveText("0");
  await expect(firstRow.locator("td").nth(4)).toHaveText("—");
});

test("location modes, quick decades, compact map periods, and equal desktop heights", async ({
  page,
}) => {
  await setup(page);
  const requests: any[] = [];
  await page.route("**/api/analyses?include_events=false", (route) => {
    const parameters = route.request().postDataJSON();
    requests.push(parameters);
    return route.fulfill({ json: { ...fixture, parameters } });
  });
  await page.route("**/api/analyses/*/events?*", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect(
    page.getByRole("combobox", { name: "Period", exact: true }),
  ).toBeVisible();
  const timeline = page.getByRole("region", { name: "Map display controls" });
  await expect(
    timeline.getByRole("button", { name: "Decades", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    timeline.getByRole("button", { name: "Monthly", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("#location-map")
      .getByRole("region", { name: "Map display controls" }),
  ).toHaveCount(0);
  await year(page, "Year", "1995");
  await expect(
    timeline.getByText(
      "Annual values: 1990\u20131999 \u00b7 selected year 1995",
      { exact: true },
    ),
  ).toBeVisible();
  for (const [label, count] of [
    ["Monthly", 12],
    ["Quarterly", 4],
    ["Half-yearly", 2],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Period" })).toBeVisible();
    await page.getByRole("combobox", { name: "Period" }).click();
    await expect(page.getByRole("option")).toHaveCount(count);
    await expect(page.getByRole("option").first()).toContainText("1995");
    await page.keyboard.press("Escape");
  }
  const graph = (await timeline
    .locator('[aria-label^="Graph:"]')
    .boundingBox())!;
  const periodField = (await timeline
    .getByRole("combobox", { name: "Period", exact: true })
    .boundingBox())!;
  expect(graph.y).toBeGreaterThan(periodField.y);
  await year(page, "Decade", "2000\u20132009");
  await expect(
    timeline.getByRole("button", { name: "Half-yearly", exact: true }),
  ).toHaveCount(0);
  await year(page, "Year", "2005");
  await timeline
    .getByRole("button", { name: "Quarterly", exact: true })
    .click();
  await expect(
    timeline.getByRole("combobox", { name: "Period", exact: true }),
  ).toContainText("Q1 2005");
  expect(requests).toHaveLength(1);
  const sidebar = page.getByRole("complementary", {
    name: /^Location details for /,
  });
  await expect(
    sidebar.getByText("Hyderabad, Telangana, India", { exact: true }),
  ).toHaveCount(1);
  const mapControls = page.getByRole("region", {
    name: "Map display controls",
  });
  const canvas = (await page.locator(".map-canvas").boundingBox())!;
  const controls = (await mapControls.boundingBox())!;
  expect(controls.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  await expect(sidebar.getByLabel("Climate map layer")).toHaveCount(0);
  const halfYearly = mapControls.getByRole("button", {
    name: "Half-yearly",
    exact: true,
  });
  expect(
    await halfYearly.evaluate((button) => {
      const range = document.createRange();
      const text = Array.from(button.childNodes).find(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          node.textContent?.includes("Half-yearly"),
      );
      if (!text) return 0;
      range.selectNodeContents(text);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  const mapHeight = (await page.locator(".map-canvas").boundingBox())!.height;
  const asideHeight = (await page.locator(".map-explorer aside").boundingBox())!
    .height;
  expect(Math.abs(mapHeight - asideHeight)).toBeLessThan(2);
  await page.getByRole("button", { name: "1990–1999", exact: true }).click();
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.end_year).toBe(1999);
  await page
    .getByRole("spinbutton", { name: "Latitude", exact: true })
    .fill("0");
  await page
    .getByRole("spinbutton", { name: "Longitude", exact: true })
    .fill("0");
  await page.getByRole("spinbutton", { name: "Longitude", exact: true }).blur();
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.location.latitude).toBe(0);
  const sharedPeriod = page.getByRole("region", {
    name: "Time and analysis",
    exact: true,
  });
  await expect(sharedPeriod).toHaveCount(1);
  await sharedPeriod.evaluate((element) =>
    element.setAttribute("data-preserved", "true"),
  );
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(sharedPeriod).toHaveAttribute("data-preserved", "true");
  await expect(
    sharedPeriod.getByRole("combobox", { name: "From", exact: true }),
  ).toHaveValue("1990");
  await expect(
    sharedPeriod.getByRole("combobox", { name: "To", exact: true }),
  ).toHaveValue("1999");
  await expect(sharedPeriod).toContainText("10 complete calendar years");
  await expect(sharedPeriod).toContainText("Enter 2");
  const list = page.getByLabel("Coordinates (latitude, longitude per line)");
  await expect(list).toHaveAttribute("aria-invalid", "false");
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter 2" }),
  ).toHaveCount(0);
  await list.fill("17,78\n17,78");
  await expect(
    page.getByRole("button", { name: "Analyze trends" }),
  ).toBeDisabled();
  await list.fill("17,78\n18,79");
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.location_mode).toBe("list");
  expect(requests.at(-1).locations).toHaveLength(2);
  await page.getByRole("tab", { name: "Bounding box", exact: true }).click();
  await expect(sharedPeriod).toHaveAttribute("data-preserved", "true");
  await expect(
    sharedPeriod.getByRole("combobox", { name: "To", exact: true }),
  ).toHaveValue("1999");
  await expect(
    page.getByRole("button", { name: "Analyze trends", exact: true }),
  ).toHaveCount(1);
  await expect(sharedPeriod).toContainText(
    "Complete the four valid bounding-box limits",
  );
  for (const [label, value] of [
    ["South latitude", "17"],
    ["North latitude", "18"],
    ["West longitude", "78"],
    ["East longitude", "79"],
  ]) {
    await page.getByRole("spinbutton", { name: label }).fill(value);
  }
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.location_mode).toBe("bounding_box");
  expect(requests.at(-1).bounding_box).toEqual({
    south: 17,
    north: 18,
    west: 78,
    east: 79,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("MUI location controls submit analysis on click, recheck repeated ranges, and paginate events on the server", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  const requests: any[] = [];
  const pages: number[] = [];
  await page.route("**/api/analyses?include_events=false", async (route) => {
    const parameters = route.request().postDataJSON();
    requests.push(parameters);
    const summary =
      parameters.location.name === "Bengaluru"
        ? {
            total_events: 0,
            heatwave_days: 0,
            longest_event: 0,
            eligible_years: 11,
          }
        : fixture.summary;
    await route.fulfill({ json: { ...fixture, parameters, summary } });
  });
  await page.route("**/api/analyses/*/events?*", (route) => {
    const offset = Number(
      new URL(route.request().url()).searchParams.get("offset"),
    );
    pages.push(offset);
    return route.fulfill({
      json: { items: events.slice(offset, offset + 10), total: 25 },
    });
  });
  await page.route("**/export.csv", (route) =>
    route.fulfill({ contentType: "text/csv", body: "year,events\n2020,10\n" }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await expect(
    page.getByText("UI test fixture: historical results loaded."),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(
    page.getByRole("combobox", { name: "Period", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Duration", exact: true }).click();
  await expect(page.getByLabel("Duration trend")).toContainText(
    "0.00 days per decade",
  );
  await expect(page.locator("#analysis-results .recharts-line")).toHaveCount(2);
  await page
    .getByRole("checkbox", { name: "Regression", exact: true })
    .uncheck();
  await expect(page.locator("#analysis-results .recharts-line")).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "5-year pooled mean", exact: true })
    .uncheck();
  await expect(page.locator("#analysis-results .recharts-line")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Regression", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "5-year pooled mean", exact: true })
    .check();
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: "test-results/duration-trends.png",
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Frequency", exact: true }).click();
  const inspector = page.getByRole("complementary", {
    name: /^Location details for /,
  });
  await expect(inspector.locator(".map-headline-stat")).toContainText("55");
  await page.getByRole("button", { name: "Rainfall", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Map display controls" })
      .getByText(/^Precipitation ·/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Decades", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Map display controls" })
      .getByLabel("Map time resolution")
      .getByRole("button", { name: "Decades", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("table", { name: "Detected heatwave events" })
      .locator("tbody tr"),
  ).toHaveCount(10);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => pages.at(-1)).toBe(10);
  await expect(
    page
      .getByRole("table", { name: "Detected heatwave events" })
      .locator("tbody tr")
      .first(),
  ).toContainText("2020-05-11");
  await year(page, "From", "2010");
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.start_year).toBe(2010);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  await year(page, "To", "2019");
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.end_year).toBe(2019);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  const count = requests.length;
  await year(page, "To", "2020");
  await analyze(page);
  await expect.poll(() => requests.length).toBe(count + 1);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Analyze trends", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(count + 2);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  await choose(page, "State / Union Territory", "Karnataka");
  await expect(
    page.getByRole("button", { name: "Analyze trends" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Analysis summary" }),
  ).toHaveCount(0);
  await choose(page, "City / Town", "Bengaluru");
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.location.name).toBe("Bengaluru");
  await expect(inspector.locator(".map-headline-stat")).toContainText("0");
  const beforeMapPick = requests.length;
  await page
    .locator(".leaflet-container")
    .click({ position: { x: 170, y: 150 } });
  await expect.poll(() => requests.length).toBe(beforeMapPick + 1);
  await expect.poll(() => requests.at(-1)?.location.name).toBe("Near Mysuru");
  await expect(
    inspector.getByRole("heading", {
      name: "Near Mysuru, Karnataka, India",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Heatwave analysis for Near Mysuru, Karnataka, India",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Near Mysuru, Karnataka, India · 2010–2020", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector.locator(".map-headline-stat")).toContainText("55");
  await page.getByRole("tab", { name: "Intensity", exact: true }).click();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Annual heatwave statistics" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "climatrace-Near-Mysuru.csv",
  );
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: "test-results/results-desktop.png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: "test-results/results-mobile.png",
      fullPage: true,
    });
  }
});

test("new location clears old statistics and aborts a slow request; latest selection wins", async ({
  page,
}) => {
  await setup(page);
  let slowStarted = false;
  let slowAborted = false;
  page.on("requestfailed", (r) => {
    if (r.postData()?.includes("Warangal")) slowAborted = true;
  });
  await page.route("**/api/analyses?include_events=false", async (route) => {
    const parameters = route.request().postDataJSON();
    if (parameters.location.name === "Warangal") {
      slowStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    await route
      .fulfill({
        json: {
          ...fixture,
          parameters,
          summary: {
            ...fixture.summary,
            total_events: parameters.location.name === "Warangal" ? 999 : 55,
          },
        },
      })
      .catch(() => {});
  });
  await page.route("**/api/analyses/*/events?*", (r) =>
    r.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  await choose(page, "City / Town", "Warangal");
  await analyze(page);
  await expect.poll(() => slowStarted).toBe(true);
  await expect(page.getByRole("button", { name: "Analyzing…", exact: true })).toBeDisabled();
  await expect(page.locator("#analysis-results").getByText("Loading historical data for Warangal, Telangana, India", { exact: false })).toBeVisible();
  await expect(page.locator("#analysis-results")).toBeInViewport();
  const inspector = page.getByRole("complementary", {
    name: /^Location details for /,
  });
  await expect(
    inspector.getByRole("heading", {
      name: "Warangal, Telangana, India",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector.locator(".map-headline-stat")).not.toContainText("55");
  await choose(page, "City / Town", "Hyderabad");
  await expect.poll(() => slowAborted).toBe(true);
  await analyze(page);
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled();
  await expect(inspector.locator(".map-headline-stat")).toContainText("55");
  await page.waitForTimeout(1900);
  await expect(inspector.locator(".map-headline-stat")).not.toContainText(
    "999",
  );
});

test("hazard selection waits for Analyze trends and submits the selected precipitation rule", async ({
  page,
}) => {
  await setup(page);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/analyses?include_events=false", async (route) => {
    const parameters = route.request().postDataJSON();
    requests.push(parameters);
    const methodology =
      parameters.hazard === "heavy_rainfall"
        ? {
            ...fixture.methodology,
            rule: "Daily precipitation above the 95th percentile of wet-day totals (days at least 1 mm) in the 1981–2010 baseline.",
          }
        : fixture.methodology;
    await route.fulfill({ json: { ...fixture, parameters, methodology } });
  });
  await page.route("**/api/analyses/*/events?*", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect.poll(() => requests.length).toBe(1);
  await page
    .getByRole("button", { name: "Heavy rainfall", exact: true })
    .click();
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await analyze(page);
  await expect.poll(() => requests.at(-1)?.hazard).toBe("heavy_rainfall");
  await expect(
    page.getByRole("heading", {
      name: "Heavy rainfall analysis for Hyderabad, Telangana, India",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/95th percentile of wet-day totals/).first(),
  ).toBeVisible();
});

test("global cyclone and earthquake selections update the complete results view", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/analyses?include_events=false", async (route) => {
    const parameters = route.request().postDataJSON();
    const earthquake = parameters.hazard === "earthquake";
    await route.fulfill({
      json: {
        ...fixture,
        parameters: {
          ...parameters,
          location: {
            name: "Worldwide",
            country: "Worldwide",
            state: "",
            latitude: 0,
            longitude: 0,
            timezone: "UTC",
          },
        },
        annual: annual.map((row) => ({
          ...row,
          coverage: null,
          mean_intensity: 5.4,
          peak_value: 6.1,
          hazard_days: earthquake ? null : 40,
        })),
        summary: {
          total_events: 12,
          largest_magnitude: earthquake ? 6.1 : null,
          hazard_days: earthquake ? null : 40,
          longest_event: earthquake ? 0 : 8,
          eligible_years: 11,
        },
        methodology: {
          ...fixture.methodology,
          threshold_value: earthquake ? 5 : 34,
          threshold_unit: earthquake ? "magnitude" : "knots",
          baseline_coverage: null,
          baseline: earthquake ? "USGS ComCat" : "NOAA IBTrACS",
          rule: earthquake
            ? "USGS ComCat events with magnitude at least 5.0."
            : "IBTrACS storms reaching 34 knots.",
        },
        provenance: {
          ...fixture.provenance,
          provider: earthquake ? "USGS ComCat" : "NOAA IBTrACS v04r01",
          spatial_scope: "Worldwide event catalog.",
        },
      },
    });
  });
  await page.route("**/api/analyses/*/events?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            source_event_id: "global-event",
            event_year: 2020,
            start: "2020-01-01T00:00:00Z",
            end: "2020-01-03T00:00:00Z",
            duration: 3,
            magnitude: 5.4,
            max_wind_kt: 45,
            name: "ALPHA",
            basin: "NI",
            place: "Worldwide test location",
            depth_km: 10,
            url: "https://example.com",
            threshold_date: "2020-01-01",
            boundary_clipped: false,
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await page
    .getByRole("button", { name: "Earthquakes (M5.0+)", exact: true })
    .click();
  await analyze(page);
  await expect(
    page.getByRole("heading", {
      name: "Worldwide earthquakes (m5.0+) analysis",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What counts as earthquakes (m5.0+)?" }),
  ).toBeVisible();
  await expect(
    page.getByText("USGS ComCat events with magnitude at least 5.0.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tropical cyclones", exact: true })
    .click();
  await analyze(page);
  await expect(
    page.getByRole("heading", { name: "Worldwide tropical cyclones analysis" }),
  ).toBeVisible();
  await expect(
    page.getByText("IBTrACS storms reaching 34 knots.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Peak wind" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Magnitude" }),
  ).toHaveCount(0);
});

test("errors, invalid period, map controls, date, and mobile layout", async ({
  page,
}) => {
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-12T18:29:50Z") });
  await page.route("**/api/analyses?include_events=false", (r) =>
    r.fulfill({
      status: 503,
      json: { detail: "Weather temporarily unavailable" },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await analyze(page);
  await expect(page.getByText("Weather temporarily unavailable")).toBeVisible();
  await expect(page.getByText("A longer view of heatwave")).toBeVisible();
  const form = page.getByRole("form", { name: "Configure analysis" });
  const map = page.locator("#location-map");
  expect((await form.boundingBox())!.y).toBeLessThan(
    (await map.boundingBox())!.y,
  );
  await expect(map.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByLabel("Current date in India")).toContainText(
    "12 October 2026",
  );
  await page.clock.fastForward(60_000);
  await expect(page.getByLabel("Current date in India")).toContainText(
    "13 October 2026",
  );
  await year(page, "From", "2021");
  await expect(
    page.getByRole("button", { name: "Analyze trends" }),
  ).toBeDisabled();
  await year(page, "From", "1990");
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Satellite", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Street", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Toggle map fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "Toggle map fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page
    .getByRole("button", { name: "Methodology, provenance & limitations" })
    .click();
  await expect(
    page.getByText(/This pooled annual percentile rule/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("all seven hazards are visible and no analysis runs until submitted", async ({
  page,
}) => {
  await setup(page);
  const requests: any[] = [];
  await page.route("**/api/analyses?include_events=false", (route) => {
    const parameters = route.request().postDataJSON();
    requests.push(parameters);
    return route.fulfill({ json: { ...fixture, parameters } });
  });
  await page.route("**/api/analyses/*/events?*", (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  const hazards = page.getByRole("group", { name: "Hazard", exact: true });
  await expect(hazards.getByRole("button")).toHaveCount(7);
  for (const label of [
    "Heavy rainfall",
    "Drought",
    "Wind",
    "Flood",
    "Tropical cyclones",
    "Earthquakes (M5.0+)",
  ]) {
    await hazards.getByRole("button", { name: label, exact: true }).click();
  }
  await hazards.getByRole("button", { name: "Heatwave", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Latitude", exact: true })
    .fill("52.52");
  await page
    .getByRole("spinbutton", { name: "Longitude", exact: true })
    .fill("13.41");
  await year(page, "From", "1992");
  await year(page, "To", "2019");
  await year(page, "Timezone", "GMT+0 (UTC)");
  await expect(
    page.getByRole("button", { name: "Use coordinates", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add coordinates to list", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(0);
  const sidebar = page.getByRole("complementary", {
    name: /^Location details for /,
  });
  await expect(sidebar).toContainText("Click Analyze trends to load data");
  await expect(
    sidebar.getByText("qualifying events", { exact: true }),
  ).toHaveCount(0);
  await analyze(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].location.timezone).toBe("UTC");
  expect(requests[0].location.latitude).toBe(52.52);
  expect(requests[0].location.longitude).toBe(13.41);
  expect(requests[0].start_year).toBe(1992);
  expect(requests[0].end_year).toBe(2019);
  await expect(sidebar.locator(".map-headline-stat")).toContainText("55");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page
    .getByLabel("Coordinates (latitude, longitude per line)")
    .fill("17,78\n18,79");
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await analyze(page);
  await expect.poll(() => requests.length).toBe(2);
  await expect(
    page.getByRole("button", { name: "Analyze trends", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Analysis summary" }),
  ).toContainText("Coordinate list");
  await page.getByRole("tab", { name: "Coordinates", exact: true }).click();
  await choose(page, "Country", "United States");
  await choose(page, "State / Province / Region", "California");
  await choose(page, "City / Town", "Los Angeles");
  expect(requests).toHaveLength(2);
  await analyze(page);
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].location).toMatchObject({
    name: "Los Angeles",
    country: "United States",
    state: "California",
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: "auto",
  });
  await expect(
    page.getByRole("region", { name: "Analysis summary" }),
  ).toContainText("Los Angeles");
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await page.screenshot({
      path: "test-results/location-hazard-controls.png",
      fullPage: true,
    });
});
