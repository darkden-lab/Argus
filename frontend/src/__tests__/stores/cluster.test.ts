import { useClusterStore } from '@/stores/cluster';

describe('useClusterStore — namespace & project state', () => {
  beforeEach(() => {
    useClusterStore.setState({
      clusters: [],
      selectedClusterId: null,
      selectedNamespace: null,
      selectedProject: null,
      namespaces: [],
      loading: false,
    });
    localStorage.clear();
  });

  describe('selectedNamespace persistence', () => {
    it('persists selectedNamespace to localStorage per cluster', () => {
      const { setSelectedClusterId, setSelectedNamespace } = useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setSelectedNamespace('production');

      expect(useClusterStore.getState().selectedNamespace).toBe('production');
      expect(localStorage.getItem('argus_ns_cluster-1')).toBe('production');
    });

    it('clears selectedNamespace from localStorage when set to null', () => {
      const { setSelectedClusterId, setSelectedNamespace } = useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setSelectedNamespace('production');
      expect(localStorage.getItem('argus_ns_cluster-1')).toBe('production');

      setSelectedNamespace(null);
      expect(useClusterStore.getState().selectedNamespace).toBeNull();
      expect(localStorage.getItem('argus_ns_cluster-1')).toBeNull();
    });

    it('restores saved namespace when switching back to a cluster', () => {
      const { setSelectedClusterId, setSelectedNamespace } = useClusterStore.getState();

      // Set cluster-1 with namespace 'prod'
      setSelectedClusterId('cluster-1');
      setSelectedNamespace('prod');
      expect(localStorage.getItem('argus_ns_cluster-1')).toBe('prod');

      // Switch to cluster-2
      setSelectedClusterId('cluster-2');
      expect(useClusterStore.getState().selectedNamespace).toBeNull();
      expect(useClusterStore.getState().namespaces).toEqual([]);

      // Switch back to cluster-1 — namespace should be restored
      setSelectedClusterId('cluster-1');
      expect(useClusterStore.getState().selectedNamespace).toBe('prod');
    });

    it('resets namespaces array when switching clusters', () => {
      const { setSelectedClusterId, setNamespaces } = useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setNamespaces(['default', 'kube-system']);
      expect(useClusterStore.getState().namespaces).toEqual(['default', 'kube-system']);

      setSelectedClusterId('cluster-2');
      expect(useClusterStore.getState().namespaces).toEqual([]);
    });
  });

  describe('selectedProject', () => {
    it('setSelectedProject stores the project name', () => {
      const { setSelectedProject } = useClusterStore.getState();
      setSelectedProject('my-project');
      expect(useClusterStore.getState().selectedProject).toBe('my-project');
    });

    it('setSelectedProject clears selectedNamespace when project is non-null', () => {
      const { setSelectedClusterId, setSelectedNamespace, setSelectedProject } =
        useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setSelectedNamespace('production');
      expect(useClusterStore.getState().selectedNamespace).toBe('production');

      setSelectedProject('my-project');
      expect(useClusterStore.getState().selectedNamespace).toBeNull();
      expect(useClusterStore.getState().selectedProject).toBe('my-project');
    });

    it('setSelectedProject(null) does not clear selectedNamespace', () => {
      const { setSelectedClusterId, setSelectedNamespace, setSelectedProject } =
        useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setSelectedNamespace('staging');
      setSelectedProject('proj');
      // namespace was cleared by setting project
      expect(useClusterStore.getState().selectedNamespace).toBeNull();

      // Now set namespace again and clear project
      setSelectedNamespace('staging');
      setSelectedProject(null);
      expect(useClusterStore.getState().selectedProject).toBeNull();
      expect(useClusterStore.getState().selectedNamespace).toBe('staging');
    });

    it('setSelectedClusterId resets selectedProject to null', () => {
      const { setSelectedClusterId, setSelectedProject } = useClusterStore.getState();
      setSelectedClusterId('cluster-1');
      setSelectedProject('my-project');
      expect(useClusterStore.getState().selectedProject).toBe('my-project');

      setSelectedClusterId('cluster-2');
      expect(useClusterStore.getState().selectedProject).toBeNull();
    });
  });
});
