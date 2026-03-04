"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";
import { useClusterStore } from "@/stores/cluster";

interface AlertManager {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: { replicas?: number; version?: string; logLevel?: string; image?: string };
  status?: { availableReplicas?: number; updatedReplicas?: number };
}

function age(ts?: string): string {
  if (!ts) return "-";
  const ms = Date.now() - new Date(ts).getTime();
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h > 0) return `${h}h`;
  return `${Math.floor(ms / 60000)}m`;
}

export function AlertManagerList() {
  const [items, setItems] = useState<AlertManager[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }
    const nsParam = namespace ? `?namespace=${namespace}` : "";
    api
      .get<{ items: AlertManager[] }>(
        `/api/plugins/prometheus/${clusterID}/alertmanagers${nsParam}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [namespace]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Alert Managers</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alert managers found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Replicas</th>
                <th className="px-4 py-2 text-left font-medium">Available</th>
                <th className="px-4 py-2 text-left font-medium">Version</th>
                <th className="px-4 py-2 text-left font-medium">Log Level</th>
                <th className="px-4 py-2 text-left font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {items.map((am) => (
                <tr
                  key={`${am.metadata.namespace}/${am.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{am.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{am.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">{am.spec?.replicas ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{am.status?.availableReplicas ?? 0}</td>
                  <td className="px-4 py-2 text-muted-foreground">{am.spec?.version ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{am.spec?.logLevel ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{age(am.metadata.creationTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
