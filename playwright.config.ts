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
      "DATABASE_URL=file://.repd/e2e.db pnpm exec next build --webpack && pnpm db:test:reset && DATABASE_URL=file://.repd/e2e.db pnpm db:seed && DATABASE_URL=file://.repd/e2e.db AI_FIXTURE_MODE=test PLAYWRIGHT_TEST=true pnpm exec next start -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
