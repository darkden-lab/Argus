import React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    post: jest.fn(),
    del: jest.fn(),
  },
}));

const mockPermissions = [
  { id: '1', resource: 'clusters', action: 'read', scope_type: 'global', scope_id: '' },
];

describe('PermissionMatrix', () => {
  it('renders resource rows and action columns', () => {
    render(<PermissionMatrix roleId="role-1" permissions={[]} />);
    // Check resource names rendered
    expect(screen.getByText('clusters')).toBeInTheDocument();
    expect(screen.getByText('apps')).toBeInTheDocument();
    expect(screen.getByText('terminal')).toBeInTheDocument();
    // Check action headers
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
  });

  it('shows existing permissions as checked', () => {
    render(<PermissionMatrix roleId="role-1" permissions={mockPermissions} />);
    const checkboxes = screen.getAllByRole('checkbox');
    const checkedBoxes = checkboxes.filter(
      (cb) => (cb as HTMLInputElement).checked
    );
    expect(checkedBoxes.length).toBeGreaterThan(0);
  });

  it('renders all 12 resource rows', () => {
    const { container } = render(
      <PermissionMatrix roleId="role-1" permissions={[]} />
    );
    // 12 resources, each with its own row in tbody
    const tbodyRows = container.querySelectorAll('tbody tr');
    expect(tbodyRows).toHaveLength(12);
  });

  it('disables checkboxes in readonly mode', () => {
    render(
      <PermissionMatrix roleId="role-1" permissions={[]} readonly />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
  });

  it('disables wildcard-matched checkboxes', () => {
    const wildcardPerms = [
      { id: 'w', resource: '*', action: '*', scope_type: 'global', scope_id: '' },
    ];
    render(
      <PermissionMatrix roleId="role-1" permissions={wildcardPerms} />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // All should be checked and disabled (wildcard match)
    checkboxes.forEach((cb) => {
      expect(cb).toBeChecked();
      expect(cb).toBeDisabled();
    });
  });
});
