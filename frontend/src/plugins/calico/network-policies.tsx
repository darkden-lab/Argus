"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";
import { useClusterStore } from "@/stores/cluster";

interface NetworkPolicy {
  metadata: { name: string; namespace: string };
  spec?: {
    selector?: string;
    ingress?: unknown[];
    egress?: unknown[];
  };
}

export function NetworkPolicyList() {
  const [items, setItems] = useState<NetworkPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api
      .get<{ items: NetworkPolicy[] }>(
        `/api/plugins/calico/networkpolicies?clusterID=${clusterID}${nsParam}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [namespace]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Network Policies</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No network policies found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Ingress Rules</th>
                <th className="px-4 py-2 text-left font-medium">Egress Rules</th>
              </tr>
            </thead>
            <tbody>
              {items.map((np) => (
                <tr
                  key={`${np.metadata.namespace}/${np.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{np.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{np.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {np.spec?.ingress?.length ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {np.spec?.egress?.length ?? 0}
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
