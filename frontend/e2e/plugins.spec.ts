import { test, expect } from '@playwright/test';

test.describe('Plugin Pages', () => {
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

    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
    });
  });

  test('navigates to Istio plugin page', async ({ page }) => {
    await page.goto('/plugins/istio');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to Prometheus plugin page', async ({ page }) => {
    await page.goto('/plugins/prometheus');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to Calico plugin page', async ({ page }) => {
    await page.goto('/plugins/calico');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to CNPG plugin page', async ({ page }) => {
    await page.goto('/plugins/cnpg');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to Helm plugin page', async ({ page }) => {
    await page.goto('/plugins/helm');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to Ceph plugin page', async ({ page }) => {
    await page.goto('/plugins/ceph');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to KEDA plugin page', async ({ page }) => {
    await page.goto('/plugins/keda');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigates to MariaDB plugin page', async ({ page }) => {
    await page.goto('/plugins/mariadb');
    await expect(page.locator('body')).toBeVisible();
  });
});
