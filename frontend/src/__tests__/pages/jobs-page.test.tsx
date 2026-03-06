import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import JobsPage from '@/app/(dashboard)/jobs/page';
import { useClusterStore } from '@/stores/cluster';
import type { CompositeJob } from '@/lib/abstractions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}));

const mockUseJobs = jest.fn();

jest.mock('@/hooks/use-jobs', () => ({
  useJobs: (...args: unknown[]) => mockUseJobs(...args),
}));

function makeJob(overrides: Partial<CompositeJob> = {}): CompositeJob {
  return {
    id: 'job-1',
    name: 'my-batch-job',
    namespace: 'default',
    status: 'completed',
    image: 'busybox:latest',
    completions: { succeeded: 1, total: 1 },
    createdAt: '2026-01-01T00:00:00Z',
    jobs: [],
    ...overrides,
  } as CompositeJob;
}

const mockJobs: CompositeJob[] = [
  makeJob({
    id: 'job-1',
    name: 'data-migration',
    namespace: 'production',
    status: 'completed',
    image: 'migrate:v2',
    completions: { succeeded: 3, total: 3 },
  }),
  makeJob({
    id: 'job-2',
    name: 'backup-cronjob',
    namespace: 'production',
    status: 'scheduled',
    image: 'backup:latest',
    schedule: '0 2 * * *',
    completions: { succeeded: 0, total: 1 },
    cronJob: {} as never,
  }),
  makeJob({
    id: 'job-3',
    name: 'test-runner',
    namespace: 'staging',
    status: 'active',
    image: 'node:20',
    completions: { succeeded: 0, total: 5 },
  }),
  makeJob({
    id: 'job-4',
    name: 'failed-import',
    namespace: 'staging',
    status: 'failed',
    image: 'importer:v1',
    completions: { succeeded: 0, total: 1 },
  }),
];

describe('JobsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [
        { id: 'cluster-1', name: 'prod-cluster', api_server_url: 'https://k8s:6443', status: 'connected', labels: {}, last_health: '10s ago' } as never,
      ],
      selectedClusterId: 'cluster-1',
      loading: false,
    });
    mockUseJobs.mockReturnValue({
      jobs: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders page title and description', () => {
    render(<JobsPage />);

    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(
      screen.getByText('View and manage Jobs and CronJobs across your clusters.')
    ).toBeInTheDocument();
  });

  it('renders Create Job button', () => {
    render(<JobsPage />);

    expect(screen.getByText('Create Job')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<JobsPage />);

    expect(screen.getByPlaceholderText('Filter jobs...')).toBeInTheDocument();
  });

  it('renders status filter badges', () => {
    render(<JobsPage />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('shows loading state when jobs are loading', () => {
    mockUseJobs.mockReturnValue({
      jobs: [],
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows loading state when clusters are loading', () => {
    useClusterStore.setState({ loading: true });

    render(<JobsPage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', () => {
    mockUseJobs.mockReturnValue({
      jobs: [],
      loading: false,
      error: 'Network error',
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('Failed to load jobs: Network error')).toBeInTheDocument();
  });

  it('shows empty state when no jobs exist', () => {
    render(<JobsPage />);

    expect(screen.getByText('No jobs found')).toBeInTheDocument();
    expect(
      screen.getByText('No Jobs or CronJobs detected in this cluster.')
    ).toBeInTheDocument();
  });

  it('displays jobs from the hook', () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('data-migration')).toBeInTheDocument();
    expect(screen.getByText('backup-cronjob')).toBeInTheDocument();
    expect(screen.getByText('test-runner')).toBeInTheDocument();
    expect(screen.getByText('failed-import')).toBeInTheDocument();
  });

  it('shows job count summary', () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('4 of 4 job(s)')).toBeInTheDocument();
  });

  it('displays job completions', () => {
    mockUseJobs.mockReturnValue({
      jobs: [mockJobs[0]],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('Completions: 3/3')).toBeInTheDocument();
  });

  it('displays cron schedule when present', () => {
    mockUseJobs.mockReturnValue({
      jobs: [mockJobs[1]],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('0 2 * * *')).toBeInTheDocument();
  });

  it('displays job namespace', () => {
    mockUseJobs.mockReturnValue({
      jobs: [mockJobs[0]],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('displays job status badge', () => {
    mockUseJobs.mockReturnValue({
      jobs: [mockJobs[0]],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<JobsPage />);

    // The status is rendered as badge text (in addition to filter badges)
    // "completed" appears as badge text and "Completed" as filter label
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('filters jobs by name search', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    const searchInput = screen.getByPlaceholderText('Filter jobs...');
    await user.type(searchInput, 'data-migration');

    expect(screen.getByText('data-migration')).toBeInTheDocument();
    expect(screen.queryByText('backup-cronjob')).not.toBeInTheDocument();
    expect(screen.queryByText('test-runner')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 4 job(s)')).toBeInTheDocument();
  });

  it('filters jobs by namespace search', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    const searchInput = screen.getByPlaceholderText('Filter jobs...');
    await user.type(searchInput, 'staging');

    expect(screen.getByText('test-runner')).toBeInTheDocument();
    expect(screen.getByText('failed-import')).toBeInTheDocument();
    expect(screen.queryByText('data-migration')).not.toBeInTheDocument();
    expect(screen.queryByText('backup-cronjob')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 4 job(s)')).toBeInTheDocument();
  });

  it('filters jobs by status badge click', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    // Click "Active" status filter
    await user.click(screen.getByText('Active'));

    expect(screen.getByText('test-runner')).toBeInTheDocument();
    expect(screen.queryByText('data-migration')).not.toBeInTheDocument();
    expect(screen.queryByText('backup-cronjob')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 4 job(s)')).toBeInTheDocument();
  });

  it('filters jobs by Failed status', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    await user.click(screen.getByText('Failed'));

    expect(screen.getByText('failed-import')).toBeInTheDocument();
    expect(screen.queryByText('data-migration')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 4 job(s)')).toBeInTheDocument();
  });

  it('shows empty state with filter hint when filters match nothing', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    const searchInput = screen.getByPlaceholderText('Filter jobs...');
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No jobs found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('shows filter hint when status filter matches nothing', async () => {
    mockUseJobs.mockReturnValue({
      jobs: [mockJobs[0]], // only completed job
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    await user.click(screen.getByText('Failed'));

    expect(screen.getByText('No jobs found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('navigates to job detail on card click', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    await user.click(screen.getByText('data-migration'));

    expect(mockPush).toHaveBeenCalledWith(
      '/jobs/data-migration?cluster=cluster-1&namespace=production&type=job'
    );
  });

  it('navigates to cronjob detail with type=cronjob', async () => {
    mockUseJobs.mockReturnValue({
      jobs: mockJobs,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { user } = render(<JobsPage />);

    await user.click(screen.getByText('backup-cronjob'));

    expect(mockPush).toHaveBeenCalledWith(
      '/jobs/backup-cronjob?cluster=cluster-1&namespace=production&type=cronjob'
    );
  });

  it('passes selectedClusterId to useJobs hook', () => {
    render(<JobsPage />);

    expect(mockUseJobs).toHaveBeenCalledWith('cluster-1');
  });

  it('passes null to useJobs when no cluster is selected', () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<JobsPage />);

    expect(mockUseJobs).toHaveBeenCalledWith(null);
  });

  it('fetches clusters if none are loaded', () => {
    const mockFetchClusters = jest.fn();
    useClusterStore.setState({
      clusters: [],
      fetchClusters: mockFetchClusters,
    });

    render(<JobsPage />);

    expect(mockFetchClusters).toHaveBeenCalled();
  });
});
