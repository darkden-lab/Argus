"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ServiceMonitor {
  metadata: { name: string; namespace: string };
  spec?: { selector?: { matchLabels?: Record<string, string> } };
}

export function ServiceMonitorList() {
  const [items, setItems] = useState<ServiceMonitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }

    api
      .get<{ items: ServiceMonitor[] }>(
        `/api/plugins/prometheus/servicemonitors?clusterID=${clusterID}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Service Monitors</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No service monitors found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Selector</th>
              </tr>
            </thead>
            <tbody>
              {items.map((sm) => (
                <tr
                  key={`${sm.metadata.namespace}/${sm.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{sm.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{sm.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {sm.spec?.selector?.matchLabels
                      ? Object.entries(sm.spec.selector.matchLabels)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(", ")
                      : "-"}
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
