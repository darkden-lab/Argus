import { usePermissionsStore } from '@/stores/permissions';

describe('usePermissionsStore', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: false });
  });

  describe('hasPermission', () => {
    it('returns false when no permissions are set', () => {
      const result = usePermissionsStore.getState().hasPermission('pods', 'read');
      expect(result).toBe(false);
    });

    it('returns true for matching resource and action with global scope', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
        ],
      });
      const result = usePermissionsStore.getState().hasPermission('pods', 'read');
      expect(result).toBe(true);
    });

    it('returns true for wildcard resource permission', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: '*', action: '*', scopeType: 'global', scopeId: '*' },
        ],
      });
      const result = usePermissionsStore.getState().hasPermission('pods', 'delete');
      expect(result).toBe(true);
    });

    it('returns false for non-matching action', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
        ],
      });
      const result = usePermissionsStore.getState().hasPermission('pods', 'delete');
      expect(result).toBe(false);
    });

    it('returns false for non-matching resource', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
        ],
      });
      const result = usePermissionsStore.getState().hasPermission('deployments', 'read');
      expect(result).toBe(false);
    });

    it('handles cluster-scoped permissions', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'cluster', scopeId: 'prod' },
        ],
      });
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'prod')
      ).toBe(true);
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'staging')
      ).toBe(false);
    });

    it('handles cluster wildcard scope', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'cluster', scopeId: '*' },
        ],
      });
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'any-cluster')
      ).toBe(true);
    });

    it('handles namespace-scoped permissions', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'namespace', scopeId: 'prod/default' },
        ],
      });
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'prod', 'default')
      ).toBe(true);
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'prod', 'kube-system')
      ).toBe(false);
    });

    it('handles namespace wildcard permissions', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'namespace', scopeId: '*/default' },
        ],
      });
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read', 'any-cluster', 'default')
      ).toBe(true);
    });

    it('cluster-scoped allows access without clusterId filter', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'cluster', scopeId: 'prod' },
        ],
      });
      expect(
        usePermissionsStore.getState().hasPermission('pods', 'read')
      ).toBe(true);
    });
  });

  describe('clearPermissions', () => {
    it('clears all permissions and resets isLoaded', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: '*', action: '*', scopeType: 'global', scopeId: '*' },
        ],
        isLoaded: true,
      });

      usePermissionsStore.getState().clearPermissions();

      const state = usePermissionsStore.getState();
      expect(state.permissions).toEqual([]);
      expect(state.isLoaded).toBe(false);
    });
  });

  describe('fetchPermissions', () => {
    it('sets permissions from API response', async () => {
      const mockPermissions = [
        { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ permissions: mockPermissions }),
      });

      localStorage.setItem('access_token', 'test-token');
      await usePermissionsStore.getState().fetchPermissions();

      const state = usePermissionsStore.getState();
      expect(state.permissions).toEqual(mockPermissions);
      expect(state.isLoaded).toBe(true);
    });

    it('sets empty permissions on API error', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      await usePermissionsStore.getState().fetchPermissions();

      const state = usePermissionsStore.getState();
      expect(state.permissions).toEqual([]);
      expect(state.isLoaded).toBe(true);
    });
  });
});
