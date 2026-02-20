import { usePluginStore, type PluginManifest } from '@/stores/plugins';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const mockManifest: PluginManifest = {
  id: 'prometheus',
  name: 'Prometheus',
  version: '1.0.0',
  description: 'Prometheus monitoring plugin',
  frontend: {
    navigation: [{ label: 'Metrics', icon: 'chart', path: '/plugins/prometheus' }],
    routes: [{ path: '/plugins/prometheus', component: 'PrometheusPage' }],
    widgets: [{ id: 'prom-widget', type: 'dashboard', component: 'PrometheusWidget' }],
  },
};

const mockManifest2: PluginManifest = {
  id: 'istio',
  name: 'Istio',
  version: '2.0.0',
  description: 'Istio service mesh plugin',
  frontend: {
    navigation: [{ label: 'Service Mesh', icon: 'network', path: '/plugins/istio' }],
    routes: [{ path: '/plugins/istio', component: 'IstioPage' }],
    widgets: [],
  },
};

describe('usePluginStore', () => {
  beforeEach(() => {
    usePluginStore.setState({
      plugins: [],
      isLoading: false,
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty plugins and not loading', () => {
      const state = usePluginStore.getState();
      expect(state.plugins).toEqual([]);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('fetchPlugins', () => {
    it('loads enabled plugins with frontend manifests', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce([
        { manifest: mockManifest, enabled: true },
        { manifest: mockManifest2, enabled: true },
      ]);

      await usePluginStore.getState().fetchPlugins();

      const state = usePluginStore.getState();
      expect(state.plugins).toHaveLength(2);
      expect(state.plugins[0].id).toBe('prometheus');
      expect(state.plugins[1].id).toBe('istio');
      expect(state.isLoading).toBe(false);
    });

    it('filters out disabled plugins', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce([
        { manifest: mockManifest, enabled: true },
        { manifest: mockManifest2, enabled: false },
      ]);

      await usePluginStore.getState().fetchPlugins();

      expect(usePluginStore.getState().plugins).toHaveLength(1);
      expect(usePluginStore.getState().plugins[0].id).toBe('prometheus');
    });

    it('filters out plugins without frontend manifest', async () => {
      const noFrontend = { ...mockManifest2, frontend: null };
      (api.get as jest.Mock).mockResolvedValueOnce([
        { manifest: mockManifest, enabled: true },
        { manifest: noFrontend, enabled: true },
      ]);

      await usePluginStore.getState().fetchPlugins();

      expect(usePluginStore.getState().plugins).toHaveLength(1);
    });

    it('sets isLoading during fetch', async () => {
      let resolveFn: (value: unknown) => void;
      const promise = new Promise((resolve) => { resolveFn = resolve; });
      (api.get as jest.Mock).mockReturnValueOnce(promise);

      const fetchPromise = usePluginStore.getState().fetchPlugins();
      expect(usePluginStore.getState().isLoading).toBe(true);

      resolveFn!([]);
      await fetchPromise;
      expect(usePluginStore.getState().isLoading).toBe(false);
    });

    it('sets isLoading to false on error', async () => {
      (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await usePluginStore.getState().fetchPlugins();

      expect(usePluginStore.getState().isLoading).toBe(false);
    });

    it('calls correct API endpoint', async () => {
      (api.get as jest.Mock).mockResolvedValueOnce([]);

      await usePluginStore.getState().fetchPlugins();

      expect(api.get).toHaveBeenCalledWith('/api/plugins');
    });
  });

  describe('getPlugin', () => {
    it('returns plugin by id', () => {
      usePluginStore.setState({ plugins: [mockManifest, mockManifest2] });

      expect(usePluginStore.getState().getPlugin('prometheus')).toEqual(mockManifest);
      expect(usePluginStore.getState().getPlugin('istio')).toEqual(mockManifest2);
    });

    it('returns undefined for non-existent plugin', () => {
      usePluginStore.setState({ plugins: [mockManifest] });

      expect(usePluginStore.getState().getPlugin('nonexistent')).toBeUndefined();
    });
  });
});
