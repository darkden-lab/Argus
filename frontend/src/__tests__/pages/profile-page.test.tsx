import React from 'react';
import { render, screen } from '../test-utils';

// Mock useTheme
jest.mock('@/components/ui/theme-provider', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: jest.fn(),
    resolvedTheme: 'dark',
  }),
}));

// Mock the auth store
const mockUpdateProfile = jest.fn();
const mockChangePassword = jest.fn();
const mockUpdatePreferences = jest.fn();

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: (state: unknown) => unknown) =>
    selector({
      user: {
        id: '1',
        email: 'admin@test.com',
        display_name: 'Admin User',
        auth_provider: 'local',
      },
      preferences: {
        theme: 'system',
        language: 'en',
        sidebar_compact: false,
        animations_enabled: true,
      },
      updateProfile: mockUpdateProfile,
      changePassword: mockChangePassword,
      updatePreferences: mockUpdatePreferences,
    })
  ),
}));

import ProfilePage from '@/app/(dashboard)/settings/profile/page';

describe('ProfilePage', () => {
  it('renders account section with user info', () => {
    render(<ProfilePage />);
    // The mock useTranslations returns the key as text
    expect(screen.getByText('account')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
  });

  it('renders security section for local users', () => {
    render(<ProfilePage />);
    expect(screen.getByText('security')).toBeInTheDocument();
  });

  it('renders preferences section', () => {
    render(<ProfilePage />);
    expect(screen.getByText('preferences')).toBeInTheDocument();
  });

  it('renders theme options', () => {
    render(<ProfilePage />);
    expect(screen.getByText('theme_system')).toBeInTheDocument();
    expect(screen.getByText('theme_light')).toBeInTheDocument();
    expect(screen.getByText('theme_dark')).toBeInTheDocument();
  });

  it('renders AI Memories section', () => {
    render(<ProfilePage />);
    expect(screen.getByText('ai_memories')).toBeInTheDocument();
  });
});
