import { toast } from '@/stores/toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

let isRedirecting = false;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithAuth<T>(path: string, method: string, body?: unknown, retries = 0): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      if (typeof window !== 'undefined' && !isRedirecting) {
        isRedirecting = true;
        window.location.href = '/login';
      }
      throw new ApiError('Unauthorized', 401);
    }
    return fetchWithAuth<T>(path, method, body, 0);
  }

  if (res.status === 403) {
    const err = new ApiError('Forbidden: You do not have permission to perform this action.', 403);
    toast('Access Denied', { description: err.message, variant: 'error' });
    throw err;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = data?.error ?? `HTTP ${res.status}`;

    if (isRetryable(res.status) && retries < MAX_RETRIES) {
      await delay(RETRY_DELAY_MS * (retries + 1));
      return fetchWithAuth<T>(path, method, body, retries + 1);
    }

    const err = new ApiError(message, res.status);
    toast('Request failed', { description: message, variant: 'error' });
    throw err;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => fetchWithAuth<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => fetchWithAuth<T>(path, 'POST', body),
  put: <T>(path: string, body?: unknown) => fetchWithAuth<T>(path, 'PUT', body),
  del: <T>(path: string) => fetchWithAuth<T>(path, 'DELETE'),
};
