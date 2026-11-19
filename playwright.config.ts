import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command:
      "pnpm exec next build --webpack && DATABASE_URL=file://.repd/e2e-desktop.db pnpm db:test:reset && DATABASE_URL=file://.repd/e2e-desktop.db pnpm db:seed && DATABASE_URL=file://.repd/e2e-mobile.db pnpm db:test:reset && DATABASE_URL=file://.repd/e2e-mobile.db pnpm db:seed && (DATABASE_URL=file://.repd/e2e-desktop.db AI_FIXTURE_MODE=test PLAYWRIGHT_TEST=true pnpm exec next start -p 3100 & DATABASE_URL=file://.repd/e2e-mobile.db AI_FIXTURE_MODE=test PLAYWRIGHT_TEST=true pnpm exec next start -p 3101 & wait)",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        baseURL: "http://127.0.0.1:3101",
      },
    },
  ],
});
