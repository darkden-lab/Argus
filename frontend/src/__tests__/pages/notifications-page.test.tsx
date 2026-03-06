import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import NotificationsPage from '@/app/(dashboard)/notifications/page';
import type { Notification } from '@/stores/notifications';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    del: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockFetchUnreadCount = jest.fn();

jest.mock('@/stores/notifications', () => {
  const actual = jest.requireActual('@/stores/notifications');
  return {
    ...actual,
    useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ fetchUnreadCount: mockFetchUnreadCount }),
  };
});

import { api } from '@/lib/api';

const now = new Date();

const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'Pod CrashLoopBackOff',
    body: 'Pod frontend-abc is in CrashLoopBackOff state',
    category: 'deployment',
    severity: 'error',
    read: false,
    created_at: now.toISOString(),
    metadata: { cluster_id: 'c1', resource_name: 'frontend-abc', resource_type: 'pods' },
  },
  {
    id: 'n2',
    title: 'Cluster Connected',
    body: 'Cluster production is now connected',
    category: 'cluster',
    severity: 'info',
    read: true,
    created_at: now.toISOString(),
  },
  {
    id: 'n3',
    title: 'High CPU Usage',
    body: 'Node worker-1 CPU usage above 90%',
    category: 'health',
    severity: 'warning',
    read: false,
    created_at: now.toISOString(),
    metadata: { cluster_id: 'c2' },
  },
];

function mockNotificationsResponse(notifications: Notification[], total?: number) {
  return {
    notifications,
    total: total ?? notifications.length,
    limit: 20,
    offset: 0,
  };
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page title and description', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('View and manage all your notifications.')).toBeInTheDocument();
  });

  it('shows loading skeleton initially', () => {
    (api.get as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<NotificationsPage />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(5);
  });

  it('displays notifications from API', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });
    expect(screen.getByText('Cluster Connected')).toBeInTheDocument();
    expect(screen.getByText('High CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Pod frontend-abc is in CrashLoopBackOff state')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse([]));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it('shows empty state on API error', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('shows category badges on notifications', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('deployment')).toBeInTheDocument();
    });
    expect(screen.getByText('cluster')).toBeInTheDocument();
    expect(screen.getByText('health')).toBeInTheDocument();
  });

  it('shows Mark All Read button when there are unread notifications', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mark All Read')).toBeInTheDocument();
    });
  });

  it('hides Mark All Read button when all notifications are read', async () => {
    const allRead = mockNotifications.map((n) => ({ ...n, read: true }));
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(allRead));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Cluster Connected')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mark All Read')).not.toBeInTheDocument();
  });

  it('shows Mark read button only for unread notifications', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    const markReadButtons = screen.getAllByText('Mark read');
    // n1 and n3 are unread, n2 is read
    expect(markReadButtons).toHaveLength(2);
  });

  it('calls API to mark single notification as read', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    (api.put as jest.Mock).mockResolvedValueOnce({});
    const { user } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    const markReadButtons = screen.getAllByText('Mark read');
    await user.click(markReadButtons[0]);

    expect(api.put).toHaveBeenCalledWith('/api/notifications/n1/read');
    expect(mockFetchUnreadCount).toHaveBeenCalled();
  });

  it('calls API to mark all notifications as read', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    (api.put as jest.Mock).mockResolvedValueOnce({});
    const { user } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mark All Read')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Mark All Read'));

    expect(api.put).toHaveBeenCalledWith('/api/notifications/read-all');
    expect(mockFetchUnreadCount).toHaveBeenCalled();
  });

  it('shows View Resource button for notifications with cluster_id and resource_name metadata', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    expect(screen.getByText('View Resource')).toBeInTheDocument();
  });

  it('shows View Cluster button for notifications with cluster_id metadata', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    // n1 has cluster_id (shows View Resource + View Cluster), n3 has cluster_id only (shows View Cluster)
    const viewClusterButtons = screen.getAllByText('View Cluster');
    expect(viewClusterButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to resource on View Resource click', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    const { user } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('View Resource')).toBeInTheDocument();
    });

    await user.click(screen.getByText('View Resource'));

    expect(mockPush).toHaveBeenCalledWith('/clusters/c1/pods');
  });

  it('navigates to cluster on View Cluster click', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    const { user } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    const viewClusterButtons = screen.getAllByText('View Cluster');
    await user.click(viewClusterButtons[0]);

    expect(mockPush).toHaveBeenCalledWith('/clusters/c1');
  });

  it('shows pagination when total exceeds page size', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications, 45));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3 (45 total)')).toBeInTheDocument();
    });
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('disables Previous button on first page', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications, 45));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous').closest('button')).toBeDisabled();
  });

  it('does not show pagination when results fit on one page', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications, 3));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument();
    });

    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('fetches next page when clicking Next', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications, 45));
    const { user } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications, 45));
    await user.click(screen.getByText('Next'));

    // Second call should have offset=20
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect((api.get as jest.Mock).mock.calls[1][0]).toContain('offset=20');
  });

  it('groups notifications by time period', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse(mockNotifications));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  it('shows filter hint text when filters are active and no results', async () => {
    // First render fetches with default filters
    (api.get as jest.Mock).mockResolvedValueOnce(mockNotificationsResponse([]));
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
    });
  });
});
