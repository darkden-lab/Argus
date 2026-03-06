import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import LoginPage from '@/app/login/page';
import { useAuthStore } from '@/stores/auth';

const mockPush = jest.fn();
const mockLogin = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Mock global fetch for setup/status and OIDC info
const mockFetch = jest.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
    });

    // Default: no setup required, OIDC disabled
    global.fetch = mockFetch;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: false }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ enabled: false }),
        });
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'test-token',
              refresh_token: 'test-refresh',
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  // Note: next-intl is mocked — t('key') returns the raw key string.
  // So t('email') => 'email', t('login_title') => 'login_title', etc.

  it('renders login form with email and password fields', () => {
    render(<LoginPage />);

    // Labels come from t('email') and t('password') which return raw keys
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login_button' })).toBeInTheDocument();
  });

  it('renders page title and subtitle', () => {
    render(<LoginPage />);

    expect(screen.getByText('login_title')).toBeInTheDocument();
    expect(screen.getByText('login_subtitle')).toBeInTheDocument();
  });

  it('renders contact admin text and footer', () => {
    render(<LoginPage />);

    expect(screen.getByText('contact_admin')).toBeInTheDocument();
    expect(screen.getByText('footer')).toBeInTheDocument();
  });

  it('allows typing in email and password fields', async () => {
    const { user } = render(<LoginPage />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');

    await user.type(emailInput, 'admin@example.com');
    await user.type(passwordInput, 'secret123');

    expect(emailInput).toHaveValue('admin@example.com');
    expect(passwordInput).toHaveValue('secret123');
  });

  it('calls login on form submission and redirects to dashboard', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const { user } = render(<LoginPage />);

    await user.type(screen.getByLabelText('email'), 'admin@example.com');
    await user.type(screen.getByLabelText('password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'secret123');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const { user } = render(<LoginPage />);

    await user.type(screen.getByLabelText('email'), 'bad@example.com');
    await user.type(screen.getByLabelText('password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('displays generic error when login throws non-Error', async () => {
    mockLogin.mockRejectedValueOnce('something went wrong');
    const { user } = render(<LoginPage />);

    await user.type(screen.getByLabelText('email'), 'bad@example.com');
    await user.type(screen.getByLabelText('password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('shows loading state when isLoading is true', () => {
    useAuthStore.setState({ isLoading: true });
    render(<LoginPage />);

    expect(screen.getByText('login_loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login_loading/i })).toBeDisabled();
  });

  it('redirects to setup when setup is required', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: true }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ enabled: false }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/setup');
    });
  });

  it('shows OIDC login button when OIDC is enabled with provider name', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: false }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ enabled: true, provider_name: 'Keycloak' }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<LoginPage />);

    // t('oidc_login_provider', { provider: 'Keycloak' }) => 'oidc_login_provider'
    // The mock replaces {provider} in the key but key has no braces, so it stays as-is
    await waitFor(() => {
      expect(
        screen.getByText('oidc_login_provider')
      ).toBeInTheDocument();
    });

    // Also shows the "or" divider
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('shows generic SSO button when OIDC has no provider name', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: false }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ enabled: true }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('oidc_login')).toBeInTheDocument();
    });
  });

  it('does not show OIDC button when OIDC is disabled', async () => {
    render(<LoginPage />);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(screen.queryByText('oidc_login')).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('renders clickable OIDC button of type button', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: false }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ enabled: true, provider_name: 'Okta' }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('oidc_login_provider')).toBeInTheDocument();
    });

    // The OIDC button should be a regular button (not submit)
    const oidcButton = screen.getByText('oidc_login_provider').closest('button');
    expect(oidcButton).toHaveAttribute('type', 'button');
    expect(oidcButton).not.toBeDisabled();
  });

  it('handles OIDC info fetch failure gracefully', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ setup_required: false }),
        });
      }
      if (url.includes('/api/auth/oidc/info')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<LoginPage />);

    // Should still render the form without OIDC button
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.queryByText('oidc_login')).not.toBeInTheDocument();
  });

  it('clears error on new submission', async () => {
    mockLogin
      .mockRejectedValueOnce(new Error('Invalid credentials'))
      .mockResolvedValueOnce(undefined);

    const { user } = render(<LoginPage />);

    // First attempt: fail
    await user.type(screen.getByLabelText('email'), 'bad@example.com');
    await user.type(screen.getByLabelText('password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    // Second attempt: error should be cleared on submit
    await user.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(
        screen.queryByText('Invalid credentials')
      ).not.toBeInTheDocument();
    });
  });

  it('has correct input types for email and password', () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('has correct placeholders', () => {
    render(<LoginPage />);

    expect(
      screen.getByPlaceholderText('admin@example.com')
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter your password')
    ).toBeInTheDocument();
  });
});
