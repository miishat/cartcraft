import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;

/**
 * End-to-end tests run against the production build served by `wrangler dev` (static assets,
 * _headers and the /api Worker), in Chromium only: Playwright supports service workers only there.
 */
export default defineConfig({
  testDir: 'e2e',
  // The update test swaps the files in dist/, so tests never run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /update\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Runs last because it replaces the served build.
    { name: 'update', testMatch: /update\.spec\.ts/, dependencies: ['app'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node e2e/build.mjs && npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
