import React from 'react';
import { render, screen, waitFor, act } from '../test-utils';
import LoginPage from '@/app/login/page';
import { useAuthStore } from '@/stores/auth';

const mockLogin = jest.fn();
const mockPush = jest.fn();

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

function renderLoginPage() {
  const result = render(<LoginPage />);
  return result;
}

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
    });

    // Default: OIDC disabled
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    });
  });

  it('renders the login form', async () => {
    await act(async () => {
      renderLoginPage();
    });

    // With i18n mock, t('login_title') returns 'login_title', t('email') returns 'email', etc.
    expect(screen.getByText('login_title')).toBeInTheDocument();
    expect(screen.getByText('login_subtitle')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login_button' })).toBeInTheDocument();
  });

  it('submits login form with correct values', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    let user: ReturnType<typeof render>['user'];
    await act(async () => {
      const result = renderLoginPage();
      user = result.user;
    });

    await user!.type(screen.getByLabelText('email'), 'admin@example.com');
    await user!.type(screen.getByLabelText('password'), 'password123');
    await user!.click(screen.getByRole('button', { name: 'login_button' }));

    expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'password123');
  });

  it('redirects to dashboard on successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    let user: ReturnType<typeof render>['user'];
    await act(async () => {
      const result = renderLoginPage();
      user = result.user;
    });

    await user!.type(screen.getByLabelText('email'), 'admin@example.com');
    await user!.type(screen.getByLabelText('password'), 'pass');
    await user!.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    let user: ReturnType<typeof render>['user'];
    await act(async () => {
      const result = renderLoginPage();
      user = result.user;
    });

    await user!.type(screen.getByLabelText('email'), 'bad@example.com');
    await user!.type(screen.getByLabelText('password'), 'wrong');
    await user!.click(screen.getByRole('button', { name: 'login_button' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables submit button when isLoading is true', async () => {
    useAuthStore.setState({ isLoading: true, login: mockLogin });

    await act(async () => {
      renderLoginPage();
    });

    const button = screen.getByRole('button', { name: /login_loading/i });
    expect(button).toBeDisabled();
  });

  it('shows loading text when isLoading', async () => {
    useAuthStore.setState({ isLoading: true, login: mockLogin });

    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('login_loading')).toBeInTheDocument();
  });

  it('shows admin contact message instead of register link', async () => {
    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('contact_admin')).toBeInTheDocument();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
  });

  it('shows OIDC button when OIDC is enabled with provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, provider_name: 'Keycloak' }),
    });

    await act(async () => {
      renderLoginPage();
    });

    // Mock t('oidc_login_provider', { provider: 'Keycloak' }) returns 'oidc_login_provider'
    // because the mock replaces {provider} in key text but key doesn't contain {provider}
    await waitFor(() => {
      expect(screen.getByText('oidc_login_provider')).toBeInTheDocument();
    });
  });

  it('shows generic SSO text when OIDC provider name is not set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    });

    await act(async () => {
      renderLoginPage();
    });

    await waitFor(() => {
      expect(screen.getByText('oidc_login')).toBeInTheDocument();
    });
  });

  it('does not show OIDC button when disabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    });

    await act(async () => {
      renderLoginPage();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.queryByText('oidc_login')).not.toBeInTheDocument();
  });

  it('renders the brand footer', async () => {
    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('footer')).toBeInTheDocument();
  });
});
