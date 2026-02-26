import { useDashboardStore } from '@/stores/dashboard';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const emptyStats = {
  totalApps: 0,
  healthyApps: 0,
  totalDatabases: 0,
  runningDatabases: 0,
  totalJobs: 0,
  activeJobs: 0,
  totalClusters: 0,
  healthyClusters: 0,
};

describe('useDashboardStore', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      clusters: [],
      apps: [],
      databases: [],
      jobs: [],
      stats: emptyStats,
      recentActivity: [],
      loading: false,
      error: null,
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty collections', () => {
      const state = useDashboardStore.getState();
      expect(state.clusters).toEqual([]);
      expect(state.apps).toEqual([]);
      expect(state.databases).toEqual([]);
      expect(state.jobs).toEqual([]);
      expect(state.recentActivity).toEqual([]);
    });

    it('starts with empty stats', () => {
      const state = useDashboardStore.getState();
      expect(state.stats).toEqual(emptyStats);
    });

    it('starts not loading and with no error', () => {
      const state = useDashboardStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchClusters', () => {
    it('sets clusters from API response', async () => {
      const mockClusters = [
        {
          id: 'c1',
          name: 'production',
          status: 'connected',
          api_server_url: 'https://k8s:6443',
          last_health: '10s ago',
        },
      ];
      (api.get as jest.Mock).mockResolvedValueOnce(mockClusters);

      await useDashboardStore.getState().fetchClusters();

      expect(useDashboardStore.getState().clusters).toEqual(mockClusters);
      expect(api.get).toHaveBeenCalledWith('/api/clusters');
    });

    it('sets clusters to empty array on error', async () => {
      (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await useDashboardStore.getState().fetchClusters();

      expect(useDashboardStore.getState().clusters).toEqual([]);
    });
  });

  describe('fetchAll', () => {
    it('sets loading to true at the start', async () => {
      (api.get as jest.Mock).mockResolvedValue({ items: [] });

      const promise = useDashboardStore.getState().fetchAll();

      // Loading is set synchronously before any await
      expect(useDashboardStore.getState().loading).toBe(true);

      await promise;
    });

    it('sets loading to false after completion', async () => {
      // Mock fetchClusters to return empty
      (api.get as jest.Mock).mockResolvedValue([]);

      await useDashboardStore.getState().fetchAll();

      expect(useDashboardStore.getState().loading).toBe(false);
    });

    it('computes stats correctly when clusters have resources', async () => {
      const mockClusters = [
        {
          id: 'c1',
          name: 'production',
          status: 'connected',
          api_server_url: 'https://k8s:6443',
          last_health: '10s ago',
        },
        {
          id: 'c2',
          name: 'staging',
          status: 'disconnected',
          api_server_url: 'https://k8s-staging:6443',
          last_health: '5m ago',
        },
      ];

      // First call: fetchClusters
      (api.get as jest.Mock).mockResolvedValueOnce(mockClusters);

      // For the connected cluster (c1), mock 7 resource API calls:
      // deployments
      (api.get as jest.Mock).mockResolvedValueOnce({
        items: [
          {
            metadata: { name: 'web', namespace: 'default', uid: 'd1' },
            spec: {
              replicas: 2,
              selector: { matchLabels: { app: 'web' } },
              template: { spec: { containers: [{ name: 'web', image: 'web:1' }] } },
            },
            status: { replicas: 2, readyReplicas: 2, updatedReplicas: 2 },
          },
          {
            metadata: { name: 'api', namespace: 'default', uid: 'd2' },
            spec: {
              replicas: 1,
              selector: { matchLabels: { app: 'api' } },
              template: { spec: { containers: [{ name: 'api', image: 'api:1' }] } },
            },
            status: { replicas: 1, readyReplicas: 0, updatedReplicas: 1 },
          },
        ],
      });
      // services
      (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      // ingresses
      (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      // statefulsets (one postgres)
      (api.get as jest.Mock).mockResolvedValueOnce({
        items: [
          {
            metadata: { name: 'postgres', namespace: 'default', uid: 's1', labels: {} },
            spec: {
              replicas: 1,
              selector: { matchLabels: { app: 'pg' } },
              template: { spec: { containers: [{ name: 'pg', image: 'postgres:16' }] } },
            },
            status: { replicas: 1, readyReplicas: 1 },
          },
        ],
      });
      // pvcs
      (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      // cronjobs
      (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      // jobs
      (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });

      await useDashboardStore.getState().fetchAll();

      const { stats } = useDashboardStore.getState();
      expect(stats.totalClusters).toBe(2);
      expect(stats.healthyClusters).toBe(1); // only 'connected'
      expect(stats.totalApps).toBe(2);
      expect(stats.healthyApps).toBe(1); // only 'web' with all replicas ready
      expect(stats.totalDatabases).toBe(1);
      expect(stats.runningDatabases).toBe(1);
      expect(stats.totalJobs).toBe(0);
      expect(stats.activeJobs).toBe(0);
    });

    it('recovers gracefully when fetchClusters fails', async () => {
      (api.get as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      await useDashboardStore.getState().fetchAll();

      // fetchClusters has its own try/catch that sets clusters to [],
      // so fetchAll completes successfully with empty data
      expect(useDashboardStore.getState().loading).toBe(false);
      expect(useDashboardStore.getState().clusters).toEqual([]);
      expect(useDashboardStore.getState().stats.totalClusters).toBe(0);
    });

    it('clears previous error on new fetchAll', async () => {
      useDashboardStore.setState({ error: 'Previous error' });

      (api.get as jest.Mock).mockResolvedValueOnce([]);

      await useDashboardStore.getState().fetchAll();

      expect(useDashboardStore.getState().error).toBeNull();
    });

    it('only fetches resources from connected/healthy clusters', async () => {
      const mockClusters = [
        { id: 'c1', name: 'prod', status: 'connected', api_server_url: '', last_health: '' },
        { id: 'c2', name: 'dead', status: 'disconnected', api_server_url: '', last_health: '' },
        { id: 'c3', name: 'ok', status: 'healthy', api_server_url: '', last_health: '' },
      ];

      (api.get as jest.Mock).mockResolvedValueOnce(mockClusters);

      // For cluster c1 (connected) - 7 resource calls
      for (let i = 0; i < 7; i++) {
        (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      }
      // For cluster c3 (healthy) - 7 resource calls
      for (let i = 0; i < 7; i++) {
        (api.get as jest.Mock).mockResolvedValueOnce({ items: [] });
      }

      await useDashboardStore.getState().fetchAll();

      // Should have called: 1 (clusters) + 7 (c1) + 7 (c3) = 15 calls
      // c2 (disconnected) should be skipped
      expect(api.get).toHaveBeenCalledTimes(15);
    });
  });

  describe('fetchClusterResources', () => {
    it('returns composed apps, databases, and jobs', async () => {
      // Mock all 7 resource API calls (allSettled)
      (api.get as jest.Mock)
        .mockResolvedValueOnce({
          items: [
            {
              metadata: { name: 'app1', namespace: 'default', uid: 'dep1' },
              spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'app1' } },
                template: { spec: { containers: [{ name: 'c', image: 'img:1' }] } },
              },
              status: { replicas: 1, readyReplicas: 1, updatedReplicas: 1 },
            },
          ],
        }) // deployments
        .mockResolvedValueOnce({ items: [] }) // services
        .mockResolvedValueOnce({ items: [] }) // ingresses
        .mockResolvedValueOnce({ items: [] }) // statefulsets
        .mockResolvedValueOnce({ items: [] }) // pvcs
        .mockResolvedValueOnce({ items: [] }) // cronjobs
        .mockResolvedValueOnce({ items: [] }); // jobs

      const result = await useDashboardStore.getState().fetchClusterResources('c1');

      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].name).toBe('app1');
      expect(result.databases).toEqual([]);
      expect(result.jobs).toEqual([]);
    });

    it('returns empty arrays when API calls fail', async () => {
      (api.get as jest.Mock).mockRejectedValue(new Error('fail'));

      const result = await useDashboardStore.getState().fetchClusterResources('c1');

      expect(result.apps).toEqual([]);
      expect(result.databases).toEqual([]);
      expect(result.jobs).toEqual([]);
    });

    it('handles partial API failures gracefully via allSettled', async () => {
      // deployments succeed
      (api.get as jest.Mock)
        .mockResolvedValueOnce({
          items: [
            {
              metadata: { name: 'app1', namespace: 'default', uid: 'dep1' },
              spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'app1' } },
                template: { spec: { containers: [{ name: 'c', image: 'img:1' }] } },
              },
              status: { replicas: 1, readyReplicas: 1, updatedReplicas: 1 },
            },
          ],
        })
        .mockRejectedValueOnce(new Error('services fail')) // services
        .mockResolvedValueOnce({ items: [] }) // ingresses
        .mockResolvedValueOnce({ items: [] }) // statefulsets
        .mockResolvedValueOnce({ items: [] }) // pvcs
        .mockResolvedValueOnce({ items: [] }) // cronjobs
        .mockResolvedValueOnce({ items: [] }); // jobs

      const result = await useDashboardStore.getState().fetchClusterResources('c1');

      // Apps should still be composed with empty services
      expect(result.apps).toHaveLength(1);
    });
  });
});
