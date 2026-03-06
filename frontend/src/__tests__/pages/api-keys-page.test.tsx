import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import ApiKeysPage from '@/app/(dashboard)/settings/api-keys/page';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/settings/api-keys',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('@/stores/toast', () => ({
  toast: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

const mockKeys = [
  {
    id: '1',
    name: 'CI Pipeline',
    key_prefix: 'argus_abc123',
    created_at: '2026-01-01T00:00:00Z',
    last_used_at: '2026-02-15T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    is_active: true,
  },
  {
    id: '2',
    name: 'Old Key',
    key_prefix: 'argus_def456',
    created_at: '2025-01-01T00:00:00Z',
    last_used_at: null,
    expires_at: null,
    is_active: false,
  },
];

describe('ApiKeysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue(mockKeys);
  });

  it('renders the page title and description', async () => {
    render(<ApiKeysPage />);

    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(
      screen.getByText('Manage API keys for programmatic access to the Argus API.')
    ).toBeInTheDocument();
  });

  it('fetches and displays API keys', async () => {
    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Old Key')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('shows empty state when no keys exist', async () => {
    mockApi.get.mockResolvedValue([]);

    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(
        screen.getByText('No API keys yet. Create one above to get started.')
      ).toBeInTheDocument();
    });
  });

  it('shows loading spinner while fetching', () => {
    mockApi.get.mockReturnValue(new Promise(() => {})); // never resolves

    render(<ApiKeysPage />);

    expect(screen.getByText('Your API Keys')).toBeInTheDocument();
  });

  it('validates name is required before creating', async () => {
    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create key/i });
    const { user } = render(<ApiKeysPage />);
    await user.click(createButton);

    expect(toast).toHaveBeenCalledWith('Please enter a key name', { variant: 'error' });
  });

  it('creates a new API key and shows it', async () => {
    mockApi.post.mockResolvedValue({ key: 'argus_newkey123456789' });

    const { user } = render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText('e.g. CI/CD Pipeline');
    await user.type(nameInput, 'Test Key');

    const createButton = screen.getByRole('button', { name: /create key/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/auth/api-keys', {
        name: 'Test Key',
        expires_in_days: 0,
      });
    });
  });

  it('revokes an API key with confirmation', async () => {
    mockApi.del.mockResolvedValue(undefined);

    const { user } = render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    const revokeButton = screen.getByRole('button', { name: /revoke/i });
    await user.click(revokeButton);

    // Confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Revoke API Key')).toBeInTheDocument();
    });

    // Click the confirm button in the dialog
    const confirmButton = screen.getByRole('button', { name: /revoke key/i });
    await user.click(confirmButton);

    expect(mockApi.del).toHaveBeenCalledWith('/api/auth/api-keys/1');
  });

  it('shows revoke button only for active keys', async () => {
    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    const revokeButtons = screen.getAllByRole('button', { name: /revoke/i });
    expect(revokeButtons).toHaveLength(1);
  });

  it('displays key prefix with ellipsis', async () => {
    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('argus_abc123...')).toBeInTheDocument();
    });
  });

  it('shows "Never" for keys without expiration', async () => {
    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(screen.getByText('CI Pipeline')).toBeInTheDocument();
    });

    const neverTexts = screen.getAllByText('Never');
    expect(neverTexts.length).toBeGreaterThanOrEqual(1);
  });
});
