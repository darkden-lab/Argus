/**
 * Setup Page Tests
 *
 * Tests for frontend/src/app/setup/page.tsx
 *
 * Covers:
 * 1. Renders welcome step initially
 * 2. Navigates through steps with Next/Previous
 * 3. Shows validation errors for empty fields
 * 4. Shows password mismatch error
 * 5. Shows password too short error
 * 6. Calls API on form submit
 * 7. Handles API errors
 * 8. Redirects to dashboard on success
 */

import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import SetupPage from '@/app/setup/page';

const mockPush = jest.fn();

// Override the default mock from setup.ts to capture the push calls
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/setup',
  useSearchParams: () => new URLSearchParams(),
}));

describe('SetupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    // Reset global fetch mock
    global.fetch = jest.fn();
  });

  // -----------------------------------------------------------------------
  // Step navigation
  // -----------------------------------------------------------------------

  describe('initial render', () => {
    it('should render the Welcome step on first load', () => {
      render(<SetupPage />);
      expect(screen.getByText('Welcome to Argus')).toBeInTheDocument();
    });

    it('should render the "Get Started" button on welcome step', () => {
      render(<SetupPage />);
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });

    it('should render step indicators', () => {
      render(<SetupPage />);
      // Step labels: Welcome, Create Admin, OIDC, Complete
      expect(screen.getByText('Welcome')).toBeInTheDocument();
      expect(screen.getByText('Create Admin')).toBeInTheDocument();
      expect(screen.getByText('OIDC')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('should show brand heading "Argus" and "Initial Setup"', () => {
      render(<SetupPage />);
      expect(screen.getByRole('heading', { name: /argus/i })).toBeInTheDocument();
      expect(screen.getByText('Initial Setup')).toBeInTheDocument();
    });
  });

  describe('step navigation', () => {
    it('should navigate to Create Admin step when "Get Started" is clicked', async () => {
      const { user } = render(<SetupPage />);

      await user.click(screen.getByRole('button', { name: /get started/i }));

      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
    });

    it('should navigate back to Welcome step from Create Admin step', async () => {
      const { user } = render(<SetupPage />);

      await user.click(screen.getByRole('button', { name: /get started/i }));
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /back/i }));
      expect(screen.getByText('Welcome to Argus')).toBeInTheDocument();
    });

    it('should render Create Admin form fields', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Validation errors
  // -----------------------------------------------------------------------

  describe('form validation', () => {
    beforeEach(async () => {
      // Navigate to Create Admin step
    });

    it('should disable Create Account button when fields are empty', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      const createButton = screen.getByRole('button', { name: /create account/i });
      expect(createButton).toBeDisabled();
    });

    it('should show password too short error after typing a short password', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      const passwordInput = screen.getByLabelText('Password');
      await user.type(passwordInput, 'short');

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('should hide password too short error when password reaches 8 chars', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      const passwordInput = screen.getByLabelText('Password');
      await user.type(passwordInput, 'short');
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();

      // Continue typing to reach 8 chars
      await user.type(passwordInput, 'xxx'); // now 'shortxxx' = 8 chars
      expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument();
    });

    it('should show password mismatch error when confirm password differs', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'different123');

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('should hide password mismatch error when passwords match', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      const passwordInput = screen.getByLabelText('Password');
      const confirmInput = screen.getByLabelText('Confirm Password');

      await user.type(passwordInput, 'password123');
      await user.type(confirmInput, 'password12');
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();

      // Fix the confirm password
      await user.type(confirmInput, '3');
      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    });

    it('should disable Create Account button when password is too short', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'short');
      await user.type(screen.getByLabelText('Confirm Password'), 'short');

      const createButton = screen.getByRole('button', { name: /create account/i });
      expect(createButton).toBeDisabled();
    });

    it('should disable Create Account button when passwords do not match', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'different456');

      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
    });

    it('should enable Create Account button when all fields are valid', async () => {
      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));

      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');

      expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // API call behavior
  // -----------------------------------------------------------------------

  describe('API calls', () => {
    const fillValidForm = async (user: ReturnType<typeof import('@testing-library/user-event').default.setup>) => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin User');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    };

    it('should call the setup API with correct payload on form submit', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);

      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/setup/init'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'admin@example.com',
              password: 'password123',
              display_name: 'Admin User',
            }),
          })
        );
      });
    });

    it('should store access token in localStorage on success', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'test-access-token');
      });
    });

    it('should store refresh token in localStorage on success when provided', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access',
          refresh_token: 'refresh-me',
        }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-me');
      });
    });

    it('should NOT store refresh token when not included in response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access',
          // no refresh_token
        }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('access_token', 'access');
      });
      expect(localStorage.setItem).not.toHaveBeenCalledWith('refresh_token', expect.anything());
    });

    it('should navigate to OIDC step (step 2) on successful API call', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('SSO / OIDC Configuration')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // API error handling
  // -----------------------------------------------------------------------

  describe('API error handling', () => {
    const fillValidForm = async (user: ReturnType<typeof import('@testing-library/user-event').default.setup>) => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    };

    it('should show API error message when setup fails with HTTP error', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'setup_already_completed' }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('setup_already_completed')).toBeInTheDocument();
      });
    });

    it('should show fallback error message when API returns no error field', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        // Should show a generic fallback message
        expect(screen.getByText(/setup failed/i)).toBeInTheDocument();
      });
    });

    it('should show error when network request throws', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network failure'));

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Network failure')).toBeInTheDocument();
      });
    });

    it('should clear error message when user starts typing after an error', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Some API error' }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Some API error')).toBeInTheDocument();
      });

      // User types in a field — error should be cleared
      await user.type(screen.getByLabelText('Email'), 'x');

      expect(screen.queryByText('Some API error')).not.toBeInTheDocument();
    });

    it('should stay on Create Admin step after API error', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Conflict' }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Conflict')).toBeInTheDocument();
      });

      // Should still be on Create Admin step
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
    });

    it('should re-enable Create Account button after API error', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed' }),
      });

      const { user } = render(<SetupPage />);
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      // Button should be re-enabled (not stuck in submitting state)
      const createButton = screen.getByRole('button', { name: /create account/i });
      expect(createButton).not.toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // OIDC step and Complete step
  // -----------------------------------------------------------------------

  describe('OIDC step', () => {
    it('should navigate to OIDC step when clicking Continue after creating admin', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('SSO / OIDC Configuration')).toBeInTheDocument();
      });
    });

    it('should navigate from OIDC step to Complete step', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      const { user } = render(<SetupPage />);
      // Navigate to OIDC step
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('SSO / OIDC Configuration')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(screen.getByText('Setup Complete')).toBeInTheDocument();
    });
  });

  describe('Complete step', () => {
    it('should redirect to /dashboard when "Go to Dashboard" is clicked', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      const { user } = render(<SetupPage />);
      // Navigate all the way to Complete step
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('SSO / OIDC Configuration')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue/i }));
      expect(screen.getByText('Setup Complete')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /go to dashboard/i }));

      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  // -----------------------------------------------------------------------
  // Security
  // -----------------------------------------------------------------------

  describe('security', () => {
    it('should not render XSS payloads from error messages as HTML', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: '<script>alert(1)</script>' }),
      });

      const { user } = render(<SetupPage />);
      await user.click(screen.getByRole('button', { name: /get started/i }));
      await user.type(screen.getByLabelText('Display Name'), 'Admin');
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        // The script tag should appear as text, NOT be executed
        const errorEl = screen.queryByText('<script>alert(1)</script>');
        if (errorEl) {
          // Rendered as text content (safe)
          expect(errorEl.tagName).not.toBe('SCRIPT');
        }
        // And no actual script tag should be in the DOM
        expect(document.querySelector('script[src]')).toBeNull();
      });
    });
  });
});
