import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import DashboardPage from '@/app/(dashboard)/dashboard/page';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockRejectedValue(new Error('Not connected')),
  },
}));

// Mock the websocket hook
jest.mock('@/hooks/use-k8s-websocket', () => ({
  useK8sWildcard: () => ({
    lastUpdated: null,
    isConnected: false,
  }),
  useRelativeTime: () => 'Never',
}));

describe('DashboardPage', () => {
  it('renders the dashboard title', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('renders the description text', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Overview of your Kubernetes clusters.')).toBeInTheDocument();
    });
  });

  it('renders cluster health card with placeholder data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Cluster Health')).toBeInTheDocument();
    });

    // Placeholder clusters
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('renders resource summary with placeholder data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Resource Summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Pods')).toBeInTheDocument();
    expect(screen.getByText('Deployments')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Namespaces')).toBeInTheDocument();
  });

  it('renders recent events card', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Events')).toBeInTheDocument();
    });
  });

  it('renders plugin status card', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Plugins')).toBeInTheDocument();
    });
  });
});
