import { useNotificationStore, type Notification } from '@/stores/notifications';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const mockNotification: Notification = {
  id: 'notif-1',
  title: 'Pod restarted',
  body: 'Pod nginx-abc123 restarted in namespace default',
  category: 'cluster',
  severity: 'warning',
  read: false,
  created_at: '2026-01-01T00:00:00Z',
};

const mockNotification2: Notification = {
  id: 'notif-2',
  title: 'Deployment scaled',
  body: 'Deployment web-app scaled to 3 replicas',
  category: 'deployment',
  severity: 'info',
  read: true,
  created_at: '2026-01-01T00:01:00Z',
};

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      total: 0,
      loading: false,
      page: 1,
      perPage: 20,
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has empty notifications', () => {
      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.total).toBe(0);
      expect(state.loading).toBe(false);
    });
  });

  describe('fetchNotifications', () => {
    it('sets loading and updates state on success', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce({
        notifications: [mockNotification],
        total: 1,
        limit: 20,
        offset: 0,
      });

      await useNotificationStore.getState().fetchNotifications();

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([mockNotification]);
      expect(state.total).toBe(1);
      expect(state.page).toBe(1);
      expect(state.loading).toBe(false);
    });

    it('passes page parameter to API', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce({
        notifications: [],
        total: 0,
        limit: 20,
        offset: 20,
      });

      await useNotificationStore.getState().fetchNotifications(2);

      expect(api.get).toHaveBeenCalledWith('/api/notifications?limit=20&offset=20');
    });

    it('resets loading on error', async () => {
      (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await useNotificationStore.getState().fetchNotifications();

      expect(useNotificationStore.getState().loading).toBe(false);
    });
  });

  describe('fetchUnreadCount', () => {
    it('updates unreadCount on success', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce({ unread_count: 5 });

      await useNotificationStore.getState().fetchUnreadCount();

      expect(useNotificationStore.getState().unreadCount).toBe(5);
    });

    it('does not throw on error', async () => {
      (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        useNotificationStore.getState().fetchUnreadCount()
      ).resolves.toBeUndefined();
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read and decrements unreadCount', async () => {
      useNotificationStore.setState({
        notifications: [mockNotification],
        unreadCount: 1,
      });
      (api.put as jest.Mock).mockResolvedValueOnce({});

      await useNotificationStore.getState().markAsRead('notif-1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('does not go below zero for unreadCount', async () => {
      useNotificationStore.setState({
        notifications: [mockNotification],
        unreadCount: 0,
      });
      (api.put as jest.Mock).mockResolvedValueOnce({});

      await useNotificationStore.getState().markAsRead('notif-1');

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('calls correct API endpoint', async () => {
      useNotificationStore.setState({ notifications: [mockNotification], unreadCount: 1 });
      (api.put as jest.Mock).mockResolvedValueOnce({});

      await useNotificationStore.getState().markAsRead('notif-1');

      expect(api.put).toHaveBeenCalledWith('/api/notifications/notif-1/read');
    });
  });

  describe('markAllRead', () => {
    it('marks all notifications as read and resets unreadCount', async () => {
      useNotificationStore.setState({
        notifications: [mockNotification, { ...mockNotification2, read: false }],
        unreadCount: 2,
      });
      (api.put as jest.Mock).mockResolvedValueOnce({});

      await useNotificationStore.getState().markAllRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every((n) => n.read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('calls correct API endpoint', async () => {
      (api.put as jest.Mock).mockResolvedValueOnce({});

      await useNotificationStore.getState().markAllRead();

      expect(api.put).toHaveBeenCalledWith('/api/notifications/read-all');
    });
  });

  describe('addRealtimeNotification', () => {
    it('prepends notification and increments counters', () => {
      useNotificationStore.setState({
        notifications: [mockNotification2],
        unreadCount: 0,
        total: 1,
      });

      useNotificationStore.getState().addRealtimeNotification(mockNotification);

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(2);
      expect(state.notifications[0].id).toBe('notif-1');
      expect(state.unreadCount).toBe(1);
      expect(state.total).toBe(2);
    });
  });
});
