import { create } from 'zustand';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/** Sync token to both localStorage (for API calls) and cookie (for Next.js middleware). */
function setToken(key: string, value: string) {
  localStorage.setItem(key, value);
  if (key === 'access_token') {
    document.cookie = `access_token=${value}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }
}

function removeTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  document.cookie = 'access_token=; path=/; max-age=0';
}

interface User {
  id: string;
  email: string;
  display_name: string;
  auth_provider: string;
}

interface AuthResponse {
  user?: User;
  access_token: string;
  refresh_token?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('access_token') : false,
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      const data: AuthResponse = await res.json();
      setToken('access_token', data.access_token);
      if (data.refresh_token) {
        setToken('refresh_token', data.refresh_token);
      }

      const user = await api.get<User>('/api/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Best effort - continue with local cleanup
      }
    }
    removeTokens();
    set({ user: null, isAuthenticated: false });
    window.location.href = '/login';
  },

  fetchUser: async () => {
    try {
      const user = await api.get<User>('/api/auth/me');
      set({ user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
