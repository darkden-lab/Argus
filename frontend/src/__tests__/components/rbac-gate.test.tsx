import React from 'react';
import { render, screen } from '../test-utils';
import { RBACGate } from '@/components/auth/rbac-gate';
import { usePermissionsStore } from '@/stores/permissions';

describe('RBACGate', () => {
  beforeEach(() => {
    usePermissionsStore.setState({ permissions: [], isLoaded: true });
  });

  it('renders children when permission is granted', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
    });

    render(
      <RBACGate resource="pods" action="read">
        <div>Protected Content</div>
      </RBACGate>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders nothing when permission is denied', () => {
    usePermissionsStore.setState({ permissions: [] });

    const { container } = render(
      <RBACGate resource="pods" action="delete">
        <div>Protected Content</div>
      </RBACGate>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('renders fallback when permission is denied and fallback is provided', () => {
    usePermissionsStore.setState({ permissions: [] });

    render(
      <RBACGate
        resource="pods"
        action="delete"
        fallback={<div>Access Denied</div>}
      >
        <div>Protected Content</div>
      </RBACGate>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('respects cluster-scoped permissions', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'cluster', scope_id: 'prod' },
      ],
    });

    const { rerender } = render(
      <RBACGate resource="pods" action="read" clusterId="prod">
        <div>Prod Content</div>
      </RBACGate>
    );
    expect(screen.getByText('Prod Content')).toBeInTheDocument();

    rerender(
      <RBACGate resource="pods" action="read" clusterId="staging">
        <div>Staging Content</div>
      </RBACGate>
    );
    expect(screen.queryByText('Staging Content')).not.toBeInTheDocument();
  });

  it('renders children with admin wildcard permissions', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: '*', action: '*', scope_type: 'global', scope_id: '*' },
      ],
    });

    render(
      <RBACGate resource="anything" action="delete" clusterId="any" namespace="any">
        <div>Admin Content</div>
      </RBACGate>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
