import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for integration tests against a running Docker Compose stack.
 * Run with: npx playwright test --config playwright.integration.config.ts
 *
 * Prerequisites: Docker Compose stack running (backend :8080, frontend :3000, postgres).
 */
export default defineConfig({
  testDir: './e2e/integration',
  fullyParallel: false, // Sequential — tests share auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'integration',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — expects Docker Compose already running
});
