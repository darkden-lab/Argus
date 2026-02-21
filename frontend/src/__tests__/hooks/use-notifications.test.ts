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

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn(() => {
    // Trigger onclose when close is called
    if (this.onerror === null && this.onclose) {
      this.onclose();
    }
  });
  send = jest.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

const originalWebSocket = global.WebSocket;

beforeAll(() => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterAll(() => {
  global.WebSocket = originalWebSocket;
});

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
    jest.useFakeTimers();
    MockWebSocket.instances = [];
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

  afterEach(() => {
    jest.useRealTimers();
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

  it('does not create a WebSocket when there is no access token', () => {
    // No token in localStorage
    renderHook(() => useNotifications());

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('creates a WebSocket connection when an access token exists', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain(
      '/ws/notifications?token=test-jwt-token'
    );
  });

  it('adds realtime notification when WebSocket receives a valid message', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({ data: JSON.stringify(sampleNotification) });
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('ws-notif-1');
    expect(state.unreadCount).toBe(1);
  });

  it('ignores malformed WebSocket messages without crashing', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    const ws = MockWebSocket.instances[0];

    // Should not throw
    act(() => {
      ws.onmessage?.({ data: 'not valid json{{{' });
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
  });

  it('resets reconnect delay on successful connection', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    const ws = MockWebSocket.instances[0];

    // Simulate a successful open
    act(() => {
      ws.onopen?.();
    });

    // Now simulate the connection closing
    act(() => {
      ws.onclose?.();
    });

    // Advance timers by the base reconnect delay (1000ms)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // A new WebSocket should have been created for the reconnect
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('cleans up WebSocket on unmount', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    const { unmount } = renderHook(() => useNotifications());

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('closes WebSocket on error and triggers reconnect', () => {
    localStorage.setItem('access_token', 'test-jwt-token');

    renderHook(() => useNotifications());

    const ws = MockWebSocket.instances[0];

    // Simulate an error which should call ws.close()
    act(() => {
      ws.onerror?.();
    });

    expect(ws.close).toHaveBeenCalled();
  });
});
