import React from 'react';
import { render, screen, waitFor } from '../test-utils';
import NetworkingPage from '@/app/(dashboard)/networking/page';
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
  usePathname: () => '/networking',
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

jest.mock('@/components/networking/network-map', () => ({
  NetworkMap: ({ clusterID }: { clusterID: string }) => (
    <div data-testid="network-map">NetworkMap: {clusterID}</div>
  ),
}));

jest.mock('@/components/networking/network-policy-detail', () => ({
  NetworkPolicyDetail: () => <div data-testid="network-policy-detail" />,
}));

jest.mock('@/components/networking/create-network-policy-wizard', () => ({
  CreateNetworkPolicyWizard: () => <div data-testid="create-policy-wizard" />,
}));

jest.mock('@/components/networking/create-gateway-wizard', () => ({
  CreateGatewayWizard: () => <div data-testid="create-gateway-wizard" />,
}));

jest.mock('@/components/networking/create-httproute-wizard', () => ({
  CreateHTTPRouteWizard: () => <div data-testid="create-httproute-wizard" />,
}));

jest.mock('@/components/networking/prometheus-config-dialog', () => ({
  PrometheusConfigDialog: () => <div data-testid="prometheus-config-dialog" />,
}));

jest.mock('@/components/monitoring/prometheus-selector', () => ({
  PrometheusSelector: () => <div data-testid="prometheus-selector" />,
}));

const mockApi = api as jest.Mocked<typeof api>;

function mockApiDefaults() {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('/services')) return Promise.resolve({ items: [] });
    if (url.includes('/ingresses')) return Promise.resolve({ items: [] });
    if (url.includes('/networkpolicies')) return Promise.resolve({ items: [] });
    if (url.includes('/httproutes')) return Promise.resolve({ items: [] });
    if (url.includes('/gateways')) return Promise.resolve({ items: [] });
    if (url.includes('/namespaces')) return Promise.resolve({ items: [] });
    if (url.includes('/pods')) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
}

const mockServices = [
  {
    metadata: { name: 'my-svc', namespace: 'default' },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.0.1',
      ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
    },
  },
  {
    metadata: { name: 'loadbalancer-svc', namespace: 'production' },
    spec: {
      type: 'LoadBalancer',
      clusterIP: '10.96.0.2',
      ports: [{ port: 443, targetPort: 8443, protocol: 'TCP' }],
    },
  },
];

const mockIngresses = [
  {
    metadata: { name: 'web-ingress', namespace: 'default' },
    spec: {
      rules: [
        {
          host: 'example.com',
          http: {
            paths: [
              { path: '/', backend: { service: { name: 'my-svc', port: { number: 80 } } } },
            ],
          },
        },
      ],
      tls: [{ hosts: ['example.com'] }],
    },
  },
];

const mockNetworkPolicies = [
  {
    metadata: { name: 'deny-all', namespace: 'default' },
    spec: {
      podSelector: { matchLabels: { app: 'web' } },
      policyTypes: ['Ingress', 'Egress'],
    },
  },
];

const mockHTTPRoutes = [
  {
    metadata: { name: 'my-route', namespace: 'default' },
    spec: {
      hostnames: ['api.example.com'],
      parentRefs: [{ name: 'my-gw', namespace: 'default' }],
      rules: [
        {
          matches: [{ path: { value: '/api' }, method: 'GET' }],
          backendRefs: [{ name: 'my-svc', port: 80, weight: 100 }],
        },
      ],
    },
  },
];

const mockGateways = [
  {
    metadata: { name: 'my-gw', namespace: 'default' },
    spec: {
      gatewayClassName: 'istio',
      listeners: [{ name: 'http', port: 80, protocol: 'HTTP', hostname: '*.example.com' }],
    },
    status: {
      conditions: [{ type: 'Accepted', status: 'True' }],
      addresses: [{ type: 'IPAddress', value: '192.168.1.1' }],
    },
  },
];

function mockApiWithData() {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('/services')) return Promise.resolve({ items: mockServices });
    if (url.includes('/ingresses')) return Promise.resolve({ items: mockIngresses });
    if (url.includes('/networkpolicies')) return Promise.resolve({ items: mockNetworkPolicies });
    if (url.includes('/httproutes')) return Promise.resolve({ items: mockHTTPRoutes });
    if (url.includes('/gateways')) return Promise.resolve({ items: mockGateways });
    if (url.includes('/namespaces')) return Promise.resolve({ items: [] });
    if (url.includes('/pods')) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
}

describe('NetworkingPage', () => {
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
    mockApiDefaults();
  });

  it('renders page title and description', async () => {
    render(<NetworkingPage />);

    expect(screen.getByText('Networking')).toBeInTheDocument();
    expect(
      screen.getByText('Services, Ingresses, Network Policies, HTTPRoutes, Gateways, and Network Map.')
    ).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    // Make the API hang so loading state persists
    mockApi.get.mockImplementation(() => new Promise(() => {}));

    render(<NetworkingPage />);

    // Skeleton loaders use animate-pulse class
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders tab triggers after loading', async () => {
    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Services/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: /Ingresses/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Policies/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /HTTPRoutes/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Gateways/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Network Map/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Simulator/ })).toBeInTheDocument();
  });

  it('shows empty state for services when no data', async () => {
    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByText('No services found.')).toBeInTheDocument();
    });
  });

  it('displays services data', async () => {
    mockApiWithData();

    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByText('my-svc')).toBeInTheDocument();
    });

    expect(screen.getByText('loadbalancer-svc')).toBeInTheDocument();
    expect(screen.getByText('ClusterIP')).toBeInTheDocument();
    expect(screen.getByText('LoadBalancer')).toBeInTheDocument();
    expect(screen.getByText('10.96.0.1')).toBeInTheDocument();
    expect(screen.getByText('80:8080/TCP')).toBeInTheDocument();
  });

  it('shows tab counts', async () => {
    mockApiWithData();

    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Services \(2\)/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: /Ingresses \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Policies \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /HTTPRoutes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Gateways \(1\)/ })).toBeInTheDocument();
  });

  it('shows ingresses tab with data', async () => {
    mockApiWithData();

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Ingresses/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Ingresses/ }));

    await waitFor(() => {
      expect(screen.getByText('web-ingress')).toBeInTheDocument();
    });

    expect(screen.getByText('TLS')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows empty ingresses state', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Ingresses/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Ingresses/ }));

    await waitFor(() => {
      expect(screen.getByText('No ingresses found.')).toBeInTheDocument();
    });
  });

  it('shows network policies tab with data', async () => {
    mockApiWithData();

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Policies/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Policies/ }));

    await waitFor(() => {
      expect(screen.getByText('deny-all')).toBeInTheDocument();
    });

    expect(screen.getByText('Ingress')).toBeInTheDocument();
    expect(screen.getByText('Egress')).toBeInTheDocument();
  });

  it('shows empty policies state', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Policies/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Policies/ }));

    await waitFor(() => {
      expect(screen.getByText('No network policies found.')).toBeInTheDocument();
    });
  });

  it('shows HTTPRoutes tab with data', async () => {
    mockApiWithData();

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /HTTPRoutes/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /HTTPRoutes/ }));

    await waitFor(() => {
      expect(screen.getByText('my-route')).toBeInTheDocument();
    });

    expect(screen.getByText('api.example.com')).toBeInTheDocument();
  });

  it('shows empty HTTPRoutes state', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /HTTPRoutes/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /HTTPRoutes/ }));

    await waitFor(() => {
      expect(screen.getByText('No HTTPRoutes found.')).toBeInTheDocument();
    });
  });

  it('shows Gateways tab with data', async () => {
    mockApiWithData();

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Gateways/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Gateways/ }));

    await waitFor(() => {
      expect(screen.getByText('my-gw')).toBeInTheDocument();
    });

    expect(screen.getByText('istio')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
  });

  it('shows empty Gateways state', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Gateways/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Gateways/ }));

    await waitFor(() => {
      expect(screen.getByText('No gateways found.')).toBeInTheDocument();
    });
  });

  it('renders create buttons when cluster is selected', async () => {
    render(<NetworkingPage />);

    expect(screen.getByText('Create Gateway')).toBeInTheDocument();
    expect(screen.getByText('Create HTTPRoute')).toBeInTheDocument();
    expect(screen.getByText('Create Policy')).toBeInTheDocument();
  });

  it('does not render create buttons when no cluster selected', async () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.queryByText('Create Gateway')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('Create HTTPRoute')).not.toBeInTheDocument();
    expect(screen.queryByText('Create Policy')).not.toBeInTheDocument();
  });

  it('shows no cluster message on network map when no cluster selected', async () => {
    useClusterStore.setState({ selectedClusterId: null });

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Network Map/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Network Map/ }));

    await waitFor(() => {
      expect(screen.getByText('Select a cluster to view the network map.')).toBeInTheDocument();
    });
  });

  it('renders NetworkMap component when cluster is selected', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Network Map/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Network Map/ }));

    await waitFor(() => {
      expect(screen.getByTestId('network-map')).toBeInTheDocument();
    });
  });

  it('renders simulator tab with labels', async () => {
    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Simulator/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Simulator/ }));

    await waitFor(() => {
      expect(screen.getByText('Network Connectivity Simulator')).toBeInTheDocument();
    });

    expect(screen.getByText('Source Namespace')).toBeInTheDocument();
    expect(screen.getByText('Source Pod')).toBeInTheDocument();
    expect(screen.getByText('Destination Namespace')).toBeInTheDocument();
    expect(screen.getByText('Destination Pod')).toBeInTheDocument();
    expect(screen.getByText('Port (optional)')).toBeInTheDocument();
    expect(screen.getByText('Simulate')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/namespaces')) return Promise.resolve({ items: [] });
      return Promise.reject(new Error('Network error'));
    });

    render(<NetworkingPage />);

    // Should still render with empty data after errors
    await waitFor(() => {
      expect(screen.getByText('No services found.')).toBeInTheDocument();
    });
  });

  it('shows cluster name when multiple clusters exist', async () => {
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
        {
          id: 'cluster-2',
          name: 'staging-cluster',
          api_server_url: 'https://k8s:6443',
          status: 'connected',
          labels: {},
          last_health: '10s ago',
        } as never,
      ],
      selectedClusterId: 'cluster-1',
    });

    render(<NetworkingPage />);

    expect(screen.getByText(/Cluster:.*prod-cluster/)).toBeInTheDocument();
  });

  it('shows policy selector labels in policies tab', async () => {
    mockApiWithData();

    const { user } = render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Policies/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Policies/ }));

    await waitFor(() => {
      expect(screen.getByText('Selector: app=web')).toBeInTheDocument();
    });
  });

  it('fetches data with correct API URLs', async () => {
    render(<NetworkingPage />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/clusters/cluster-1/resources/_/v1/services'
      );
    });

    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/networking.k8s.io/v1/ingresses'
    );
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/networking.k8s.io/v1/networkpolicies'
    );
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/gateway.networking.k8s.io/v1/httproutes'
    );
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/clusters/cluster-1/resources/gateway.networking.k8s.io/v1/gateways'
    );
  });

  it('does not fetch data when no cluster is selected', async () => {
    useClusterStore.setState({ selectedClusterId: null });

    render(<NetworkingPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Services/ })).toBeInTheDocument();
    });

    // Only the namespaces fetch should NOT have been called (no cluster)
    const resourceCalls = (mockApi.get as jest.Mock).mock.calls.filter(
      (call: string[]) => call[0].includes('/resources/')
    );
    expect(resourceCalls).toHaveLength(0);
  });
});
