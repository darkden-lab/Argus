import React from 'react';
import { render, screen } from '../test-utils';
import { NotificationDropdown } from '@/components/notifications/notification-dropdown';
import type { Notification } from '@/stores/notifications';

// Mock ResizeObserver for Radix ScrollArea
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) {
    return <a href={href} {...props}>{children}</a>;
  };
});

const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'Pod crashed',
    body: 'Pod nginx-abc crashed in namespace default',
    category: 'cluster',
    severity: 'error',
    read: false,
    created_at: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
  },
  {
    id: 'n2',
    title: 'Deployment updated',
    body: 'Deployment web-app updated successfully',
    category: 'deployment',
    severity: 'info',
    read: true,
    created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  },
  {
    id: 'n3',
    title: 'Security alert',
    body: 'Suspicious activity detected',
    category: 'security',
    severity: 'critical',
    read: false,
    created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
];

describe('NotificationDropdown', () => {
  const mockMarkRead = jest.fn();
  const mockMarkAllRead = jest.fn();
  const mockClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders notifications title', () => {
    render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders notification items', () => {
    render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('Pod crashed')).toBeInTheDocument();
    expect(screen.getByText('Deployment updated')).toBeInTheDocument();
    expect(screen.getByText('Security alert')).toBeInTheDocument();
  });

  it('renders notification bodies', () => {
    render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('Pod nginx-abc crashed in namespace default')).toBeInTheDocument();
  });

  it('shows "Mark all read" button when there are unread notifications', () => {
    render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('Mark all read')).toBeInTheDocument();
  });

  it('hides "Mark all read" when all notifications are read', () => {
    const allRead = mockNotifications.map((n) => ({ ...n, read: true }));

    render(
      <NotificationDropdown
        notifications={allRead}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('calls onMarkAllRead when button is clicked', async () => {
    const { user } = render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    await user.click(screen.getByText('Mark all read'));
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('calls onMarkRead when unread notification is clicked', async () => {
    const { user } = render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    // Click the first unread notification's button container
    await user.click(screen.getByText('Pod crashed'));
    expect(mockMarkRead).toHaveBeenCalledWith('n1');
  });

  it('does not call onMarkRead when read notification is clicked', async () => {
    const { user } = render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    await user.click(screen.getByText('Deployment updated'));
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('shows empty state when no notifications', () => {
    render(
      <NotificationDropdown
        notifications={[]}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('All caught up!')).toBeInTheDocument();
    expect(screen.getByText('No new notifications')).toBeInTheDocument();
  });

  it('renders "View all notifications" link', () => {
    render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    const link = screen.getByText('View all notifications');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/notifications');
  });

  it('calls onClose when "View all" link is clicked', async () => {
    const { user } = render(
      <NotificationDropdown
        notifications={mockNotifications}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    await user.click(screen.getByText('View all notifications'));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('displays category labels', () => {
    render(
      <NotificationDropdown
        notifications={[mockNotifications[0]]}
        onMarkRead={mockMarkRead}
        onMarkAllRead={mockMarkAllRead}
        onClose={mockClose}
      />
    );

    expect(screen.getByText('cluster')).toBeInTheDocument();
  });
});
