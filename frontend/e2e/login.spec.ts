import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login form', async ({ page }) => {
    await expect(page.getByText('K8s Dashboard')).toBeVisible();
    await expect(page.getByText('Sign in to manage your clusters')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows validation on empty submit', async ({ page }) => {
    // HTML5 required attributes prevent empty submission
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    // Mock the API to return an error
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    await page.getByLabel('Email').fill('bad@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });

  test('redirects to dashboard on successful login', async ({ page }) => {
    // Mock the login API
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'test-refresh',
        }),
      });
    });

    // Mock the user info API
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

    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard');
  });

  test('has register link', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /register/i });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', '/register');
  });
});
