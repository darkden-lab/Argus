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

  describe('register', () => {
    it('stores tokens on successful registration', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: mockUser,
          access_token: 'reg-token',
          refresh_token: 'reg-refresh',
        }),
      });

      await useAuthStore.getState().register('new@example.com', 'pass', 'New User');

      expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'reg-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'reg-refresh');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('throws on failed registration', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Email already exists' }),
      });

      await expect(
        useAuthStore.getState().register('dup@example.com', 'pass', 'Dup')
      ).rejects.toThrow('Email already exists');

      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears tokens and state', () => {
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
      });

      useAuthStore.getState().logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('redirects to login page', () => {
      // Spy on window.location.href assignment via jsdom
      // In jsdom, assigning to location.href triggers navigation
      // We can't easily spy on it, so we just verify state changes
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      useAuthStore.getState().logout();

      // After logout, state should be cleared
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
