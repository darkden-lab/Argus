import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('Navigation (Integration)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('navigates to dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(
      page.getByText('Overview of your Kubernetes clusters')
    ).toBeVisible();
  });

  test('navigates to clusters page', async ({ page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible();
    await expect(
      page.getByText('Manage your Kubernetes clusters')
    ).toBeVisible();
  });

  test('navigates to notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(
      page.getByText('View and manage all your notifications')
    ).toBeVisible();
  });

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Settings has sub-pages (users, roles, etc.)
    // Settings pages load - verify we're still on settings URL (not redirected to login)
    expect(page.url()).toContain('/settings');
  });

  test('navigates via sidebar links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Click Clusters in sidebar
    await page.getByRole('link', { name: /clusters/i }).click();
    await page.waitForURL('**/clusters');
    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible();
  });

  test('navigates to each settings sub-page', async ({ page }) => {
    const subPages = [
      { path: '/settings/users', text: 'Users' },
      { path: '/settings/roles', text: 'Roles' },
      { path: '/settings/plugins', text: 'Plugins' },
      { path: '/settings/oidc', text: 'OIDC' },
      { path: '/settings/audit', text: 'Audit' },
      { path: '/settings/notifications', text: 'Notification' },
      { path: '/settings/notification-channels', text: 'Channel' },
      { path: '/settings/ai', text: 'AI' },
    ];

    for (const sp of subPages) {
      await page.goto(sp.path);
      await page.waitForLoadState('networkidle');
      // Verify the page loaded without redirect to /login
      expect(page.url()).toContain(sp.path);
    }
  });

  test('no 401 errors across all main pages', async ({ page }) => {
    const failedAuth: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) {
        failedAuth.push(`${res.url()} → 401`);
      }
    });

    const pages = ['/dashboard', '/clusters', '/notifications', '/settings'];

    for (const p of pages) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }

    // Allow short settle time for any delayed API calls
    await page.waitForTimeout(1000);

    expect(failedAuth).toEqual([]);
  });
});
