import { create } from 'zustand';
import { api } from '@/lib/api';

export type NotificationCategory =
  | 'cluster'
  | 'deployment'
  | 'security'
  | 'system'
  | 'health';

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Notification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  read: boolean;
  created_at: string;
  metadata?: Record<string, string>;
}

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  page: number;
  per_page: number;
}

interface UnreadCountResponse {
  count: number;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  page: number;
  perPage: number;

  fetchNotifications: (page?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addRealtimeNotification: (notification: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  total: 0,
  loading: false,
  page: 1,
  perPage: 20,

  fetchNotifications: async (page = 1) => {
    set({ loading: true });
    try {
      const { perPage } = get();
      const data = await api.get<NotificationsResponse>(
        `/api/notifications?page=${page}&per_page=${perPage}`
      );
      set({
        notifications: data.notifications,
        total: data.total,
        page: data.page,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await api.get<UnreadCountResponse>('/api/notifications/unread-count');
      set({ unreadCount: data.count });
    } catch {
      // Silently fail - badge just won't update
    }
  },

  markAsRead: async (id: string) => {
    try {
      await api.put(`/api/notifications/${id}/read`);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // Handled by api error toast
    }
  },

  markAllRead: async () => {
    try {
      await api.put('/api/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // Handled by api error toast
    }
  },

  addRealtimeNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
      total: state.total + 1,
    }));
  },
}));
