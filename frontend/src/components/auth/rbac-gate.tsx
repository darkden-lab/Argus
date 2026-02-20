"use client";

import { usePermission } from "@/hooks/use-permissions";

interface RBACGateProps {
  resource: string;
  action: string;
  clusterId?: string;
  namespace?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RBACGate({
  resource,
  action,
  clusterId,
  namespace,
  fallback,
  children,
}: RBACGateProps) {
  const allowed = usePermission(resource, action, clusterId, namespace);
  if (!allowed) return fallback ?? null;
  return <>{children}</>;
}
