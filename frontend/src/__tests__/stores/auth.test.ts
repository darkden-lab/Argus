import { useAuthStore } from '@/stores/auth';

const mockUser = {
  id: '1',
  email: 'admin@example.com',
  display_name: 'Admin',
  auth_provider: 'local',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('sets isLoading to true during login', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', refresh_token: 'ref' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        });

      const promise = useAuthStore.getState().login('admin@example.com', 'pass');

      expect(useAuthStore.getState().isLoading).toBe(true);
      await promise;
    });

    it('stores tokens in localStorage on successful login', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'my-token', refresh_token: 'my-refresh' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        });

      await useAuthStore.getState().login('admin@example.com', 'pass');

      expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'my-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'my-refresh');
    });

    it('sets user and isAuthenticated on successful login', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        });

      await useAuthStore.getState().login('admin@example.com', 'pass');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('throws and resets isLoading on failed login', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(
        useAuthStore.getState().login('bad@example.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');

      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('sends correct request body', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        });

      await useAuthStore.getState().login('test@example.com', 'secret');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
        })
      );
    });
  });

  describe('logout', () => {
    it('clears tokens and state', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({ ok: true });
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
      });

      await useAuthStore.getState().logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('calls backend logout endpoint with refresh token', async () => {
      localStorage.setItem('refresh_token', 'my-refresh');
      localStorage.setItem('access_token', 'my-access');
      global.fetch = jest.fn().mockResolvedValueOnce({ ok: true });
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });

      await useAuthStore.getState().logout();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'my-refresh' }),
        })
      );
    });

    it('still clears state even if backend logout fails', async () => {
      localStorage.setItem('refresh_token', 'my-refresh');
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('fetchUser', () => {
    it('sets user on success', async () => {
      localStorage.setItem('access_token', 'tok');
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      });

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('clears user on error', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
});
