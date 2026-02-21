import { usePermissionsStore } from '@/stores/permissions';

export function usePermission(
  resource: string,
  action: string,
  clusterId?: string,
  namespace?: string
): boolean {
  return usePermissionsStore((state) =>
    state.hasPermission(resource, action, clusterId, namespace)
  );
}

export function useIsAdmin(): boolean {
  return usePermissionsStore((state) =>
    state.permissions.some(
      (p) => p.resource === '*' && p.action === '*' && p.scope_type === 'global'
    )
  );
}

export function usePermissionsLoaded(): boolean {
  return usePermissionsStore((state) => state.isLoaded);
}
