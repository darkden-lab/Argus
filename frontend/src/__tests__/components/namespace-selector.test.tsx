import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import { NamespaceSelector } from '@/components/layout/namespace-selector';
import { useClusterStore } from '@/stores/cluster';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

jest.mock('@/hooks/use-k8s-watch', () => ({
  useK8sWatch: jest.fn(() => ({
    lastEvent: null,
    lastUpdated: null,
    isConnected: false,
  })),
}));

import { api } from '@/lib/api';

const mockGet = api.get as jest.Mock;

describe('NamespaceSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [],
      selectedClusterId: null,
      selectedNamespace: null,
      namespaces: [],
      loading: false,
    });
  });

  it('renders nothing when no cluster is selected', () => {
    const { container } = render(<NamespaceSelector />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "All Namespaces" when no namespace is selected', async () => {
    mockGet.mockResolvedValueOnce({ items: [] });
    useClusterStore.setState({
      selectedClusterId: 'cluster-1',
      selectedNamespace: null,
      namespaces: [],
    });

    render(<NamespaceSelector />);

    await waitFor(() => {
      expect(screen.getByText('All Namespaces')).toBeInTheDocument();
    });
  });

  it('shows selected namespace name when a namespace is selected', async () => {
    mockGet.mockResolvedValueOnce({
      items: [
        { metadata: { name: 'production' }, status: { phase: 'Active' } },
        { metadata: { name: 'staging' }, status: { phase: 'Active' } },
      ],
    });
    useClusterStore.setState({
      selectedClusterId: 'cluster-1',
      selectedNamespace: 'production',
      namespaces: ['production', 'staging'],
    });

    render(<NamespaceSelector />);

    await waitFor(() => {
      expect(screen.getByText('production')).toBeInTheDocument();
    });
  });

  it('fetches namespaces when cluster is selected', async () => {
    mockGet.mockResolvedValueOnce({
      items: [
        { metadata: { name: 'default' }, status: { phase: 'Active' } },
        { metadata: { name: 'kube-system' }, status: { phase: 'Active' } },
      ],
    });
    useClusterStore.setState({
      selectedClusterId: 'cluster-1',
      selectedNamespace: null,
      namespaces: [],
    });

    render(<NamespaceSelector />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/api/clusters/cluster-1/resources/_/v1/namespaces'
      );
    });
  });
});
