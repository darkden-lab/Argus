import React from 'react';
import { render, screen } from '../test-utils';
import SettingsLayout from '@/app/(dashboard)/settings/layout';
import SettingsHubPage from '@/app/(dashboard)/settings/page';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/settings/users',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

describe('SettingsHubPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the settings page title and description', () => {
    render(<SettingsHubPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByText('Manage your Argus instance configuration.')
    ).toBeInTheDocument();
  });

  it('renders all settings section cards', () => {
    render(<SettingsHubPage />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Manage user accounts and access')).toBeInTheDocument();

    expect(screen.getByText('Roles & Permissions')).toBeInTheDocument();
    expect(screen.getByText('Configure RBAC roles and policies')).toBeInTheDocument();

    expect(screen.getByText('OIDC / SSO')).toBeInTheDocument();
    expect(screen.getByText('Single sign-on and identity provider')).toBeInTheDocument();

    expect(screen.getByText('Notification Rules')).toBeInTheDocument();
    expect(screen.getByText('Configure alerts and notification triggers')).toBeInTheDocument();

    expect(screen.getByText('Notification Channels')).toBeInTheDocument();
    expect(screen.getByText('Email, Slack, Teams, Telegram, Webhook')).toBeInTheDocument();

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('LLM provider, model, and RAG settings')).toBeInTheDocument();

    expect(screen.getByText('Plugins')).toBeInTheDocument();
    expect(screen.getByText('Enable and configure cluster plugins')).toBeInTheDocument();

    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Review system activity and changes')).toBeInTheDocument();
  });

  it('renders exactly 8 settings section cards', () => {
    const { container } = render(<SettingsHubPage />);

    // Each section renders as a Card with cursor-pointer class
    const cards = container.querySelectorAll('[class*="cursor-pointer"]');
    expect(cards).toHaveLength(8);
  });

  it('navigates to /settings/users when Users card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Manage user accounts and access'));

    expect(mockPush).toHaveBeenCalledWith('/settings/users');
  });

  it('navigates to /settings/roles when Roles card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Configure RBAC roles and policies'));

    expect(mockPush).toHaveBeenCalledWith('/settings/roles');
  });

  it('navigates to /settings/oidc when OIDC card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Single sign-on and identity provider'));

    expect(mockPush).toHaveBeenCalledWith('/settings/oidc');
  });

  it('navigates to /settings/notifications when Notification Rules card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Configure alerts and notification triggers'));

    expect(mockPush).toHaveBeenCalledWith('/settings/notifications');
  });

  it('navigates to /settings/notification-channels when Channels card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Email, Slack, Teams, Telegram, Webhook'));

    expect(mockPush).toHaveBeenCalledWith('/settings/notification-channels');
  });

  it('navigates to /settings/ai when AI Assistant card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('LLM provider, model, and RAG settings'));

    expect(mockPush).toHaveBeenCalledWith('/settings/ai');
  });

  it('navigates to /settings/plugins when Plugins card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Enable and configure cluster plugins'));

    expect(mockPush).toHaveBeenCalledWith('/settings/plugins');
  });

  it('navigates to /settings/audit when Audit Log card is clicked', async () => {
    const { user } = render(<SettingsHubPage />);

    await user.click(screen.getByText('Review system activity and changes'));

    expect(mockPush).toHaveBeenCalledWith('/settings/audit');
  });
});

describe('SettingsLayout', () => {
  it('renders the settings title and description', () => {
    render(
      <SettingsLayout>
        <div>Child content</div>
      </SettingsLayout>
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByText('Manage users, roles, plugins, and authentication.')
    ).toBeInTheDocument();
  });

  it('renders all navigation links', () => {
    render(
      <SettingsLayout>
        <div>Child content</div>
      </SettingsLayout>
    );

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
    expect(screen.getByText('OIDC')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('renders navigation links with correct hrefs', () => {
    render(
      <SettingsLayout>
        <div>Child content</div>
      </SettingsLayout>
    );

    expect(screen.getByText('Users').closest('a')).toHaveAttribute(
      'href',
      '/settings/users'
    );
    expect(screen.getByText('Roles').closest('a')).toHaveAttribute(
      'href',
      '/settings/roles'
    );
    expect(screen.getByText('Plugins').closest('a')).toHaveAttribute(
      'href',
      '/settings/plugins'
    );
    expect(screen.getByText('OIDC').closest('a')).toHaveAttribute(
      'href',
      '/settings/oidc'
    );
    expect(screen.getByText('Audit Log').closest('a')).toHaveAttribute(
      'href',
      '/settings/audit'
    );
    expect(screen.getByText('Notifications').closest('a')).toHaveAttribute(
      'href',
      '/settings/notifications'
    );
    expect(screen.getByText('Channels').closest('a')).toHaveAttribute(
      'href',
      '/settings/notification-channels'
    );
    expect(screen.getByText('AI Assistant').closest('a')).toHaveAttribute(
      'href',
      '/settings/ai'
    );
  });

  it('renders children content', () => {
    render(
      <SettingsLayout>
        <div>Test child content</div>
      </SettingsLayout>
    );

    expect(screen.getByText('Test child content')).toBeInTheDocument();
  });

  it('highlights the active navigation item', () => {
    render(
      <SettingsLayout>
        <div>Content</div>
      </SettingsLayout>
    );

    const usersLink = screen.getByText('Users').closest('a');
    // Active link should have the active class (font-medium)
    expect(usersLink).toHaveClass('font-medium');
  });

  it('does not highlight non-active navigation items', () => {
    render(
      <SettingsLayout>
        <div>Content</div>
      </SettingsLayout>
    );

    const rolesLink = screen.getByText('Roles').closest('a');
    expect(rolesLink).not.toHaveClass('font-medium');
  });
});
