import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import ClustersPage from '@/app/(dashboard)/clusters/page';
import { usePermissionsStore } from '@/stores/permissions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/clusters',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { api } from '@/lib/api';

const mockClusters = [
  {
    id: '1',
    name: 'production',
    api_server_url: 'https://k8s-prod:6443',
    status: 'connected',
    labels: {},
    last_health: '10s ago',
  },
  {
    id: '2',
    name: 'staging',
    api_server_url: 'https://k8s-staging:6443',
    status: 'disconnected',
    labels: {},
    last_health: '5m ago',
  },
];

describe('ClustersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePermissionsStore.setState({
      permissions: [
        { resource: '*', action: '*', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });
  });

  it('renders page title and description', async () => {
    api.get.mockResolvedValueOnce(mockClusters);
    render(<ClustersPage />);

    expect(screen.getByText('Clusters')).toBeInTheDocument();
    expect(
      screen.getByText('Manage your Kubernetes clusters.')
    ).toBeInTheDocument();
  });

  it('displays clusters from API', async () => {
    api.get.mockResolvedValueOnce(mockClusters);
    render(<ClustersPage />);

    await waitFor(() => {
      expect(screen.getByText('production')).toBeInTheDocument();
    });
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('https://k8s-prod:6443')).toBeInTheDocument();
  });

  it('shows placeholder clusters when API fails', async () => {
    api.get.mockRejectedValueOnce(new Error('Network error'));
    render(<ClustersPage />);

    // Wait for loading to finish and placeholder data to show
    await waitFor(() => {
      expect(screen.queryByText('Loading resources...')).not.toBeInTheDocument();
    });

    // Placeholder data should remain visible
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows Add Cluster button for users with write permission', async () => {
    api.get.mockResolvedValueOnce(mockClusters);
    render(<ClustersPage />);

    expect(screen.getByText('Add Cluster')).toBeInTheDocument();
  });

  it('hides Add Cluster button for users without write permission', async () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'clusters', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });
    api.get.mockResolvedValueOnce(mockClusters);
    render(<ClustersPage />);

    expect(screen.queryByText('Add Cluster')).not.toBeInTheDocument();
  });

  it('filters clusters with search input', async () => {
    api.get.mockResolvedValueOnce(mockClusters);
    const { user } = render(<ClustersPage />);

    await waitFor(() => {
      expect(screen.getByText('production')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter clusters...');
    await user.type(searchInput, 'staging');

    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.queryByText('production')).not.toBeInTheDocument();
  });

  it('navigates to cluster detail on row click', async () => {
    api.get.mockResolvedValueOnce(mockClusters);
    const { user } = render(<ClustersPage />);

    await waitFor(() => {
      expect(screen.getByText('production')).toBeInTheDocument();
    });

    await user.click(screen.getByText('production'));

    expect(mockPush).toHaveBeenCalledWith('/clusters/1');
  });
});
