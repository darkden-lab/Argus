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

  test('settings/users page shows real users from API', async ({ page }) => {
    await page.goto('/settings/users');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/users');

    // Should show the Users heading and Add User button
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: /add user/i })).toBeVisible();

    // Should show table headers
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Display Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Provider' })).toBeVisible();

    // Should show at least one real user (the admin user from seeding)
    await expect(page.getByRole('cell', { name: /local/i }).first()).toBeVisible();
  });

  test('settings/roles page shows real roles from API', async ({ page }) => {
    await page.goto('/settings/roles');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/roles');

    // Should show the Roles heading and Assign Role button
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('button', { name: /assign role/i })).toBeVisible();

    // Should show seeded roles from database
    await expect(page.getByText('admin').first()).toBeVisible();
    await expect(page.getByText('operator')).toBeVisible();
    await expect(page.getByText('developer')).toBeVisible();
    await expect(page.getByText('viewer')).toBeVisible();

    // Role Assignments section
    await expect(page.getByRole('heading', { name: 'Role Assignments' })).toBeVisible();
  });

  test('settings/oidc page loads without 404 errors on settings endpoint', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', (res) => {
      // Only track 404s on the settings OIDC endpoint, not the OIDC auth/info endpoint
      // (which is expected to 404 when OIDC provider is not configured)
      if (res.status() === 404 && res.url().includes('/api/settings/')) {
        failedRequests.push(`${res.url()} → 404`);
      }
    });

    await page.goto('/settings/oidc');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings/oidc');

    // Should show OIDC configuration card
    await expect(page.getByText('OIDC / SSO Configuration')).toBeVisible();
    await expect(page.getByText('Disabled')).toBeVisible();
    await expect(page.getByRole('button', { name: /save configuration/i })).toBeVisible();

    // No 404 errors on the settings endpoint (the bug that was reported)
    expect(failedRequests).toEqual([]);
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

  test('no 401 or 404 errors across all settings pages', async ({ page }) => {
    // Known 404s that are expected when services aren't configured:
    // - /api/auth/oidc/info: OIDC provider not configured
    // - /api/ai/config, /api/ai/rag/status: AI not configured
    const knownOptional = ['/api/auth/oidc/info', '/api/ai/config', '/api/ai/rag/status'];

    const errors: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) errors.push(`${res.url()} → 401`);
      if (res.status() === 404 && res.url().includes('/api/')) {
        const isKnown = knownOptional.some((p) => res.url().includes(p));
        if (!isKnown) errors.push(`${res.url()} → 404`);
      }
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
    expect(errors).toEqual([]);
  });
});
