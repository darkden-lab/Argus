import React from 'react';
import { render, screen } from '../test-utils';
import SettingsLayout from '@/app/(dashboard)/settings/layout';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/settings/users',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

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
