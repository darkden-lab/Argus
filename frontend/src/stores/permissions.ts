import { create } from 'zustand';
import { api } from '@/lib/api';

interface Permission {
  resource: string;
  action: string;
  scopeType: string;
  scopeId: string;
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
  if (perm.scopeType === 'global' || perm.scopeId === '*') {
    return true;
  }
  if (perm.scopeType === 'cluster') {
    return !clusterId || perm.scopeId === clusterId || perm.scopeId === '*';
  }
  if (perm.scopeType === 'namespace') {
    if (!clusterId && !namespace) return true;
    // scopeId format: "clusterId/namespace" or "*/*" or "clusterId/*"
    const [scopeCluster, scopeNs] = perm.scopeId.split('/');
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
