import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env };
const frontendURL = `http://127.0.0.1:${env.DEV_PORT || 5173}`;
const backendURL = `http://127.0.0.1:${env.PORT || 8000}`;
export default defineConfig({
  testDir: "./tests",
  testIgnore:
    process.env.LIVE_WEATHER === "1"
      ? undefined
      : "**/live-weather.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || frontendURL,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: process.env.PW_BROWSER_EXE
      ? { executablePath: process.env.PW_BROWSER_EXE }
      : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "npm run dev",
          url: frontendURL,
          reuseExistingServer: true,
        },
        ...(process.env.LIVE_WEATHER === "1"
          ? [
              {
                command:
                  process.platform === "win32"
                    ? ".venv\\Scripts\\python.exe -m backend"
                    : ".venv/bin/python -m backend",
                url: `${backendURL}/api/health`,
                reuseExistingServer: true,
              },
            ]
          : []),
      ],
});
