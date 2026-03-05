"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

const RESOURCES = [
  "clusters",
  "apps",
  "jobs",
  "databases",
  "plugins",
  "terminal",
  "monitoring",
  "notifications",
  "settings",
  "audit",
  "roles",
  "ai",
] as const;

const ACTIONS = ["read", "write", "delete"] as const;

interface Permission {
  id: string;
  resource: string;
  action: string;
  scope_type: string;
  scope_id: string;
}

interface PermissionMatrixProps {
  roleId: string;
  permissions: Permission[];
  readonly?: boolean;
  onAdded?: (perm: Permission) => void;
  onRemoved?: (permId: string) => void;
}

export function PermissionMatrix({
  roleId,
  permissions,
  readonly = false,
  onAdded,
  onRemoved,
}: PermissionMatrixProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function findPermission(
    resource: string,
    action: string
  ): Permission | undefined {
    return permissions.find(
      (p) =>
        (p.resource === resource || p.resource === "*") &&
        (p.action === action || p.action === "*")
    );
  }

  async function togglePermission(resource: string, action: string) {
    if (readonly) return;
    const existing = findPermission(resource, action);
    const key = `${resource}-${action}`;
    setLoading(key);
    try {
      if (existing && existing.resource === resource && existing.action === action) {
        await api.del(`/api/roles/${roleId}/permissions/${existing.id}`);
        onRemoved?.(existing.id);
      } else if (!existing) {
        const perm = await api.post<Permission>(
          `/api/roles/${roleId}/permissions`,
          { resource, action, scope_type: "global", scope_id: "" }
        );
        onAdded?.(perm);
      }
    } catch (e) {
      console.error("Failed to toggle permission:", e);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
              Resource
            </th>
            {ACTIONS.map((action) => (
              <th
                key={action}
                className="text-center py-2 px-3 font-medium text-muted-foreground capitalize"
              >
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((resource) => (
            <tr key={resource} className="border-t border-border">
              <td className="py-2 pr-4 capitalize font-medium">{resource}</td>
              {ACTIONS.map((action) => {
                const perm = findPermission(resource, action);
                const key = `${resource}-${action}`;
                const isWildcard =
                  perm && (perm.resource === "*" || perm.action === "*");
                return (
                  <td key={action} className="text-center py-2 px-3">
                    {loading === key ? (
                      <Loader2 className="h-4 w-4 animate-spin inline-block text-muted-foreground" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!perm}
                        disabled={readonly || !!isWildcard}
                        onChange={() => togglePermission(resource, action)}
                        className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
