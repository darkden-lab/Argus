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

// Mock SSE client used by the notifications hook
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

let capturedOnEvent: ((type: string, data: unknown) => void) | undefined;

jest.mock('@/lib/sse-client', () => ({
  SSEClient: jest.fn().mockImplementation((opts: { onEvent: (type: string, data: unknown) => void }) => {
    capturedOnEvent = opts.onEvent;
    return {
      connect: mockConnect,
      disconnect: mockDisconnect,
      connected: false,
    };
  }),
  getToken: jest.fn(() => null),
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
    mockConnect.mockReset();
    mockDisconnect.mockReset();
    capturedOnEvent = undefined;
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

  it('does not create an SSE connection when there is no access token', () => {
    // No token in localStorage — getToken returns null
    renderHook(() => useNotifications());

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('creates an SSE connection when an access token exists', () => {
    // Make getToken return a token
    const sseClientModule = jest.requireMock<{ getToken: jest.Mock }>('@/lib/sse-client');
    sseClientModule.getToken.mockReturnValue('test-jwt-token');
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    expect(mockConnect).toHaveBeenCalled();
  });

  it('adds realtime notification when SSE receives a valid message', () => {
    const sseClientModule = jest.requireMock<{ getToken: jest.Mock }>('@/lib/sse-client');
    sseClientModule.getToken.mockReturnValue('test-jwt-token');
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    expect(capturedOnEvent).toBeDefined();

    act(() => {
      capturedOnEvent!('notification', sampleNotification);
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('ws-notif-1');
    expect(state.unreadCount).toBe(1);
  });

  it('handles string notification data (JSON)', () => {
    const sseClientModule = jest.requireMock<{ getToken: jest.Mock }>('@/lib/sse-client');
    sseClientModule.getToken.mockReturnValue('test-jwt-token');
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    act(() => {
      capturedOnEvent!('notification', JSON.stringify(sampleNotification));
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('ws-notif-1');
  });

  it('ignores malformed messages without crashing', () => {
    const sseClientModule = jest.requireMock<{ getToken: jest.Mock }>('@/lib/sse-client');
    sseClientModule.getToken.mockReturnValue('test-jwt-token');
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    // Should not throw
    act(() => {
      capturedOnEvent!('notification', 'not valid json{{{');
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
  });

  it('disconnects SSE client on unmount', () => {
    const sseClientModule = jest.requireMock<{ getToken: jest.Mock }>('@/lib/sse-client');
    sseClientModule.getToken.mockReturnValue('test-jwt-token');
    localStorage.setItem('access_token', 'test-jwt-token');

    const { unmount } = renderHook(() => useNotifications());

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });
});
