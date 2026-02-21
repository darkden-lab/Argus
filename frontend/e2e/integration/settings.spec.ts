import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('Settings Pages (Integration)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('settings page loads and shows navigation', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Settings sidebar nav items
    await expect(page.getByRole('link', { name: /users/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /roles/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /plugins/i })).toBeVisible();
  });

  test('settings/users page loads', async ({ page }) => {
    await page.goto('/settings/users');
    await page.waitForLoadState('networkidle');

    // Should not redirect to login
    expect(page.url()).toContain('/settings/users');
  });

  test('settings/roles page loads', async ({ page }) => {
    await page.goto('/settings/roles');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/roles');
  });

  test('settings/plugins page loads', async ({ page }) => {
    await page.goto('/settings/plugins');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/plugins');
  });

  test('settings/audit page loads', async ({ page }) => {
    await page.goto('/settings/audit');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/audit');
  });

  test('settings/notifications page loads', async ({ page }) => {
    await page.goto('/settings/notifications');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/notifications');
  });

  test('settings/notification-channels page loads', async ({ page }) => {
    await page.goto('/settings/notification-channels');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/notification-channels');
  });

  test('settings/ai page loads', async ({ page }) => {
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/ai');
  });

  test('no 401 errors across settings pages', async ({ page }) => {
    const authErrors: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) authErrors.push(res.url());
    });

    const paths = [
      '/settings/users',
      '/settings/roles',
      '/settings/plugins',
      '/settings/oidc',
      '/settings/audit',
      '/settings/notifications',
      '/settings/notification-channels',
      '/settings/ai',
    ];

    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(1000);
    expect(authErrors).toEqual([]);
  });
});
