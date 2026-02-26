/**
 * OIDC Settings Page Tests
 *
 * Tests for src/app/(dashboard)/settings/oidc/page.tsx
 *
 * The page makes 4 concurrent API calls on mount via Promise.all:
 *   1. GET /api/settings/oidc/providers  -> ProviderPreset[]
 *   2. GET /api/settings/oidc            -> OidcConfig
 *   3. GET /api/settings/oidc/mappings   -> GroupMapping[] (.catch fallback to [])
 *   4. GET /api/settings/oidc/default-role -> { default_role } (.catch fallback)
 *
 * Covers:
 * 1. Loading state while API is in flight
 * 2. Provider cards render from presets after loading
 * 3. Selecting a provider shows configuration form with extra fields
 * 4. Configuration form renders with loaded data
 * 5. Toggle switch changes enabled state
 * 6. Saving configuration calls PUT API
 * 7. Test connection button calls POST API
 * 8. Group mappings section renders
 * 9. Adding a mapping calls POST API
 * 10. Deleting a mapping calls DELETE API
 * 11. Default role selector
 * 12. Error handling (load failures, save failures)
 */

import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import OidcSettingsPage from '@/app/(dashboard)/settings/oidc/page';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
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
const mockToast = toast as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPresets = [
  {
    id: 'entraid',
    name: 'Microsoft Entra ID',
    description: 'Azure Active Directory / Entra ID',
    issuer_format: 'https://login.microsoftonline.com/{{tenant_id}}/v2.0',
    groups_claim: 'groups',
    extra_scopes: ['profile', 'email'],
    extra_fields: [
      {
        key: 'tenant_id',
        label: 'Tenant ID',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Google OAuth 2.0',
    issuer_format: 'https://accounts.google.com',
    groups_claim: '',
    extra_scopes: ['profile', 'email'],
    extra_fields: [],
  },
  {
    id: 'okta',
    name: 'Okta',
    description: 'Okta Identity Platform',
    issuer_format: 'https://{{domain}}.okta.com',
    groups_claim: 'groups',
    extra_scopes: ['profile', 'email', 'groups'],
    extra_fields: [
      {
        key: 'domain',
        label: 'Okta Domain',
        placeholder: 'your-org',
        required: true,
      },
    ],
  },
  {
    id: 'generic',
    name: 'Generic OIDC',
    description: 'Any OpenID Connect provider',
    issuer_format: '',
    groups_claim: 'groups',
    extra_fields: [],
  },
];

const mockConfigEmpty = {
  enabled: false,
  provider_type: '',
  provider_name: '',
  issuer_url: '',
  client_id: '',
  client_secret: '',
  redirect_url: '',
  groups_claim: '',
  extra_scopes: [],
};

const mockConfigGoogle = {
  enabled: true,
  provider_type: 'google',
  provider_name: 'Google',
  issuer_url: 'https://accounts.google.com',
  client_id: 'my-client-id',
  client_secret: '',
  redirect_url: 'http://localhost/auth/oidc/callback',
  groups_claim: '',
  extra_scopes: ['profile', 'email'],
};

const mockMappings = [
  {
    id: 'map-1',
    oidc_group: 'K8s-Admins',
    role_id: 'role-1',
    role_name: 'admin',
    cluster_id: '',
    namespace: '',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'map-2',
    oidc_group: 'K8s-Developers',
    role_id: 'role-2',
    role_name: 'developer',
    cluster_id: 'prod-cluster',
    namespace: 'default',
    created_at: '2026-01-02T00:00:00Z',
  },
];

const mockDefaultRole = { default_role: 'viewer' };

// ---------------------------------------------------------------------------
// Helper: mock all 4 GET endpoints with path-based routing.
// This is safer than chained mockResolvedValueOnce since Promise.all
// does not guarantee call order matches declaration order.
// ---------------------------------------------------------------------------

function setupSuccessfulLoad(overrides?: {
  presets?: unknown;
  config?: unknown;
  mappings?: unknown;
  defaultRole?: unknown;
}) {
  const presets = overrides?.presets ?? mockPresets;
  const config = overrides?.config ?? mockConfigGoogle;
  const mappings = overrides?.mappings ?? mockMappings;
  const defaultRole = overrides?.defaultRole ?? mockDefaultRole;

  mockApi.get.mockImplementation((path: string) => {
    if (path === '/api/settings/oidc/providers') return Promise.resolve(presets);
    if (path === '/api/settings/oidc') return Promise.resolve(config);
    if (path === '/api/settings/oidc/mappings') return Promise.resolve(mappings);
    if (path === '/api/settings/oidc/default-role') return Promise.resolve(defaultRole);
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OidcSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Loading state
  // =========================================================================

  describe('loading state', () => {
    it('should display loading message while API is in flight', () => {
      mockApi.get.mockReturnValue(new Promise(() => {}));

      render(<OidcSettingsPage />);

      expect(screen.getByText('Loading OIDC settings...')).toBeInTheDocument();
    });

    it('should hide loading message after API resolves', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });
    });

    it('should render page header after loading', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Provider cards
  // =========================================================================

  describe('provider cards', () => {
    it('should render all provider cards after loading', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Entra ID')).toBeInTheDocument();
      });

      expect(screen.getByText('Google Workspace')).toBeInTheDocument();
      expect(screen.getByText('Okta')).toBeInTheDocument();
      expect(screen.getByText('Generic OIDC')).toBeInTheDocument();
    });

    it('should show provider descriptions', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Azure Active Directory / Entra ID')).toBeInTheDocument();
      });

      expect(screen.getByText('Google OAuth 2.0')).toBeInTheDocument();
      expect(screen.getByText('Okta Identity Platform')).toBeInTheDocument();
      expect(screen.getByText('Any OpenID Connect provider')).toBeInTheDocument();
    });

    it('should render Identity Provider section heading', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Identity Provider')).toBeInTheDocument();
      });
    });

    it('should mark the current provider as selected on load', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Google Workspace')).toBeInTheDocument();
      });

      const googleCard = screen.getByText('Google Workspace').closest('button');
      expect(googleCard?.className).toContain('border-primary');
    });
  });

  // =========================================================================
  // Selecting a provider shows configuration form
  // =========================================================================

  describe('selecting a provider', () => {
    it('should show configuration form when a provider is selected', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Google Workspace')).toBeInTheDocument();
      });

      // No config form when no provider is selected
      expect(screen.queryByText('Google Workspace Configuration')).not.toBeInTheDocument();

      await user.click(screen.getByText('Google Workspace'));

      expect(screen.getByText('Google Workspace Configuration')).toBeInTheDocument();
      expect(screen.getByLabelText(/client id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/client secret/i)).toBeInTheDocument();
    });

    it('should show extra fields for providers that require them', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Entra ID')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Microsoft Entra ID'));

      expect(screen.getByText('Microsoft Entra ID Configuration')).toBeInTheDocument();
      expect(screen.getByText(/Tenant ID/)).toBeInTheDocument();
    });

    it('should NOT show extra fields for providers without them', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Google Workspace')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Google Workspace'));

      expect(screen.queryByText(/Tenant ID/)).not.toBeInTheDocument();
    });

    it('should auto-fill groups_claim from the preset', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Okta')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Okta'));

      const groupsInput = screen.getByLabelText(/groups claim/i);
      expect(groupsInput).toHaveValue('groups');
    });
  });

  // =========================================================================
  // Configuration form with loaded data
  // =========================================================================

  describe('configuration form with loaded data', () => {
    it('should render form fields with loaded values', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Google Workspace Configuration')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('Google')).toBeInTheDocument();
      expect(screen.getByDisplayValue('my-client-id')).toBeInTheDocument();
    });

    it('should render all expected form labels', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Provider Name')).toBeInTheDocument();
      });

      expect(screen.getByText('Issuer URL')).toBeInTheDocument();
      expect(screen.getByText('Client Secret')).toBeInTheDocument();
      expect(screen.getByText('Redirect URL')).toBeInTheDocument();
      expect(screen.getByText('Groups Claim')).toBeInTheDocument();
      expect(screen.getByText('Extra Scopes')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Toggle switch
  // =========================================================================

  describe('toggle switch', () => {
    it('should render "Enabled" label when config.enabled is true', async () => {
      setupSuccessfulLoad({ config: { ...mockConfigGoogle, enabled: true } });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('should render "Disabled" label when config.enabled is false', async () => {
      setupSuccessfulLoad({ config: { ...mockConfigGoogle, enabled: false } });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });

    it('should toggle enabled state when switch is clicked', async () => {
      setupSuccessfulLoad({ config: { ...mockConfigGoogle, enabled: false } });

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

  // =========================================================================
  // Save configuration
  // =========================================================================

  describe('save configuration', () => {
    it('should call PUT /api/settings/oidc on save', async () => {
      setupSuccessfulLoad();
      mockApi.put.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(
          '/api/settings/oidc',
          expect.objectContaining({
            provider_type: 'google',
            client_id: 'my-client-id',
          })
        );
      });
    });

    it('should show "Saving..." while PUT is in progress', async () => {
      setupSuccessfulLoad();
      mockApi.put.mockReturnValueOnce(new Promise(() => {}));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
    });

    it('should show success toast after successful save', async () => {
      setupSuccessfulLoad();
      mockApi.put.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Configuration Saved',
          expect.objectContaining({ variant: 'success' })
        );
      });
    });

    it('should show error toast when save fails', async () => {
      setupSuccessfulLoad();
      mockApi.put.mockRejectedValueOnce(new Error('Server error'));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Save Failed',
          expect.objectContaining({ variant: 'error' })
        );
      });
    });

    it('should show validation error when issuer_url or client_id is missing', async () => {
      setupSuccessfulLoad({
        config: {
          ...mockConfigGoogle,
          issuer_url: '',
          client_id: '',
        },
      });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Validation Error',
          expect.objectContaining({ variant: 'error' })
        );
      });

      expect(mockApi.put).not.toHaveBeenCalled();
    });

    it('should not show save button when no provider is selected', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /save configuration/i })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Test connection
  // =========================================================================

  describe('test connection', () => {
    it('should call POST /api/settings/oidc/test when Test button is clicked', async () => {
      setupSuccessfulLoad();
      mockApi.post.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          '/api/settings/oidc/test',
          { issuer_url: 'https://accounts.google.com' }
        );
      });
    });

    it('should show success message after successful test', async () => {
      setupSuccessfulLoad();
      mockApi.post.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument();
      });
    });

    it('should show error message after failed test', async () => {
      setupSuccessfulLoad();
      mockApi.post.mockRejectedValueOnce(new Error('Connection refused'));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });

    it('should disable Test button when issuer URL is empty', async () => {
      setupSuccessfulLoad({ config: mockConfigEmpty });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Generic OIDC')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Generic OIDC'));

      await waitFor(() => {
        const testButton = screen.getByRole('button', { name: /test/i });
        expect(testButton).toBeDisabled();
      });
    });
  });

  // =========================================================================
  // Group mappings section
  // =========================================================================

  describe('group mappings', () => {
    it('should render the group mappings section', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('OIDC Group Mappings')).toBeInTheDocument();
      });
    });

    it('should render existing mappings in the table', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('K8s-Admins')).toBeInTheDocument();
      });

      expect(screen.getByText('K8s-Developers')).toBeInTheDocument();
      // Role names appear both in mapping badges and the role dropdown;
      // use getAllByText to verify they exist at least once.
      expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
      expect(screen.getAllByText('developer').length).toBeGreaterThan(0);
    });

    it('should show "No group mappings configured" when there are no mappings', async () => {
      setupSuccessfulLoad({ mappings: [] });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No group mappings configured. Add one below.')
        ).toBeInTheDocument();
      });
    });

    it('should show scope info for mappings', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Global')).toBeInTheDocument();
      });
    });

    it('should render the default role selector with loaded value', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        const select = screen.getByLabelText(/default role for new oidc users/i);
        expect(select).toHaveValue('viewer');
      });
    });

    it('should call PUT /api/settings/oidc/default-role when default role changes', async () => {
      setupSuccessfulLoad();
      mockApi.put.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/default role for new oidc users/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/default role for new oidc users/i);
      await user.selectOptions(select, 'developer');

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(
          '/api/settings/oidc/default-role',
          { default_role: 'developer' }
        );
      });
    });

    it('should render the Add New Mapping section', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Add New Mapping')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('e.g. K8s-Admins')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Add mapping
  // =========================================================================

  describe('add mapping', () => {
    it('should call POST /api/settings/oidc/mappings when adding a mapping', async () => {
      setupSuccessfulLoad({ mappings: [] });
      mockApi.post.mockResolvedValueOnce({
        id: 'new-1',
        oidc_group: 'DevOps-Team',
        role_id: 'role-3',
        role_name: 'operator',
        cluster_id: '',
        namespace: '',
        created_at: '2026-02-26T00:00:00Z',
      });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g. K8s-Admins')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('e.g. K8s-Admins'), 'DevOps-Team');
      await user.selectOptions(screen.getByLabelText(/role for new mapping/i), 'operator');
      await user.click(screen.getByRole('button', { name: /add mapping/i }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          '/api/settings/oidc/mappings',
          expect.objectContaining({
            oidc_group: 'DevOps-Team',
            role_name: 'operator',
          })
        );
      });
    });

    it('should disable Add Mapping button when OIDC group is empty', async () => {
      setupSuccessfulLoad({ mappings: [] });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /add mapping/i })).toBeDisabled();
    });

    it('should show success toast after adding a mapping', async () => {
      setupSuccessfulLoad({ mappings: [] });
      mockApi.post.mockResolvedValueOnce({
        id: 'new-1',
        oidc_group: 'DevOps-Team',
        role_id: 'role-3',
        role_name: 'viewer',
        cluster_id: '',
        namespace: '',
        created_at: '2026-02-26T00:00:00Z',
      });

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g. K8s-Admins')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('e.g. K8s-Admins'), 'DevOps-Team');
      await user.click(screen.getByRole('button', { name: /add mapping/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Mapping Added',
          expect.objectContaining({ variant: 'success' })
        );
      });
    });
  });

  // =========================================================================
  // Delete mapping
  // =========================================================================

  describe('delete mapping', () => {
    it('should call DELETE /api/settings/oidc/mappings/{id} when deleting', async () => {
      setupSuccessfulLoad();
      mockApi.del.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('K8s-Admins')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByLabelText('Delete mapping for group K8s-Admins');
      await user.click(deleteBtn);

      await waitFor(() => {
        expect(mockApi.del).toHaveBeenCalledWith('/api/settings/oidc/mappings/map-1');
      });
    });

    it('should remove the mapping from the table after successful delete', async () => {
      setupSuccessfulLoad();
      mockApi.del.mockResolvedValueOnce({});

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('K8s-Admins')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Delete mapping for group K8s-Admins'));

      await waitFor(() => {
        expect(screen.queryByText('K8s-Admins')).not.toBeInTheDocument();
      });

      expect(screen.getByText('K8s-Developers')).toBeInTheDocument();
    });

    it('should show error toast when delete fails', async () => {
      setupSuccessfulLoad();
      mockApi.del.mockRejectedValueOnce(new Error('Delete failed'));

      const { user } = render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('K8s-Admins')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Delete mapping for group K8s-Admins'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Delete Failed',
          expect.objectContaining({ variant: 'error' })
        );
      });
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('should show error toast when initial load fails', async () => {
      mockApi.get.mockRejectedValue(new Error('Network error'));

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: 'Failed to load OIDC configuration',
            variant: 'error',
          })
        );
      });
    });

    it('should still render page header after a load error', async () => {
      mockApi.get.mockRejectedValue(new Error('API down'));

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });

      expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
    });

    it('should gracefully handle mappings endpoint failure', async () => {
      mockApi.get.mockImplementation((path: string) => {
        if (path === '/api/settings/oidc/providers') return Promise.resolve(mockPresets);
        if (path === '/api/settings/oidc') return Promise.resolve(mockConfigGoogle);
        if (path === '/api/settings/oidc/mappings') return Promise.reject(new Error('Not found'));
        if (path === '/api/settings/oidc/default-role') return Promise.resolve(mockDefaultRole);
        return Promise.reject(new Error(`Unexpected GET ${path}`));
      });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
      });

      expect(
        screen.getByText('No group mappings configured. Add one below.')
      ).toBeInTheDocument();
    });

    it('should gracefully handle default-role endpoint failure', async () => {
      mockApi.get.mockImplementation((path: string) => {
        if (path === '/api/settings/oidc/providers') return Promise.resolve(mockPresets);
        if (path === '/api/settings/oidc') return Promise.resolve(mockConfigGoogle);
        if (path === '/api/settings/oidc/mappings') return Promise.resolve([]);
        if (path === '/api/settings/oidc/default-role') return Promise.reject(new Error('Not found'));
        return Promise.reject(new Error(`Unexpected GET ${path}`));
      });

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('OIDC / SSO Configuration')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // API call verification
  // =========================================================================

  describe('API call verification', () => {
    it('should call all 4 GET endpoints on mount', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith('/api/settings/oidc/providers');
        expect(mockApi.get).toHaveBeenCalledWith('/api/settings/oidc');
        expect(mockApi.get).toHaveBeenCalledWith('/api/settings/oidc/mappings');
        expect(mockApi.get).toHaveBeenCalledWith('/api/settings/oidc/default-role');
      });
    });

    it('should make exactly 4 GET calls on mount', async () => {
      setupSuccessfulLoad();

      render(<OidcSettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading OIDC settings...')).not.toBeInTheDocument();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(4);
    });
  });
});
