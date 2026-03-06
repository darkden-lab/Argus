import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import StoragePage from '@/app/(dashboard)/storage/page';
import { useClusterStore } from '@/stores/cluster';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/storage',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('@/components/resources/create-pvc-wizard', () => ({
  CreatePVCWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-pvc-wizard">PVC Wizard</div> : null,
}));

const mockApi = api as jest.Mocked<typeof api>;

const mockPVCs = {
  items: [
    {
      metadata: { name: 'data-pvc', namespace: 'default' },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '10Gi' } },
        storageClassName: 'standard',
      },
      status: { phase: 'Bound', capacity: { storage: '10Gi' } },
    },
    {
      metadata: { name: 'logs-pvc', namespace: 'monitoring' },
      spec: {
        accessModes: ['ReadWriteMany'],
        resources: { requests: { storage: '50Gi' } },
        storageClassName: 'nfs',
      },
      status: { phase: 'Pending' },
    },
  ],
};

const mockStorageClasses = {
  items: [
    {
      metadata: { name: 'standard' },
      provisioner: 'kubernetes.io/aws-ebs',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
      allowVolumeExpansion: true,
    },
    {
      metadata: { name: 'nfs' },
      provisioner: 'nfs.csi.k8s.io',
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'Immediate',
      allowVolumeExpansion: false,
    },
  ],
};

const mockPVs = {
  items: [
    {
      metadata: { name: 'pv-001' },
      spec: {
        capacity: { storage: '10Gi' },
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'standard',
        persistentVolumeReclaimPolicy: 'Delete',
      },
      status: { phase: 'Bound' },
    },
    {
      metadata: { name: 'pv-002' },
      spec: {
        capacity: { storage: '100Gi' },
        accessModes: ['ReadWriteMany'],
        storageClassName: 'nfs',
        persistentVolumeReclaimPolicy: 'Retain',
      },
      status: { phase: 'Available' },
    },
  ],
};

function setupApiMocks(
  pvcs = mockPVCs,
  storageClasses = mockStorageClasses,
  pvs = mockPVs
) {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('persistentvolumeclaims')) return Promise.resolve(pvcs);
    if (url.includes('storageclasses')) return Promise.resolve(storageClasses);
    if (url.includes('persistentvolumes')) return Promise.resolve(pvs);
    return Promise.resolve({ items: [] });
  });
}

describe('StoragePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClusterStore.setState({
      clusters: [
        {
          id: 'cluster-1',
          name: 'prod-cluster',
          api_server_url: 'https://k8s:6443',
          status: 'connected',
          labels: {},
          last_health: '10s ago',
        } as never,
      ],
      selectedClusterId: 'cluster-1',
      loading: false,
    });
    setupApiMocks();
  });

  it('renders page title and description', async () => {
    render(<StoragePage />);

    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(
      screen.getByText('Persistent Volumes, PVCs, and Storage Classes.')
    ).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    render(<StoragePage />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows Create PVC button when cluster is selected', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('Create PVC')).toBeInTheDocument();
    });
  });

  it('hides Create PVC button when no cluster is selected', async () => {
    useClusterStore.setState({ selectedClusterId: null });
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.queryByText('Create PVC')).not.toBeInTheDocument();
    });
  });

  it('displays PVCs after loading', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('data-pvc')).toBeInTheDocument();
    });
    expect(screen.getByText('logs-pvc')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('monitoring')).toBeInTheDocument();
  });

  it('displays PVC phase badges', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('Bound')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('displays PVC details (size, class, access modes)', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('data-pvc')).toBeInTheDocument();
    });
    expect(screen.getByText('10Gi')).toBeInTheDocument();
    expect(screen.getByText('standard')).toBeInTheDocument();
    expect(screen.getByText('ReadWriteOnce')).toBeInTheDocument();
  });

  it('shows tab with PVC count', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/PVCs \(2\)/)).toBeInTheDocument();
    });
  });

  it('shows tab with Storage Classes count', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/Storage Classes \(2\)/)).toBeInTheDocument();
    });
  });

  it('shows tab with PVs count', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/PVs \(2\)/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no PVCs exist', async () => {
    setupApiMocks({ items: [] }, mockStorageClasses, mockPVs);
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('No PVCs found.')).toBeInTheDocument();
    });
  });

  it('shows empty state when no storage classes exist', async () => {
    setupApiMocks(mockPVCs, { items: [] }, mockPVs);
    const { user } = render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/Storage Classes \(0\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Storage Classes \(0\)/));

    await waitFor(() => {
      expect(screen.getByText('No storage classes found.')).toBeInTheDocument();
    });
  });

  it('shows empty state when no PVs exist', async () => {
    setupApiMocks(mockPVCs, mockStorageClasses, { items: [] });
    const { user } = render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/PVs \(0\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/PVs \(0\)/));

    await waitFor(() => {
      expect(screen.getByText('No PVs found.')).toBeInTheDocument();
    });
  });

  it('displays storage class details when tab is clicked', async () => {
    const { user } = render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/Storage Classes \(2\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Storage Classes \(2\)/));

    await waitFor(() => {
      expect(screen.getByText('kubernetes.io/aws-ebs')).toBeInTheDocument();
    });
    expect(screen.getByText('nfs.csi.k8s.io')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Retain')).toBeInTheDocument();
    expect(screen.getByText('WaitForFirstConsumer')).toBeInTheDocument();
    expect(screen.getByText('Immediate')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('displays PV details when tab is clicked', async () => {
    const { user } = render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/PVs \(2\)/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/PVs \(2\)/));

    await waitFor(() => {
      expect(screen.getByText('pv-001')).toBeInTheDocument();
    });
    expect(screen.getByText('pv-002')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockApi.get.mockRejectedValue(new Error('Network error'));
    render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText(/PVCs \(0\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Storage Classes \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/PVs \(0\)/)).toBeInTheDocument();
  });

  it('does not fetch data when no cluster is selected', async () => {
    useClusterStore.setState({ selectedClusterId: null });
    render(<StoragePage />);

    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
    });
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('fetches data with correct API URLs', async () => {
    render(<StoragePage />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/clusters/cluster-1/resources/_/v1/persistentvolumeclaims'
      );
    });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/storage.k8s.io/v1/storageclasses'
    );
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/_/v1/persistentvolumes'
    );
  });

  it('opens Create PVC wizard when button is clicked', async () => {
    const { user } = render(<StoragePage />);

    await waitFor(() => {
      expect(screen.getByText('Create PVC')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create PVC'));

    expect(screen.getByTestId('create-pvc-wizard')).toBeInTheDocument();
  });
});
