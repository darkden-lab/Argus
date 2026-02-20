import { api, ApiError } from '@/lib/api';

// Mock the toast store to prevent side effects
jest.mock('@/stores/toast', () => ({
  toast: jest.fn(),
}));

describe('API Client Security', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Authorization header', () => {
    it('sends Bearer token in Authorization header when token exists', async () => {
      localStorage.setItem('access_token', 'my-secret-token');
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'ok' }),
      });

      await api.get('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        })
      );
    });

    it('does not send Authorization header when no token exists', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'ok' }),
      });

      await api.get('/api/test');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.headers).not.toHaveProperty('Authorization');
    });

    it('sends correct Content-Type header on all requests', async () => {
      localStorage.setItem('access_token', 'tok');
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.post('/api/test', { key: 'value' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('token refresh on 401', () => {
    it('attempts token refresh when receiving 401', async () => {
      localStorage.setItem('access_token', 'expired-token');
      localStorage.setItem('refresh_token', 'valid-refresh');

      global.fetch = jest.fn()
        // First call: original request returns 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        })
        // Second call: refresh token request succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'new-token' }),
        })
        // Third call: retried original request succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: 'success' }),
        });

      const result = await api.get<{ data: string }>('/api/protected');

      expect(result.data).toBe('success');
      expect(localStorage.getItem('access_token')).toBe('new-token');
    });

    it('redirects to login when refresh token is not available on 401', async () => {
      localStorage.setItem('access_token', 'expired-token');
      // No refresh token set

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(api.get('/api/protected')).rejects.toThrow('Unauthorized');
    });

    it('redirects to login when refresh token request fails', async () => {
      localStorage.setItem('access_token', 'expired-token');
      localStorage.setItem('refresh_token', 'bad-refresh');

      global.fetch = jest.fn()
        // Original request: 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        })
        // Refresh request: fails
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Invalid refresh token' }),
        });

      await expect(api.get('/api/protected')).rejects.toThrow('Unauthorized');
    });
  });

  describe('no credentials leak in error messages', () => {
    it('does not include token in ApiError messages', async () => {
      localStorage.setItem('access_token', 'super-secret-token');

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        })
        // Refresh fails
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({}),
        });

      try {
        await api.get('/api/test');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).message).not.toContain('super-secret-token');
      }
    });

    it('does not include refresh token in error messages on refresh failure', async () => {
      localStorage.setItem('access_token', 'tok');
      localStorage.setItem('refresh_token', 'my-secret-refresh');

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Token expired' }),
        });

      try {
        await api.get('/api/test');
      } catch (err) {
        expect((err as Error).message).not.toContain('my-secret-refresh');
      }
    });

    it('uses server error message in ApiError for non-auth errors', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid request body' }),
      });

      try {
        await api.post('/api/test', {});
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).message).toBe('Invalid request body');
        expect((err as ApiError).status).toBe(400);
      }
    });

    it('provides generic message when server error response has no body', async () => {
      jest.useRealTimers();
      localStorage.setItem('access_token', 'tok');

      // Use a non-retryable error code (400) so we don't need to deal with retry delays
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => { throw new Error('no json'); },
      });

      try {
        await api.post('/api/test', {});
        throw new Error('Expected ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).message).toBe('HTTP 400');
        expect((err as ApiError).status).toBe(400);
      }
    });
  });

  describe('proper error handling for network failures', () => {
    it('throws on network error (fetch rejects)', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockRejectedValueOnce(
        new TypeError('Failed to fetch')
      );

      await expect(api.get('/api/test')).rejects.toThrow('Failed to fetch');
    });

    it('throws ApiError with 403 on forbidden response', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      try {
        await api.get('/api/admin-only');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
      }
    });

    it('retries on 500 status codes', async () => {
      localStorage.setItem('access_token', 'tok');

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

    it('retries on 429 (rate limit) status codes', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Too Many Requests' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });

      const resultPromise = api.get<{ ok: boolean }>('/api/test');
      await jest.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
    });

    it('does not retry on 400 client errors', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request' }),
      });

      await expect(api.post('/api/test', {})).rejects.toThrow('Bad Request');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('request body security', () => {
    it('JSON-serializes request body preventing prototype pollution in transit', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const payload = { key: 'value', nested: { a: 1 } };
      await api.post('/api/test', payload);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.body).toBe(JSON.stringify(payload));
    });

    it('does not send body on GET requests', async () => {
      localStorage.setItem('access_token', 'tok');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/test');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });
  });
});
