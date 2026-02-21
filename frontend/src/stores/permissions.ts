import { create } from 'zustand';
import { api } from '@/lib/api';

interface Permission {
  resource: string;
  action: string;
  scope_type: string;
  scope_id: string;
}

interface PermissionsResponse {
  permissions: Permission[];
}

interface PermissionsState {
  permissions: Permission[];
  isLoaded: boolean;
  fetchPermissions: () => Promise<void>;
  hasPermission: (resource: string, action: string, clusterId?: string, namespace?: string) => boolean;
  clearPermissions: () => void;
}

function matchesScope(
  perm: Permission,
  clusterId?: string,
  namespace?: string
): boolean {
  if (perm.scope_type === 'global' || perm.scope_id === '*') {
    return true;
  }
  if (perm.scope_type === 'cluster') {
    return !clusterId || perm.scope_id === clusterId || perm.scope_id === '*';
  }
  if (perm.scope_type === 'namespace') {
    if (!clusterId && !namespace) return true;
    // scope_id format: "clusterId/namespace" or "*/*" or "clusterId/*"
    const [scopeCluster, scopeNs] = perm.scope_id.split('/');
    const clusterMatch = !clusterId || scopeCluster === '*' || scopeCluster === clusterId;
    const nsMatch = !namespace || scopeNs === '*' || scopeNs === namespace;
    return clusterMatch && nsMatch;
  }
  return false;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  permissions: [],
  isLoaded: false,

  fetchPermissions: async () => {
    try {
      const data = await api.get<PermissionsResponse>('/api/auth/permissions');
      set({ permissions: data.permissions, isLoaded: true });
    } catch {
      // If permissions endpoint fails, assume no permissions (viewer mode)
      set({ permissions: [], isLoaded: true });
    }
  },

  hasPermission: (
    resource: string,
    action: string,
    clusterId?: string,
    namespace?: string
  ): boolean => {
    const { permissions } = get();

    return permissions.some((perm) => {
      const resourceMatch = perm.resource === '*' || perm.resource === resource;
      const actionMatch = perm.action === '*' || perm.action === action;
      const scopeMatch = matchesScope(perm, clusterId, namespace);
      return resourceMatch && actionMatch && scopeMatch;
    });
  },

  clearPermissions: () => {
    set({ permissions: [], isLoaded: false });
  },
}));
