import { test, expect } from '@playwright/test';
import { API_BASE, ADMIN_USER } from './helpers';

/**
 * API-level health checks that verify backend endpoints work correctly.
 * These tests don't use the browser — they hit the backend directly.
 */
test.describe('API Health (Integration)', () => {
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    accessToken = body.access_token;
  });

  test('GET /api/auth/me returns user info', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.email).toBe(ADMIN_USER.email);
  });

  test('GET /api/auth/permissions returns permissions', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/auth/permissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.permissions).toBeDefined();
    expect(data.permissions.length).toBeGreaterThan(0);
  });

  test('GET /api/clusters returns array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/clusters`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/notifications returns paginated list', async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/notifications?limit=10&offset=0`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('limit', 10);
    expect(data).toHaveProperty('offset', 0);
  });

  test('GET /api/notifications/unread-count returns count', async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/notifications/unread-count`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(typeof data.unread_count).toBe('number');
  });

  test('GET /api/plugins/enabled returns list', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/plugins/enabled`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
  });

  test('GET /api/audit-log returns audit log', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/audit-log?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
  });

  test('protected endpoints reject unauthenticated requests', async ({ request }) => {
    const endpoints = [
      '/api/auth/me',
      '/api/auth/permissions',
      '/api/clusters',
      '/api/notifications?limit=10&offset=0',
      '/api/notifications/unread-count',
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(`${API_BASE}${endpoint}`);
      expect(res.status()).toBe(401);
    }
  });
});
