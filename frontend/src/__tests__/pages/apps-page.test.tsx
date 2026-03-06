import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import AppsPage from '@/app/(dashboard)/apps/page';
import { useClusterStore } from '@/stores/cluster';
import type { App } from '@/lib/abstractions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/apps',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}));

const mockUseApps = jest.fn();

jest.mock('@/hooks/use-apps', () => ({
  useApps: (...args: unknown[]) => mockUseApps(...args),
}));

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: 'app-1',
    name: 'my-web-app',
    namespace: 'default',
    status: 'healthy',
    image: 'nginx:1.25',
    replicas: { ready: 3, desired: 3 },
    ports: [{ port: 80, protocol: 'TCP' }],
    endpoints: [],
    hosts: [],
    hostSources: [],
    hasTLS: false,
    serviceType: 'ClusterIP',
    createdAt: '2026-01-01T00:00:00Z',
    deployment: { metadata: { name: 'my-web-app', namespace: 'default' } },
    services: [],
    ingresses: [],
    httproutes: [],
    ...overrides,
  } as App;
}

const mockApps: App[] = [
  makeApp({
    id: 'app-1',
    name: 'frontend-app',
    namespace: 'production',
    status: 'healthy',
    image: 'node:20-alpine',
  }),
  makeApp({
    id: 'app-2',
    name: 'backend-api',
    namespace: 'production',
    status: 'degraded',
    image: 'golang:1.25',
    replicas: { ready: 1, desired: 3 },
  }),
  makeApp({
    id: 'app-3',
    name: 'redis-cache',
    namespace: 'staging',
    status: 'healthy',
    image: 'redis:7',
  }),
];

describe('AppsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [
        { id: 'cluster-1', name: 'prod-cluster', api_server_url: 'https://k8s:6443', status: 'connected', labels: {}, last_health: '10s ago' } as never,
      ],
      selectedClusterId: 'cluster-1',
      loading: false,
    });
    mockUseApps.mockReturnValue({
      apps: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders page title and description', () => {
    render(<AppsPage />);

    expect(screen.getByText('Apps')).toBeInTheDocument();
    expect(
      screen.getByText('Manage your deployed applications across clusters.')
    ).toBeInTheDocument();
  });

  it('renders Deploy New App button', () => {
    render(<AppsPage />);

    expect(screen.getByText('Deploy New App')).toBeInTheDocument();
  });

  it('navigates to deploy page when Deploy New App is clicked', async () => {
    const { user } = render(<AppsPage />);

    await user.click(screen.getByText('Deploy New App'));

    expect(mockPush).toHaveBeenCalledWith('/apps/deploy');
  });

  it('renders the search input', () => {
    render(<AppsPage />);

    expect(
      screen.getByPlaceholderText('Filter apps by name, namespace, or image...')
    ).toBeInTheDocument();
  });

  it('shows loading state when apps are loading', () => {
    mockUseApps.mockReturnValue({
      apps: [],
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<AppsPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows loading state when clusters are loading', () => {
    useClusterStore.setState({ loading: true });

    render(<AppsPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', () => {
    mockUseApps.mockReturnValue({
      apps: [],
      loading: false,
      error: 'Network error',
      refetch: jest.fn(),
    });

    render(<AppsPage />);

    expect(screen.getByText('Failed to load apps: Network error')).toBeInTheDocument();
  });

  it('shows empty state when no apps exist', () => {
    render(<AppsPage />);

    expect(screen.getByText('No apps found')).toBeInTheDocument();
    expect(
      screen.getByText('Deploy your first application to get started.')
    ).toBeInTheDocument();
  });

  it('displays apps from the hook', () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<AppsPage />);

    expect(screen.getByText('frontend-app')).toBeInTheDocument();
    expect(screen.getByText('backend-api')).toBeInTheDocument();
    expect(screen.getByText('redis-cache')).toBeInTheDocument();
  });

  it('shows app count summary', () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<AppsPage />);

    expect(screen.getByText('3 of 3 app(s)')).toBeInTheDocument();
  });

  it('filters apps by name', async () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<AppsPage />);

    expect(screen.getByText('frontend-app')).toBeInTheDocument();
    expect(screen.getByText('backend-api')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(
      'Filter apps by name, namespace, or image...'
    );
    await user.type(searchInput, 'frontend');

    expect(screen.getByText('frontend-app')).toBeInTheDocument();
    expect(screen.queryByText('backend-api')).not.toBeInTheDocument();
    expect(screen.queryByText('redis-cache')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 app(s)')).toBeInTheDocument();
  });

  it('filters apps by namespace', async () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<AppsPage />);
    const searchInput = screen.getByPlaceholderText(
      'Filter apps by name, namespace, or image...'
    );
    await user.type(searchInput, 'staging');

    expect(screen.getByText('redis-cache')).toBeInTheDocument();
    expect(screen.queryByText('frontend-app')).not.toBeInTheDocument();
    expect(screen.queryByText('backend-api')).not.toBeInTheDocument();
  });

  it('filters apps by image', async () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<AppsPage />);
    const searchInput = screen.getByPlaceholderText(
      'Filter apps by name, namespace, or image...'
    );
    await user.type(searchInput, 'golang');

    expect(screen.getByText('backend-api')).toBeInTheDocument();
    expect(screen.queryByText('frontend-app')).not.toBeInTheDocument();
    expect(screen.queryByText('redis-cache')).not.toBeInTheDocument();
  });

  it('shows empty state with filter hint when search matches nothing', async () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<AppsPage />);
    const searchInput = screen.getByPlaceholderText(
      'Filter apps by name, namespace, or image...'
    );
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No apps found')).toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your search filter.')
    ).toBeInTheDocument();
  });

  it('navigates to app detail on card click', async () => {
    mockUseApps.mockReturnValue({
      apps: mockApps,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<AppsPage />);

    await user.click(screen.getByText('frontend-app'));

    expect(mockPush).toHaveBeenCalledWith(
      '/apps/frontend-app?cluster=cluster-1&namespace=production'
    );
  });

  it('passes selectedClusterId to useApps hook', () => {
    render(<AppsPage />);

    expect(mockUseApps).toHaveBeenCalledWith('cluster-1');
  });

  it('passes null to useApps when no cluster is selected', () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<AppsPage />);

    expect(mockUseApps).toHaveBeenCalledWith(null);
  });

  it('fetches clusters if none are loaded', () => {
    const mockFetchClusters = jest.fn();
    useClusterStore.setState({
      clusters: [],
      fetchClusters: mockFetchClusters,
    });

    render(<AppsPage />);

    expect(mockFetchClusters).toHaveBeenCalled();
  });
});
