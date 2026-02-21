import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth endpoints
    await page.route('**/api/auth/oidc/info', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          email: 'admin@example.com',
          display_name: 'Admin',
          auth_provider: 'local',
        }),
      });
    });

    await page.route('**/api/auth/permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            { resource: '*', action: '*', scope_type: 'global', scope_id: '*' },
          ],
        }),
      });
    });

    await page.route('**/api/clusters', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '1',
            name: 'production',
            api_server_url: 'https://k8s-prod:6443',
            status: 'connected',
            labels: {},
            last_health: '10s ago',
          },
        ]),
      });
    });

    // Set auth token
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
    });
  });

  test('navigates to clusters page', async ({ page }) => {
    await page.goto('/clusters');
    await expect(page.getByText('Clusters')).toBeVisible();
  });

  test('navigates to dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });
});
