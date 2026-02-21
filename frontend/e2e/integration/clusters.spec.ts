import { test, expect } from '@playwright/test';
import { loginViaAPI, API_BASE, ADMIN_USER } from './helpers';

test.describe('Clusters Page (Integration)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('clusters page loads with correct heading', async ({ page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible();
    await expect(
      page.getByText('Manage your Kubernetes clusters')
    ).toBeVisible();
  });

  test('admin user sees Add Cluster button', async ({ page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /add cluster/i })
    ).toBeVisible();
  });

  test('Add Cluster dialog opens with tabs', async ({ page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add cluster/i }).click();

    // Dialog should appear with Kubeconfig and Deploy Agent tabs
    await expect(page.getByRole('tab', { name: 'Kubeconfig' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Deploy Agent' })).toBeVisible();
  });

  test('Add Cluster kubeconfig form has required fields', async ({ page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add cluster/i }).click();

    // Kubeconfig tab should be active by default
    await expect(page.getByPlaceholder('production')).toBeVisible();
    await expect(
      page.getByPlaceholder('https://k8s.example.com:6443')
    ).toBeVisible();
  });

  test('clusters API endpoint works', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    const { access_token } = await loginRes.json();

    const res = await request.get(`${API_BASE}/api/clusters`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(res.ok()).toBe(true);
    const data = await res.json();
    // Should return array (may be empty)
    expect(Array.isArray(data)).toBe(true);
  });

  test('no 401 errors on clusters page', async ({ page }) => {
    const authErrors: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) authErrors.push(res.url());
    });

    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(authErrors).toEqual([]);
  });
});
