"use client";

import { useIsAdmin, usePermission } from "@/hooks/use-permissions";

type Role = "admin" | "operator" | "developer" | "viewer";

const rolePermissions: Record<Role, { resource: string; action: string }> = {
  admin: { resource: "*", action: "*" },
  operator: { resource: "clusters", action: "write" },
  developer: { resource: "resources", action: "write" },
  viewer: { resource: "resources", action: "read" },
};

interface RequireRoleProps {
  role: Role;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequireRole({ role, fallback, children }: RequireRoleProps) {
  const isAdmin = useIsAdmin();
  const { resource, action } = rolePermissions[role];
  const hasRole = usePermission(resource, action);

  if (isAdmin || hasRole) return <>{children}</>;
  return fallback ?? null;
}

interface RequireAdminProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequireAdmin({ fallback, children }: RequireAdminProps) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return fallback ?? null;
  return <>{children}</>;
}
