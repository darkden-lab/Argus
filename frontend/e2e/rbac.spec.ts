import { test, expect } from '@playwright/test';

test.describe('RBAC', () => {
  const mockClusters = [
    {
      id: '1',
      name: 'production',
      api_server_url: 'https://k8s-prod:6443',
      status: 'connected',
      labels: {},
      last_health: '10s ago',
    },
  ];

  test.beforeEach(async ({ page }) => {
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

    await page.route('**/api/clusters', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClusters),
      });
    });

    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
    });
  });

  test('admin sees Add Cluster button', async ({ page }) => {
    await page.route('**/api/auth/permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            { resource: '*', action: '*', scopeType: 'global', scopeId: '*' },
          ],
        }),
      });
    });

    await page.goto('/clusters');

    await expect(page.getByRole('button', { name: /add cluster/i })).toBeVisible();
  });

  test('viewer does not see Add Cluster button', async ({ page }) => {
    await page.route('**/api/auth/permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            { resource: 'clusters', action: 'read', scopeType: 'global', scopeId: '*' },
          ],
        }),
      });
    });

    await page.goto('/clusters');

    // Viewer should see the cluster list but not the Add button
    await expect(page.getByText('production')).toBeVisible();
    await expect(page.getByRole('button', { name: /add cluster/i })).not.toBeVisible();
  });
});
