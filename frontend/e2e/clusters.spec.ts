import { test, expect } from '@playwright/test';

test.describe('Cluster Management', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
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
      if (route.request().method() === 'GET') {
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
            {
              id: '2',
              name: 'staging',
              api_server_url: 'https://k8s-staging:6443',
              status: 'connected',
              labels: {},
              last_health: '12s ago',
            },
          ]),
        });
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '3',
            name: body.name,
            api_server_url: body.api_server_url,
            status: 'pending',
            labels: {},
            last_health: 'never',
          }),
        });
      }
    });

    // Set auth
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
    });
  });

  test('shows cluster list', async ({ page }) => {
    await page.goto('/clusters');

    await expect(page.getByText('production')).toBeVisible();
    await expect(page.getByText('staging')).toBeVisible();
  });

  test('filters clusters', async ({ page }) => {
    await page.goto('/clusters');

    await page.getByPlaceholder('Filter clusters...').fill('production');

    await expect(page.getByText('production')).toBeVisible();
    await expect(page.getByText('staging')).not.toBeVisible();
  });

  test('navigates to cluster detail on row click', async ({ page }) => {
    await page.goto('/clusters');

    await page.getByText('production').click();

    await page.waitForURL('**/clusters/1');
  });
});
