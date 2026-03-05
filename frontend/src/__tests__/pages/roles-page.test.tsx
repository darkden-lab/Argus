import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue([]),
    post: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue({}),
  },
}));

// Mock CreateRoleDialog since it uses its own API calls
jest.mock('@/components/rbac/create-role-dialog', () => ({
  CreateRoleDialog: ({ onCreated }: { onCreated: () => void }) => (
    <button data-testid="create-role-btn">New Role</button>
  ),
}));

// Mock PermissionMatrix
jest.mock('@/components/rbac/permission-matrix', () => ({
  PermissionMatrix: () => <div data-testid="permission-matrix" />,
}));

import RolesPage from '@/app/(dashboard)/settings/roles/page';

describe('RolesPage', () => {
  it('renders roles page with tabs', async () => {
    render(<RolesPage />);
    // Multiple "Roles" text — use getAllByText and check at least one exists
    const rolesTexts = screen.getAllByText('Roles');
    expect(rolesTexts.length).toBeGreaterThan(0);
    expect(screen.getByText('Assignments')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<RolesPage />);
    expect(screen.getByText('Loading roles...')).toBeInTheDocument();
  });

  it('shows empty state when no roles', async () => {
    render(<RolesPage />);
    await waitFor(() => {
      expect(screen.getByText('No roles found.')).toBeInTheDocument();
    });
  });

  it('renders create role button', () => {
    render(<RolesPage />);
    expect(screen.getByTestId('create-role-btn')).toBeInTheDocument();
  });
});
