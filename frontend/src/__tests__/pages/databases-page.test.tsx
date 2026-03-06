import React from 'react';
import { render, screen } from '../test-utils';
import DatabasesPage from '@/app/(dashboard)/databases/page';
import { useClusterStore } from '@/stores/cluster';
import type { Database } from '@/lib/abstractions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/databases',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}));

const mockUseDatabases = jest.fn();

jest.mock('@/hooks/use-databases', () => ({
  useDatabases: (...args: unknown[]) => mockUseDatabases(...args),
}));

jest.mock('@/components/databases/create-database-wizard', () => ({
  CreateDatabaseWizard: () => <div data-testid="create-db-wizard" />,
}));

function makeDatabase(overrides: Partial<Database> = {}): Database {
  return {
    id: 'db-1',
    name: 'my-postgres',
    namespace: 'default',
    status: 'running',
    engine: 'postgresql',
    image: 'postgres:16',
    replicas: { ready: 3, desired: 3 },
    storage: '10Gi',
    createdAt: '2026-01-01T00:00:00Z',
    pvcs: [],
    services: [],
    ...overrides,
  } as Database;
}

const mockDatabases: Database[] = [
  makeDatabase({
    id: 'db-1',
    name: 'main-postgres',
    namespace: 'production',
    engine: 'postgresql',
    image: 'postgres:16',
  }),
  makeDatabase({
    id: 'db-2',
    name: 'cache-redis',
    namespace: 'production',
    engine: 'redis',
    image: 'redis:7',
  }),
  makeDatabase({
    id: 'db-3',
    name: 'app-mariadb',
    namespace: 'staging',
    engine: 'mariadb',
    image: 'mariadb:11',
  }),
];

describe('DatabasesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [
        { id: 'cluster-1', name: 'prod-cluster', api_server_url: 'https://k8s:6443', status: 'connected', labels: {}, last_health: '10s ago' } as never,
      ],
      selectedClusterId: 'cluster-1',
      loading: false,
    });
    mockUseDatabases.mockReturnValue({
      databases: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders page title and description', () => {
    render(<DatabasesPage />);

    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(
      screen.getByText('Database resources, operators, and cluster management.')
    ).toBeInTheDocument();
  });

  it('renders Create Database button', () => {
    render(<DatabasesPage />);

    expect(screen.getByText('Create Database')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<DatabasesPage />);

    expect(
      screen.getByPlaceholderText('Filter databases...')
    ).toBeInTheDocument();
  });

  it('renders engine filter badges', () => {
    render(<DatabasesPage />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('MariaDB')).toBeInTheDocument();
    expect(screen.getByText('MySQL')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows loading state when databases are loading', () => {
    mockUseDatabases.mockReturnValue({
      databases: [],
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<DatabasesPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows loading state when clusters are loading', () => {
    useClusterStore.setState({ loading: true });

    render(<DatabasesPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', () => {
    mockUseDatabases.mockReturnValue({
      databases: [],
      loading: false,
      error: 'Network error',
      refetch: jest.fn(),
    });

    render(<DatabasesPage />);

    expect(screen.getByText('Failed to load databases: Network error')).toBeInTheDocument();
  });

  it('shows empty state when no databases exist', () => {
    render(<DatabasesPage />);

    expect(screen.getByText('No databases found')).toBeInTheDocument();
    expect(
      screen.getByText('No database StatefulSets detected in this cluster.')
    ).toBeInTheDocument();
  });

  it('displays databases from the hook', () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<DatabasesPage />);

    expect(screen.getByText('main-postgres')).toBeInTheDocument();
    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.getByText('app-mariadb')).toBeInTheDocument();
  });

  it('shows database count summary', () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<DatabasesPage />);

    expect(screen.getByText('3 of 3 database(s)')).toBeInTheDocument();
  });

  it('filters databases by name', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);

    const searchInput = screen.getByPlaceholderText('Filter databases...');
    await user.type(searchInput, 'postgres');

    expect(screen.getByText('main-postgres')).toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
    expect(screen.queryByText('app-mariadb')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 database(s)')).toBeInTheDocument();
  });

  it('filters databases by namespace', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);
    const searchInput = screen.getByPlaceholderText('Filter databases...');
    await user.type(searchInput, 'staging');

    expect(screen.getByText('app-mariadb')).toBeInTheDocument();
    expect(screen.queryByText('main-postgres')).not.toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
  });

  it('filters databases by engine', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);
    const searchInput = screen.getByPlaceholderText('Filter databases...');
    await user.type(searchInput, 'redis');

    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.queryByText('main-postgres')).not.toBeInTheDocument();
    expect(screen.queryByText('app-mariadb')).not.toBeInTheDocument();
  });

  it('filters by engine badge click', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);

    await user.click(screen.getByText('PostgreSQL'));

    expect(screen.getByText('main-postgres')).toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
    expect(screen.queryByText('app-mariadb')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 database(s)')).toBeInTheDocument();
  });

  it('shows empty state with filter hint when filters match nothing', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);
    const searchInput = screen.getByPlaceholderText('Filter databases...');
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No databases found')).toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your filters.')
    ).toBeInTheDocument();
  });

  it('navigates to database detail on card click', async () => {
    mockUseDatabases.mockReturnValue({
      databases: mockDatabases,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<DatabasesPage />);

    await user.click(screen.getByText('main-postgres'));

    expect(mockPush).toHaveBeenCalledWith(
      '/databases/main-postgres?cluster=cluster-1&namespace=production'
    );
  });

  it('passes selectedClusterId to useDatabases hook', () => {
    render(<DatabasesPage />);

    expect(mockUseDatabases).toHaveBeenCalledWith('cluster-1');
  });

  it('passes null to useDatabases when no cluster is selected', () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<DatabasesPage />);

    expect(mockUseDatabases).toHaveBeenCalledWith(null);
  });

  it('fetches clusters if none are loaded', () => {
    const mockFetchClusters = jest.fn();
    useClusterStore.setState({
      clusters: [],
      fetchClusters: mockFetchClusters,
    });

    render(<DatabasesPage />);

    expect(mockFetchClusters).toHaveBeenCalled();
  });

  it('disables Create Database button when no cluster is selected', () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<DatabasesPage />);

    const button = screen.getByText('Create Database').closest('button');
    expect(button).toBeDisabled();
  });

  it('enables Create Database button when cluster is selected', () => {
    render(<DatabasesPage />);

    const button = screen.getByText('Create Database').closest('button');
    expect(button).not.toBeDisabled();
  });
});
