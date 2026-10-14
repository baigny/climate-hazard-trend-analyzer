import { test, expect } from "@playwright/test";

test("real Hyderabad analysis and PDF download", async ({ page }) => {
  test.skip(
    process.env.LIVE_WEATHER !== "1",
    "Opt-in: uses real weather and persistent database",
  );
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "City / Town", exact: true }),
  ).toHaveValue("Hyderabad");
  await page
    .getByRole("button", { name: "Analyze trends", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled({ timeout: 150_000 });
  const metrics = page.getByRole("region", { name: "Analysis summary" });
  await expect(metrics.locator(".metric-value").nth(0)).toContainText("56");
  await expect(metrics.locator(".metric-value").nth(1)).toContainText("420");
  await expect(metrics.locator(".metric-value").nth(2)).toContainText("28");
  await expect(metrics.locator(".metric-value").nth(3)).toContainText("+0.12");
  await expect(page.getByText("Filters changed.")).not.toBeVisible();
  await page.getByRole("tab", { name: "Duration", exact: true }).click();
  await expect(page.getByLabel("Duration trend")).toContainText(
    "-0.27 days per decade",
  );
  await expect(page.locator(".recharts-line")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/live-desktop.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await (await download).saveAs("test-results/live-report.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/live-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "State / Union Territory", exact: true })
    .fill("Karnataka");
  await page.getByRole("option", { name: "Karnataka", exact: true }).click();
  await page
    .getByRole("combobox", { name: "City / Town", exact: true })
    .fill("Bengaluru");
  const nextAnalysis = page.waitForResponse(
    (response) =>
      response.url().includes("/api/analyses?include_events=false") &&
      response.request().method() === "POST",
    { timeout: 150_000 },
  );
  await page.getByRole("option", { name: "Bengaluru", exact: true }).click();
  await page
    .getByRole("button", { name: "Analyze trends", exact: true })
    .click();
  const response = await nextAnalysis;
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.parameters.location.name).toBe("Bengaluru");
  await expect(
    page.getByRole("button", { name: "Report", exact: true }),
  ).toBeEnabled({ timeout: 150_000 });
  for (const [index, value] of [
    data.summary.total_events,
    data.summary.heatwave_days,
    data.summary.longest_event,
  ].entries()) {
    await expect(metrics.locator(".metric-value").nth(index)).toContainText(
      String(value),
    );
  }
  await expect(metrics.locator(".metric-value").nth(3)).not.toContainText("—");
});
