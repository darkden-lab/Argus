import { useAuthStore } from '@/stores/auth';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const mockApi = api as jest.Mocked<typeof api>;

const mockUser = {
  id: '1',
  email: 'admin@example.com',
  display_name: 'Admin',
  auth_provider: 'local',
};

describe('useAuthStore — preferences & profile', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      preferences: null,
    });
    jest.restoreAllMocks();
  });

  describe('fetchPreferences', () => {
    it('should load and set preferences', async () => {
      const prefs = {
        theme: 'dark' as const,
        language: 'en',
        sidebar_compact: true,
        animations_enabled: false,
      };
      mockApi.get.mockResolvedValueOnce(prefs);

      await useAuthStore.getState().fetchPreferences();

      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me/preferences');
      expect(useAuthStore.getState().preferences).toEqual(prefs);
    });

    it('should set defaults on failure', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      await useAuthStore.getState().fetchPreferences();

      const prefs = useAuthStore.getState().preferences;
      expect(prefs).toEqual({
        theme: 'system',
        language: 'en',
        sidebar_compact: false,
        animations_enabled: true,
      });
    });
  });

  describe('updatePreferences', () => {
    it('should call PUT and update state', async () => {
      useAuthStore.setState({
        preferences: {
          theme: 'system',
          language: 'en',
          sidebar_compact: false,
          animations_enabled: true,
        },
      });
      mockApi.put.mockResolvedValueOnce({});

      await useAuthStore.getState().updatePreferences({ theme: 'dark' });

      expect(mockApi.put).toHaveBeenCalledWith('/api/users/me/preferences', {
        theme: 'dark',
        language: 'en',
        sidebar_compact: false,
        animations_enabled: true,
      });
      expect(useAuthStore.getState().preferences?.theme).toBe('dark');
    });
  });

  describe('updateProfile', () => {
    it('should call PATCH and update user', async () => {
      const updatedUser = { ...mockUser, display_name: 'New Name' };
      mockApi.patch.mockResolvedValueOnce(updatedUser);

      await useAuthStore.getState().updateProfile({ display_name: 'New Name' });

      expect(mockApi.patch).toHaveBeenCalledWith('/api/users/me', { display_name: 'New Name' });
      expect(useAuthStore.getState().user).toEqual(updatedUser);
    });
  });

  describe('changePassword', () => {
    it('should call PATCH /api/users/me/password', async () => {
      mockApi.patch.mockResolvedValueOnce({});

      await useAuthStore.getState().changePassword('old123', 'new456');

      expect(mockApi.patch).toHaveBeenCalledWith('/api/users/me/password', {
        current_password: 'old123',
        new_password: 'new456',
      });
    });
  });
});
