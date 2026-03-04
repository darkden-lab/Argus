import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import ProjectsPage from '@/app/(dashboard)/projects/page';
import { useClusterStore } from '@/stores/cluster';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/projects',
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

const mockProjects = [
  {
    name: 'frontend',
    namespaces: ['web', 'cdn'],
    workloads: 3,
    podsRunning: 3,
    podsTotal: 3,
    health: 'healthy',
  },
  {
    name: 'backend',
    namespaces: ['api', 'workers', 'db', 'cache'],
    workloads: 5,
    podsRunning: 4,
    podsTotal: 5,
    health: 'degraded',
  },
];

describe('ProjectsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [],
      selectedClusterId: null,
      selectedNamespace: null,
      selectedProject: null,
      namespaces: [],
      loading: false,
    });
  });

  it('shows empty state when no cluster selected', () => {
    render(<ProjectsPage />);
    expect(screen.getByText('No cluster selected')).toBeInTheDocument();
    expect(screen.getByText('Select a cluster to view projects.')).toBeInTheDocument();
  });

  it('renders project cards when data is loaded', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockResolvedValueOnce({ projects: mockProjects });

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows namespace counts on cards', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockResolvedValueOnce({ projects: mockProjects });

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });
    expect(screen.getByText('2 namespace(s)')).toBeInTheDocument();
    expect(screen.getByText('4 namespace(s)')).toBeInTheDocument();
  });

  it('shows empty state with label hint when projects array is empty', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockResolvedValueOnce({ projects: [] });

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('No projects found')).toBeInTheDocument();
    });
    expect(screen.getByText('argus.darkden.net/projects=my-project')).toBeInTheDocument();
  });

  it('navigates to project detail on card click', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockResolvedValueOnce({ projects: mockProjects });

    const { user } = render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    await user.click(screen.getByText('frontend'));
    expect(mockPush).toHaveBeenCalledWith('/projects/frontend');
  });

  it('filters projects with search input', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockResolvedValueOnce({ projects: mockProjects });

    const { user } = render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter projects...');
    await user.type(searchInput, 'backend');

    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.queryByText('frontend')).not.toBeInTheDocument();
  });

  it('shows error state with retry button on API failure', async () => {
    useClusterStore.setState({ selectedClusterId: 'c1' });
    (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
