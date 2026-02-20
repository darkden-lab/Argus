import React from 'react';
import { render, screen, act } from '../test-utils';
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
  return render(<LoginPage />);
}

describe('Login Page Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    });
  });

  describe('password field security', () => {
    it('password input has type="password" to prevent display in DOM', async () => {
      await act(async () => {
        renderLoginPage();
      });

      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('password input has autocomplete="current-password" for secure autofill', async () => {
      await act(async () => {
        renderLoginPage();
      });

      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    it('email input has autocomplete="email" for proper autofill', async () => {
      await act(async () => {
        renderLoginPage();
      });

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    it('password field type stays password after user types (not switched to text)', async () => {
      let user: ReturnType<typeof render>['user'];
      await act(async () => {
        const result = renderLoginPage();
        user = result.user;
      });

      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
      await user!.type(passwordInput, 'mysecretpassword');

      // The critical security check: input type must remain "password"
      // so the browser masks the characters visually
      expect(passwordInput.type).toBe('password');
      // The input should not have been converted to a text field
      expect(passwordInput.type).not.toBe('text');
    });
  });

  describe('form submission security', () => {
    it('email input has type="email" for basic format validation', async () => {
      await act(async () => {
        renderLoginPage();
      });

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('both fields are required to prevent empty submissions', async () => {
      await act(async () => {
        renderLoginPage();
      });

      expect(screen.getByLabelText('Email')).toBeRequired();
      expect(screen.getByLabelText('Password')).toBeRequired();
    });

    it('uses form submit (not manual click handler) for proper browser validation', async () => {
      await act(async () => {
        renderLoginPage();
      });

      const form = screen.getByLabelText('Email').closest('form');
      expect(form).toBeInTheDocument();
      expect(form?.tagName).toBe('FORM');
    });
  });

  describe('error message handling', () => {
    it('displays error from server without executing HTML/script content', async () => {
      mockLogin.mockRejectedValueOnce(
        new Error('<script>alert("xss")</script>')
      );

      let user: ReturnType<typeof render>['user'];
      await act(async () => {
        const result = renderLoginPage();
        user = result.user;
      });

      await user!.type(screen.getByLabelText('Email'), 'test@test.com');
      await user!.type(screen.getByLabelText('Password'), 'pass');
      await user!.click(screen.getByRole('button', { name: /sign in/i }));

      // React renders the script tag as text, not as executable HTML
      const errorElement = await screen.findByText(
        '<script>alert("xss")</script>'
      );
      expect(errorElement).toBeInTheDocument();
      // Verify it's rendered as text content, not as an actual script element
      expect(errorElement.tagName).not.toBe('SCRIPT');
    });

    it('does not include credentials in error display', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

      let user: ReturnType<typeof render>['user'];
      await act(async () => {
        const result = renderLoginPage();
        user = result.user;
      });

      await user!.type(screen.getByLabelText('Email'), 'admin@test.com');
      await user!.type(screen.getByLabelText('Password'), 'secretpass123');
      await user!.click(screen.getByRole('button', { name: /sign in/i }));

      const errorElement = await screen.findByText('Invalid credentials');
      expect(errorElement.textContent).not.toContain('secretpass123');
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockLogin.mockRejectedValueOnce('string error');

      let user: ReturnType<typeof render>['user'];
      await act(async () => {
        const result = renderLoginPage();
        user = result.user;
      });

      await user!.type(screen.getByLabelText('Email'), 'test@test.com');
      await user!.type(screen.getByLabelText('Password'), 'pass');
      await user!.click(screen.getByRole('button', { name: /sign in/i }));

      // Falls back to 'Login failed' for non-Error objects
      const errorElement = await screen.findByText('Login failed');
      expect(errorElement).toBeInTheDocument();
    });
  });

  describe('OIDC security', () => {
    it('does not render OIDC button when OIDC info fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        renderLoginPage();
      });

      // Wait for the effect to resolve
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(screen.queryByText(/sign in with/i)).not.toBeInTheDocument();
    });

    it('does not render SSO provider name from XSS payload as HTML', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: true,
          provider_name: '<img src=x onerror=alert(1)>',
        }),
      });

      await act(async () => {
        renderLoginPage();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // React escapes the content, so it should be rendered as text
      const button = await screen.findByRole('button', {
        name: /sign in with/i,
      });
      expect(button).toBeInTheDocument();
      // The text should contain the literal string, not execute as HTML
      expect(button.textContent).toContain('<img src=x onerror=alert(1)>');
      // No actual img element should be created
      expect(button.querySelector('img[src="x"]')).toBeNull();
    });
  });
});
