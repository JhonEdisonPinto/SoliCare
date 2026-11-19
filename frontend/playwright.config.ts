import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
const UNREACHABLE_PORT = 5198;
const isCI = Boolean(process.env.CI);

/**
 * Smoke suite. The "demo" project runs against Vite in demo mode (VITE_DEMO_MODE=true). The "unreachable"
 * project runs against Vite without demo mode and with no backend, to check the offline states.
 * The "unit" project runs the pure-function checks as plain Node tests (no browser).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'unit', testDir: './e2e/unit' },
    {
      name: 'demo',
      testDir: './e2e/demo',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'unreachable',
      testDir: './e2e/unreachable',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${UNREACHABLE_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: { VITE_DEMO_MODE: 'true' },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      // No demo mode and nothing listens on port 5197: every fetch fails.
      command: `npx vite --port ${UNREACHABLE_PORT} --strictPort`,
      url: `http://localhost:${UNREACHABLE_PORT}`,
      env: { VITE_DEMO_MODE: 'false', VITE_API_URL: 'http://127.0.0.1:5197' },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
