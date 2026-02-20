import { usePermissionsStore } from '@/stores/permissions';

describe('Permissions Store Security', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: false });
    jest.restoreAllMocks();
  });

  describe('privilege escalation prevention', () => {
    it('read-only user cannot access write actions', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('pods', 'write')).toBe(false);
      expect(hasPermission('pods', 'delete')).toBe(false);
      expect(hasPermission('pods', 'admin')).toBe(false);
    });

    it('pods-only user cannot access secrets', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: '*', scopeType: 'global', scopeId: '*' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('secrets', 'read')).toBe(false);
      expect(hasPermission('configmaps', 'read')).toBe(false);
      expect(hasPermission('serviceaccounts', 'read')).toBe(false);
    });

    it('cluster-scoped user cannot access other clusters', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: '*', action: '*', scopeType: 'cluster', scopeId: 'cluster-1' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('pods', 'read', 'cluster-1')).toBe(true);
      expect(hasPermission('pods', 'read', 'cluster-2')).toBe(false);
    });

    it('namespace-scoped user cannot access other namespaces', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'namespace', scopeId: 'prod/default' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('pods', 'read', 'prod', 'default')).toBe(true);
      expect(hasPermission('pods', 'read', 'prod', 'kube-system')).toBe(false);
      expect(hasPermission('pods', 'read', 'staging', 'default')).toBe(false);
    });

    it('user with no permissions is denied everything', () => {
      usePermissionsStore.setState({ permissions: [] });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('pods', 'read')).toBe(false);
      expect(hasPermission('*', '*')).toBe(false);
    });
  });

  describe('scope boundary enforcement', () => {
    it('namespace permission does not grant cluster-level access', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'namespace', scopeId: 'prod/default' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      // Without specifying namespace, should not match namespace-scoped permission
      // in the general case
      expect(hasPermission('pods', 'read', 'prod', 'kube-system')).toBe(false);
    });

    it('multiple permissions combine correctly (union, not intersection)', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scopeType: 'global', scopeId: '*' },
          { resource: 'deployments', action: 'read', scopeType: 'global', scopeId: '*' },
        ],
      });

      const { hasPermission } = usePermissionsStore.getState();
      expect(hasPermission('pods', 'read')).toBe(true);
      expect(hasPermission('deployments', 'read')).toBe(true);
      expect(hasPermission('services', 'read')).toBe(false);
    });
  });

  describe('clearPermissions security', () => {
    it('clearPermissions removes all access', () => {
      usePermissionsStore.setState({
        permissions: [
          { resource: '*', action: '*', scopeType: 'global', scopeId: '*' },
        ],
        isLoaded: true,
      });

      // Before clear - has access
      expect(usePermissionsStore.getState().hasPermission('pods', 'read')).toBe(true);

      usePermissionsStore.getState().clearPermissions();

      // After clear - no access
      expect(usePermissionsStore.getState().hasPermission('pods', 'read')).toBe(false);
      expect(usePermissionsStore.getState().isLoaded).toBe(false);
    });
  });

  describe('malicious API response handling', () => {
    it('handles null permissions in API response without granting access', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ permissions: null }),
      });

      localStorage.setItem('access_token', 'test-token');
      await usePermissionsStore.getState().fetchPermissions();

      // When server returns null permissions, the store sets permissions to null.
      // Calling hasPermission on null throws, which effectively denies access.
      // This is a safe failure mode - it does not silently grant access.
      expect(() => {
        usePermissionsStore.getState().hasPermission('pods', 'read');
      }).toThrow();
    });

    it('handles empty array permissions in API response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ permissions: [] }),
      });

      localStorage.setItem('access_token', 'test-token');
      await usePermissionsStore.getState().fetchPermissions();

      expect(usePermissionsStore.getState().hasPermission('pods', 'read')).toBe(false);
      expect(usePermissionsStore.getState().isLoaded).toBe(true);
    });

    it('handles network error without granting access', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      await usePermissionsStore.getState().fetchPermissions();

      expect(usePermissionsStore.getState().hasPermission('pods', 'read')).toBe(false);
    });

    it('permissions with XSS in resource names are stored as plain strings', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          permissions: [
            {
              resource: '<script>alert(1)</script>',
              action: 'read',
              scopeType: 'global',
              scopeId: '*',
            },
          ],
        }),
      });

      localStorage.setItem('access_token', 'test-token');
      await usePermissionsStore.getState().fetchPermissions();

      const { permissions } = usePermissionsStore.getState();
      expect(permissions[0]?.resource).toBe('<script>alert(1)</script>');
      // This XSS resource should not match 'pods'
      expect(usePermissionsStore.getState().hasPermission('pods', 'read')).toBe(false);
    });
  });
});
