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

    expect(screen.getByText('Argus')).toBeInTheDocument();
    expect(screen.getByText('Multi-cluster Kubernetes Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits login form with correct values', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    let user: ReturnType<typeof render>['user'];
    await act(async () => {
      const result = renderLoginPage();
      user = result.user;
    });

    await user!.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user!.type(screen.getByLabelText('Password'), 'password123');
    await user!.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'password123');
  });

  it('redirects to dashboard on successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    let user: ReturnType<typeof render>['user'];
    await act(async () => {
      const result = renderLoginPage();
      user = result.user;
    });

    await user!.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user!.type(screen.getByLabelText('Password'), 'pass');
    await user!.click(screen.getByRole('button', { name: /sign in/i }));

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

    await user!.type(screen.getByLabelText('Email'), 'bad@example.com');
    await user!.type(screen.getByLabelText('Password'), 'wrong');
    await user!.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables submit button when isLoading is true', async () => {
    useAuthStore.setState({ isLoading: true, login: mockLogin });

    await act(async () => {
      renderLoginPage();
    });

    const button = screen.getByRole('button', { name: /signing in/i });
    expect(button).toBeDisabled();
  });

  it('shows "Signing in..." text when loading', async () => {
    useAuthStore.setState({ isLoading: true, login: mockLogin });

    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('Signing in...')).toBeInTheDocument();
  });

  it('shows admin contact message instead of register link', async () => {
    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('Contact your administrator for account creation.')).toBeInTheDocument();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
  });

  it('shows OIDC button when OIDC is enabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, provider_name: 'Keycloak' }),
    });

    await act(async () => {
      renderLoginPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Sign in with Keycloak')).toBeInTheDocument();
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
      expect(screen.getByText('Sign in with SSO')).toBeInTheDocument();
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

    expect(screen.queryByText(/sign in with/i)).not.toBeInTheDocument();
  });

  it('renders the brand tagline', async () => {
    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText(/Kubernetes Infrastructure Management/)).toBeInTheDocument();
  });
});
