"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";

interface PodMonitor {
  metadata: { name: string; namespace: string };
  spec?: { selector?: { matchLabels?: Record<string, string> }; podMetricsEndpoints?: { port?: string; path?: string }[] };
}

export function PodMonitorList() {
  const [items, setItems] = useState<PodMonitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setIsLoading(false); return; }
    const nsParam = namespace ? `?namespace=${namespace}` : "";
    api
      .get<{ items: PodMonitor[] }>(
        `/api/plugins/prometheus/${clusterID}/podmonitors${nsParam}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Pod Monitors</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pod monitors found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Selector</th>
                <th className="px-4 py-2 text-left font-medium">Endpoints</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pm) => (
                <tr
                  key={`${pm.metadata.namespace}/${pm.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{pm.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{pm.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pm.spec?.selector?.matchLabels
                      ? Object.entries(pm.spec.selector.matchLabels)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(", ")
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pm.spec?.podMetricsEndpoints?.length ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
