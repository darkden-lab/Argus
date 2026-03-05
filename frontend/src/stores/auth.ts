import { create } from 'zustand';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  language: string;
  sidebar_compact: boolean;
  animations_enabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  language: 'en',
  sidebar_compact: false,
  animations_enabled: true,
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  preferences: UserPreferences | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  updateProfile: (data: { display_name?: string; email?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('access_token') : false,
  isLoading: false,
  preferences: null,

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
      await get().fetchPreferences();
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
    set({ user: null, isAuthenticated: false, preferences: null });
    window.location.href = '/login';
  },

  fetchUser: async () => {
    try {
      const user = await api.get<User>('/api/auth/me');
      set({ user, isAuthenticated: true });
      await get().fetchPreferences();
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchPreferences: async () => {
    try {
      const prefs = await api.get<UserPreferences>('/api/users/me/preferences');
      set({ preferences: prefs });
    } catch {
      set({ preferences: { ...DEFAULT_PREFERENCES } });
    }
  },

  updatePreferences: async (prefs) => {
    const current = get().preferences ?? { ...DEFAULT_PREFERENCES };
    const updated = { ...current, ...prefs };
    await api.put('/api/users/me/preferences', updated);
    set({ preferences: updated });
  },

  updateProfile: async (data) => {
    const user = await api.patch<User>('/api/users/me', data);
    set({ user });
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.patch('/api/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
}));
