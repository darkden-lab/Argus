import { type Page, expect } from '@playwright/test';

/** The default admin user seeded by migration 005. */
export const ADMIN_USER = {
  email: 'roco@darkden.net',
  password: 'adminroco',
  displayName: 'Roco',
};

/** Backend API base (proxied through Next.js on same origin). */
export const API_BASE = process.env.E2E_API_URL || 'http://localhost:8080';

/**
 * Perform a real login via the UI and wait for the dashboard to load.
 * After this function returns the page is authenticated and on /dashboard.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');

  await page.getByLabel('Email').fill(ADMIN_USER.email);
  await page.getByLabel('Password').fill(ADMIN_USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait until redirected to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/**
 * Perform a real login via the API and inject tokens into localStorage.
 * Faster than loginViaUI — use when the login flow itself is not under test.
 */
export async function loginViaAPI(page: Page): Promise<void> {
  // Hit the backend directly to get tokens
  const res = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: {
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
    },
  });

  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.access_token).toBeTruthy();

  // Navigate to the app so we can set localStorage
  await page.goto('/login');
  await page.evaluate((tokens) => {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    document.cookie = `access_token=${tokens.access_token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
  }, body);
}

/**
 * Wait for the page to be free of loading skeletons.
 */
export async function waitForContentLoaded(page: Page): Promise<void> {
  // Wait for any loading spinner/skeleton to disappear
  await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 10_000 }).catch(() => {
    // No skeleton found — content already loaded
  });
}

/**
 * Ensure no console errors related to auth failures on the current page.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}
