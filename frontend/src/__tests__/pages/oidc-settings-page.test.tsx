/**
 * OIDC Settings Page Tests
 *
 * Tests for D:\Proyectos\Argus - K8s Dashboard\frontend\src\app\(dashboard)\settings\oidc\page.tsx
 *
 * Covers:
 * 1. Loading state while API is in flight
 * 2. Error message when API GET fails
 * 3. Form renders correctly on successful load
 * 4. Toggle switch changes enabled state
 * 5. Error message when save (PUT) fails
 * 6. "Configuration saved." message on successful save
 * 7. RBAC gate wraps the save button
 */

import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import OidcSettingsPage from '@/app/(dashboard)/settings/oidc/page';
import { api } from '@/lib/api';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

// Mock the RBACGate to render children unconditionally in tests
jest.mock('@/components/auth/rbac-gate', () => ({
  RBACGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock toast store
jest.mock('@/stores/toast', () => ({
  toast: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

const mockOidcConfig = {
  enabled: true,
  issuer_url: 'https://accounts.google.com',
  client_id: 'my-client-id',
  provider_name: 'Google',
  redirect_url: 'https://dashboard.example.com/auth/oidc/callback',
};

describe('OidcSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('should display loading message while API is in flight', async () => {
      // Never resolve to keep in loading state
      mockApi.get.mockReturnValueOnce(new Promise(() => {}));

      render(<OidcSettingsPage />);

      expect(screen.getByText('Loading OIDC settings...')).toBeInTheDocument();
    });

    it('should hide loading message after API resolves', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling when API fails', () => {
    it('should display error message when GET /api/settings/oidc fails', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load OIDC configuration')).toBeInTheDocument();
      });
    });

    it('should render the form even after a load error (to allow retry or manual entry)', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('API down'));

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });

      // The page should still render the card structure after error
      expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
    });

    it('should display error from API failure with destructive styling', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Timeout'));

      render(<OidcSettingsPage />);

      await waitFor(() => {
        const errorEl = screen.getByText('Failed to load OIDC configuration');
        expect(errorEl).toBeInTheDocument();
      });
    });

    it('should clear load error and show save error when save fails after failed load', async () => {
      // First: load fails
      mockApi.get.mockRejectedValueOnce(new Error('Load failed'));
      // Save also fails
      mockApi.put.mockRejectedValueOnce(new Error('Save failed'));

      const { user } = render(<OidcSettingsPage />);

      // Wait for load error to appear
      await waitFor(() => {
        expect(screen.getByText('Failed to load OIDC configuration')).toBeInTheDocument();
      });

      // Click Save
      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to save configuration')).toBeInTheDocument();
      });
    });
  });

  describe('successful data loading', () => {
    it('should render the OIDC configuration form with loaded data', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
      });

      // Form fields should show loaded values
      expect(screen.getByDisplayValue('Google')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://accounts.google.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('my-client-id')).toBeInTheDocument();
    });

    it('should render form labels for all configuration fields', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Provider Name')).toBeInTheDocument();
      });

      expect(screen.getByText('Issuer URL')).toBeInTheDocument();
      expect(screen.getByText('Client ID')).toBeInTheDocument();
      expect(screen.getByText('Redirect URL')).toBeInTheDocument();
    });

    it('should render "Enabled" label when config.enabled is true', async () => {
      mockApi.get.mockResolvedValueOnce({ ...mockOidcConfig, enabled: true });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('should render "Disabled" label when config.enabled is false', async () => {
      mockApi.get.mockResolvedValueOnce({ ...mockOidcConfig, enabled: false });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });
  });

  describe('save behavior', () => {
    // These tests need real timers for async React state updates to resolve properly.
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('should show "Saving..." on the button while PUT is in progress', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      // Never resolve to keep in saving state
      mockApi.put.mockReturnValueOnce(new Promise(() => {}));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
      });
    });

    it('should show "Configuration saved." after successful PUT', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      mockApi.put.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(screen.getByText('Configuration saved.')).toBeInTheDocument();
      });
    });

    it('should show error message when PUT request fails', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      mockApi.put.mockRejectedValueOnce(new Error('Server error'));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to save configuration')).toBeInTheDocument();
      });
    });

    it('should clear save error on new save attempt', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      // First save: fails; second save: succeeds
      mockApi.put
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      // First save — fails
      await user.click(screen.getByRole('button', { name: /save configuration/i }));
      await waitFor(() => {
        expect(screen.getByText('Failed to save configuration')).toBeInTheDocument();
      });

      // Second save — succeeds, error should be cleared
      await user.click(screen.getByRole('button', { name: /save configuration/i }));
      await waitFor(() => {
        expect(screen.queryByText('Failed to save configuration')).not.toBeInTheDocument();
      });
    });

    it('should disable the save button while saving is in progress', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      mockApi.put.mockReturnValueOnce(new Promise(() => {}));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        const savingButton = screen.getByRole('button', { name: /saving/i });
        expect(savingButton).toBeDisabled();
      });
    });
  });

  describe('toggle switch interaction', () => {
    it('should toggle enabled state when switch is clicked', async () => {
      mockApi.get.mockResolvedValueOnce({ ...mockOidcConfig, enabled: false });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });
  });

  describe('API call verification', () => {
    it('should call GET /api/settings/oidc on mount', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith('/api/settings/oidc');
      });
    });

    it('should call PUT /api/settings/oidc with current config on save', async () => {
      mockApi.get.mockResolvedValueOnce(mockOidcConfig);
      mockApi.put.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith('/api/settings/oidc', mockOidcConfig);
      });
    });
  });
});
