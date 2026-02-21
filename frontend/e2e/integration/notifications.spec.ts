import { test, expect } from '@playwright/test';
import { loginViaAPI, API_BASE, ADMIN_USER } from './helpers';

test.describe('Notifications (Integration)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('notifications page loads without errors', async ({ page }) => {
    const failedAuth: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) {
        failedAuth.push(res.url());
      }
    });

    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(
      page.getByText('View and manage all your notifications')
    ).toBeVisible();

    // No 401 errors
    expect(failedAuth).toEqual([]);
  });

  test('notifications page shows empty state or notifications list', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // Should show either "No notifications" empty state or a list of notifications
    const emptyState = page.getByText('No notifications');
    const notificationItems = page.locator('[class*="rounded-lg border"]');

    // One of them should be visible
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasItems = (await notificationItems.count()) > 0;

    expect(hasEmpty || hasItems).toBe(true);
  });

  test('notifications API returns valid response', async ({ request }) => {
    // Login
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    const { access_token } = await loginRes.json();

    // Fetch notifications
    const res = await request.get(
      `${API_BASE}/api/notifications?limit=20&offset=0`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    expect(res.ok()).toBe(true);
    const data = await res.json();

    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('offset');
    // notifications can be null or array
    expect(data.notifications === null || Array.isArray(data.notifications)).toBe(true);
  });

  test('unread count API returns valid response', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    const { access_token } = await loginRes.json();

    const res = await request.get(
      `${API_BASE}/api/notifications/unread-count`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('unread_count');
    expect(typeof data.unread_count).toBe('number');
  });

  test('notification bell is visible in header', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const bell = page.getByRole('button', { name: /notification/i });
    await expect(bell).toBeVisible();
  });

  test('notification bell popover opens', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Click the bell
    await page.getByRole('button', { name: /notification/i }).click();

    // Popover should open with "Notifications" title or "All caught up" message
    await expect(
      page.getByText('Notifications').first()
    ).toBeVisible();
  });

  test('category and severity filters are visible', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // Filter dropdowns should be visible
    await expect(page.getByText('All Categories')).toBeVisible();
    await expect(page.getByText('All Severities')).toBeVisible();
  });
});
