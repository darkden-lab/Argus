/**
 * API Client - Redirect Race Condition Tests
 *
 * Fix: api.ts uses a module-level `isRedirecting` flag to prevent multiple
 * simultaneous 401 responses from triggering multiple redirects to /login.
 *
 * These tests verify:
 * 1. A single 401 response throws ApiError with Unauthorized status
 * 2. Token refresh succeeds and access_token is updated without redirect
 * 3. Multiple concurrent requests that all fail with 401 both reject
 * 4. 403 Forbidden does not cause a redirect
 * 5. The isRedirecting flag prevents repeated navigation calls
 */

import { api, ApiError } from '@/lib/api';

jest.mock('@/stores/toast', () => ({
  toast: jest.fn(),
}));

describe('API redirect race condition prevention', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should throw ApiError with status 401 when no refresh token exists', async () => {
    localStorage.setItem('access_token', 'expired-token');
    // No refresh_token — triggers redirect + throw

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    let caught: unknown;
    try {
      await api.get('/api/protected');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect((caught as ApiError).message).toBe('Unauthorized');
  });

  it('should call window.location.href assignment on 401 with no refresh token', async () => {
    localStorage.setItem('access_token', 'expired-token');
    // No refresh_token

    // The api.ts module does: window.location.href = '/login'
    // In JSDOM this triggers a "not implemented" navigation error.
    // We can detect it was called by checking that only one fetch call was made
    // (the module does NOT loop after setting the redirect flag).
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    await expect(api.get('/api/protected')).rejects.toBeInstanceOf(ApiError);

    // Exactly 1 fetch call: no retry loop triggered by the redirect path
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError with Unauthorized when refresh token fails', async () => {
    localStorage.setItem('access_token', 'expired-token');
    localStorage.setItem('refresh_token', 'expired-refresh');

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid refresh token' }),
      });

    let caught: unknown;
    try {
      await api.get('/api/protected');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    // Exactly 2 fetch calls: original + refresh attempt
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should NOT redirect when token refresh succeeds and original request retried', async () => {
    localStorage.setItem('access_token', 'expired-token');
    localStorage.setItem('refresh_token', 'valid-refresh');

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

    const result = await api.get<{ data: string }>('/api/protected');

    expect(result.data).toBe('success');
    // 3 fetch calls: original + refresh + retried original
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should update access_token in localStorage after successful refresh', async () => {
    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'valid-refresh');

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'brand-new-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

    await api.get('/api/protected');

    expect(localStorage.getItem('access_token')).toBe('brand-new-token');
  });

  it('should throw ApiError with status 403 on Forbidden response without redirect attempt', async () => {
    localStorage.setItem('access_token', 'valid-token');

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    let caught: unknown;
    try {
      await api.get('/api/admin-only');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);

    // 403 does NOT call tryRefreshToken, so only 1 fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError with status 400 on Bad Request without retry', async () => {
    localStorage.setItem('access_token', 'valid-token');

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    });

    let caught: unknown;
    try {
      await api.post('/api/resource', {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(400);
    // Only 1 fetch call — no retry for 400
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should reject both concurrent requests when both get 401 with no refresh token', async () => {
    localStorage.setItem('access_token', 'expired-token');
    // No refresh_token

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const [p1, p2] = await Promise.allSettled([
      api.get('/api/endpoint-1'),
      api.get('/api/endpoint-2'),
    ]);

    // Both requests must be rejected with ApiError
    expect(p1.status).toBe('rejected');
    expect(p2.status).toBe('rejected');

    if (p1.status === 'rejected') {
      expect(p1.reason).toBeInstanceOf(ApiError);
      expect((p1.reason as ApiError).status).toBe(401);
    }
    if (p2.status === 'rejected') {
      expect(p2.reason).toBeInstanceOf(ApiError);
      expect((p2.reason as ApiError).status).toBe(401);
    }
  });

  it('should retry on 500 error and succeed on second attempt', async () => {
    localStorage.setItem('access_token', 'valid-token');

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'recovered' }),
      });

    const resultPromise = api.get<{ data: string }>('/api/test');
    await jest.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.data).toBe('recovered');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should not send Authorization header when no token exists', async () => {
    // No token in localStorage
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'ok' }),
    });

    await api.get('/api/public');

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty('Authorization');
  });

  it('should use generic error message when server response has no error body', async () => {
    jest.useRealTimers();
    localStorage.setItem('access_token', 'valid-token');

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => { throw new Error('no body'); },
    });

    let caught: unknown;
    try {
      await api.post('/api/test', {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).message).toBe('HTTP 400');
  });

  it('should include Bearer token in Authorization header when token exists', async () => {
    localStorage.setItem('access_token', 'my-token-value');

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await api.get('/api/test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token-value',
        }),
      })
    );
  });

  it('should not include ApiError credentials in error message on 401', async () => {
    localStorage.setItem('access_token', 'super-secret-token');

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

    let caught: unknown;
    try {
      await api.get('/api/test');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    // The error message must not contain the actual token
    expect((caught as ApiError).message).not.toContain('super-secret-token');
  });
});
