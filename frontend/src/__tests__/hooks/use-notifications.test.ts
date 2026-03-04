import { renderHook, act } from '@testing-library/react';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationStore, type Notification } from '@/stores/notifications';

// Mock the api module (used by the store)
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

// Mock socket.io-client via our socket lib
const mockOn = jest.fn();
const mockOff = jest.fn();
const mockDisconnect = jest.fn();

const mockSocket = {
  on: mockOn,
  off: mockOff,
  emit: jest.fn(),
  disconnect: mockDisconnect,
  connected: true,
};

const mockGetSocket = jest.fn(() => mockSocket);
const mockDisconnectSocket = jest.fn();

jest.mock('@/lib/socket', () => ({
  getSocket: (...args: unknown[]) => mockGetSocket(...args),
  disconnectSocket: (...args: unknown[]) => mockDisconnectSocket(...args),
}));

const sampleNotification: Notification = {
  id: 'ws-notif-1',
  title: 'Pod crashed',
  body: 'Pod nginx restarted in default namespace',
  category: 'cluster',
  severity: 'error',
  read: false,
  created_at: '2026-02-01T12:00:00Z',
};

describe('useNotifications', () => {
  beforeEach(() => {
    mockOn.mockReset();
    mockOff.mockReset();
    mockDisconnect.mockReset();
    mockGetSocket.mockReturnValue(mockSocket);
    mockDisconnectSocket.mockReset();
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      total: 0,
      loading: false,
      page: 1,
      perPage: 20,
    });
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('calls fetchNotifications and fetchUnreadCount on mount', () => {
    const fetchNotifications = jest.fn();
    const fetchUnreadCount = jest.fn();
    useNotificationStore.setState({ fetchNotifications, fetchUnreadCount });

    renderHook(() => useNotifications());

    expect(fetchNotifications).toHaveBeenCalledTimes(1);
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('returns store state and methods', () => {
    const notifications = [sampleNotification];
    const markAsRead = jest.fn();
    const markAllRead = jest.fn();
    const fetchNotifications = jest.fn();
    const fetchUnreadCount = jest.fn();

    useNotificationStore.setState({
      notifications,
      unreadCount: 1,
      loading: false,
      markAsRead,
      markAllRead,
      fetchNotifications,
      fetchUnreadCount,
    });

    const { result } = renderHook(() => useNotifications());

    expect(result.current.notifications).toEqual(notifications);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.markAsRead).toBe(markAsRead);
    expect(result.current.markAllRead).toBe(markAllRead);
    expect(result.current.fetchNotifications).toBe(fetchNotifications);
  });

  it('does not create a socket when there is no access token', () => {
    // No token in localStorage
    renderHook(() => useNotifications());

    expect(mockGetSocket).not.toHaveBeenCalled();
  });

  it('creates a socket connection when an access token exists', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    expect(mockGetSocket).toHaveBeenCalledWith('/notifications');
  });

  it('adds realtime notification when socket receives a valid message', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    // Capture the "notification" event handler
    let notificationHandler: ((data: unknown) => void) | undefined;
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (event === 'notification') {
        notificationHandler = handler;
      }
    });

    renderHook(() => useNotifications());

    expect(notificationHandler).toBeDefined();

    act(() => {
      notificationHandler!(sampleNotification);
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('ws-notif-1');
    expect(state.unreadCount).toBe(1);
  });

  it('handles string notification data (JSON)', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    let notificationHandler: ((data: unknown) => void) | undefined;
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (event === 'notification') {
        notificationHandler = handler;
      }
    });

    renderHook(() => useNotifications());

    act(() => {
      notificationHandler!(JSON.stringify(sampleNotification));
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('ws-notif-1');
  });

  it('ignores malformed messages without crashing', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    let notificationHandler: ((data: unknown) => void) | undefined;
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (event === 'notification') {
        notificationHandler = handler;
      }
    });

    renderHook(() => useNotifications());

    // Should not throw
    act(() => {
      notificationHandler!('not valid json{{{');
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
  });

  it('disconnects socket on unmount', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    const { unmount } = renderHook(() => useNotifications());

    unmount();

    expect(mockDisconnectSocket).toHaveBeenCalledWith('/notifications');
  });
});
