import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a running TorqueLane API with the demo seed
 * (`php artisan migrate:fresh --seed` in ../torquelane-api, served on :8000).
 *
 * The web app must run on localhost:3000 — the origin the API lists as
 * Sanctum-stateful and allows in CORS. The suite builds and serves a
 * production bundle (a dev server compiles each route on first visit, which
 * under load outlasts the timeouts); an already-running server is reused.
 * The suite writes (work orders, readings, documents), so run it against a
 * demo database, never a real one.
 */
export default defineConfig({
  testDir: "e2e",
  // The flows share one demo database; run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next build && npx next start -p 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 600_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
    },
  },
});
