import { test as base, expect } from '@playwright/test';

interface TestFixtures {
  authenticatedPage: ReturnType<typeof base.extend>;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Set auth tokens in localStorage before navigating
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh-token');
    });
    await use(page as never);
  },
});

export { expect };
