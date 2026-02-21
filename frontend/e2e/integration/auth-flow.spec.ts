import { test, expect } from '@playwright/test';
import { ADMIN_USER, API_BASE } from './helpers';

test.describe('Authentication Flow (Integration)', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Argus')).toBeVisible();
    await expect(page.getByText('Sign in to manage your clusters')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('invalid@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Backend should return an error and the UI should display it
    await expect(
      page.getByText(/invalid|unauthorized|credentials/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('successful login with admin user redirects to dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(ADMIN_USER.email);
    await page.getByLabel('Password').fill(ADMIN_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 });

    // Dashboard heading should be visible
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('stores tokens in localStorage after login', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(ADMIN_USER.email);
    await page.getByLabel('Password').fill(ADMIN_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard', { timeout: 15_000 });

    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token'));

    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Try to access dashboard without auth
    await page.goto('/dashboard');

    // Should redirect to /login
    await page.waitForURL('**/login', { timeout: 15_000 });
  });

  test('API returns valid permissions for admin user', async ({ request }) => {
    // Login via API
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      },
    });

    expect(loginRes.ok()).toBe(true);
    const { access_token } = await loginRes.json();

    // Fetch permissions
    const permRes = await request.get(`${API_BASE}/api/auth/permissions`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(permRes.ok()).toBe(true);
    const permData = await permRes.json();

    expect(permData.permissions).toBeDefined();
    expect(permData.permissions.length).toBeGreaterThan(0);

    // Admin should have wildcard permission
    const wildcard = permData.permissions.find(
      (p: { resource: string; action: string }) => p.resource === '*' && p.action === '*'
    );
    expect(wildcard).toBeDefined();
    expect(wildcard.scope_type).toBe('global');
  });

  test('user info endpoint returns correct user', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      },
    });
    const { access_token } = await loginRes.json();

    const meRes = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(meRes.ok()).toBe(true);
    const user = await meRes.json();
    expect(user.email).toBe(ADMIN_USER.email);
    expect(user.display_name).toBe(ADMIN_USER.displayName);
  });
});
