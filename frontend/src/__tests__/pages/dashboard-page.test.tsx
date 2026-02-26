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

// Mock the dashboard store
jest.mock('@/stores/dashboard', () => ({
  useDashboardStore: () => ({
    clusters: [],
    stats: {
      totalApps: 0,
      healthyApps: 0,
      totalDatabases: 0,
      runningDatabases: 0,
      totalJobs: 0,
      activeJobs: 0,
      totalClusters: 0,
      healthyClusters: 0,
    },
    loading: false,
    fetchAll: jest.fn(),
  }),
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
      expect(screen.getByText('Overview of your infrastructure at a glance.')).toBeInTheDocument();
    });
  });

  it('renders stat cards', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Apps')).toBeInTheDocument();
      expect(screen.getByText('Databases')).toBeInTheDocument();
      expect(screen.getByText('Jobs')).toBeInTheDocument();
      // "Clusters" appears multiple times (stat card + section header)
      const clusterElements = screen.getAllByText('Clusters');
      expect(clusterElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders cluster empty state when no clusters', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No clusters connected.')).toBeInTheDocument();
    });
  });

  it('renders recent activity section', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  it('renders quick actions', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getByText('Deploy App')).toBeInTheDocument();
      // "Add Cluster" appears in both quick actions and empty state
      const addClusterElements = screen.getAllByText('Add Cluster');
      expect(addClusterElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('View Monitoring')).toBeInTheDocument();
    });
  });

  it('renders plugins section', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Plugins')).toBeInTheDocument();
    });
  });
});
