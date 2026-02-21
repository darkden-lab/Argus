import { renderHook, act } from '@testing-library/react';
import { usePermission, useIsAdmin, usePermissionsLoaded } from '@/hooks/use-permissions';
import { usePermissionsStore } from '@/stores/permissions';

describe('usePermission', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: false });
  });

  it('returns false when no permissions are present', () => {
    const { result } = renderHook(() => usePermission('pods', 'read'));
    expect(result.current).toBe(false);
  });

  it('returns true when a matching global permission exists', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
    });

    const { result } = renderHook(() => usePermission('pods', 'read'));
    expect(result.current).toBe(true);
  });

  it('returns false for non-matching resource', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
    });

    const { result } = renderHook(() => usePermission('deployments', 'read'));
    expect(result.current).toBe(false);
  });

  it('returns false for non-matching action', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
    });

    const { result } = renderHook(() => usePermission('pods', 'delete'));
    expect(result.current).toBe(false);
  });

  it('respects cluster-scoped permission with matching clusterId', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'cluster', scope_id: 'prod' },
      ],
    });

    const { result: match } = renderHook(() =>
      usePermission('pods', 'read', 'prod')
    );
    expect(match.current).toBe(true);

    const { result: noMatch } = renderHook(() =>
      usePermission('pods', 'read', 'staging')
    );
    expect(noMatch.current).toBe(false);
  });

  it('respects namespace-scoped permission with clusterId and namespace', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'namespace', scope_id: 'prod/default' },
      ],
    });

    const { result: match } = renderHook(() =>
      usePermission('pods', 'read', 'prod', 'default')
    );
    expect(match.current).toBe(true);

    const { result: wrongNs } = renderHook(() =>
      usePermission('pods', 'read', 'prod', 'kube-system')
    );
    expect(wrongNs.current).toBe(false);
  });

  it('reacts to permission store changes', () => {
    const { result } = renderHook(() => usePermission('pods', 'read'));
    expect(result.current).toBe(false);

    act(() => {
      usePermissionsStore.setState({
        permissions: [
          { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
        ],
      });
    });

    expect(result.current).toBe(true);
  });
});

describe('useIsAdmin', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: false });
  });

  it('returns false when no permissions exist', () => {
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it('returns true when global wildcard admin permission exists', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: '*', action: '*', scope_type: 'global', scope_id: '*' },
      ],
    });

    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true);
  });

  it('returns false when only specific permissions exist', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
        { resource: 'deployments', action: '*', scope_type: 'global', scope_id: '*' },
      ],
    });

    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it('returns false for wildcard resource/action but cluster scope', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: '*', action: '*', scope_type: 'cluster', scope_id: 'prod' },
      ],
    });

    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });
});

describe('usePermissionsLoaded', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: false });
  });

  it('returns false when permissions have not been loaded', () => {
    const { result } = renderHook(() => usePermissionsLoaded());
    expect(result.current).toBe(false);
  });

  it('returns true after permissions are loaded', () => {
    usePermissionsStore.setState({ isLoaded: true });

    const { result } = renderHook(() => usePermissionsLoaded());
    expect(result.current).toBe(true);
  });

  it('reacts to isLoaded state changes', () => {
    const { result } = renderHook(() => usePermissionsLoaded());
    expect(result.current).toBe(false);

    act(() => {
      usePermissionsStore.setState({ isLoaded: true });
    });

    expect(result.current).toBe(true);
  });
});
