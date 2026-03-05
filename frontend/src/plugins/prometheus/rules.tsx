"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";
import { useClusterStore } from "@/stores/cluster";

interface PrometheusRule {
  metadata: { name: string; namespace: string };
  spec?: { groups?: { name: string; rules: unknown[] }[] };
}

export function RulesList() {
  const [items, setItems] = useState<PrometheusRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setIsLoading(false); return; }
    const nsParam = namespace ? `?namespace=${namespace}` : "";
    api
      .get<{ items: PrometheusRule[] }>(
        `/api/plugins/prometheus/${clusterID}/prometheusrules${nsParam}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Prometheus Rules</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Groups</th>
                <th className="px-4 py-2 text-left font-medium">Rules</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pr) => (
                <tr
                  key={`${pr.metadata.namespace}/${pr.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{pr.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{pr.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pr.spec?.groups?.length ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pr.spec?.groups?.reduce((acc, g) => acc + (g.rules?.length ?? 0), 0) ?? 0}
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
