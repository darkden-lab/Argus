"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface GlobalNetworkPolicy {
  metadata: { name: string };
  spec?: {
    selector?: string;
    order?: number;
    ingress?: unknown[];
    egress?: unknown[];
  };
}

export function GlobalNetworkPolicyList() {
  const [items, setItems] = useState<GlobalNetworkPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }

    api
      .get<{ items: GlobalNetworkPolicy[] }>(
        `/api/plugins/calico/globalnetworkpolicies?clusterID=${clusterID}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Global Network Policies</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No global network policies found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Order</th>
                <th className="px-4 py-2 text-left font-medium">Selector</th>
                <th className="px-4 py-2 text-left font-medium">Ingress Rules</th>
                <th className="px-4 py-2 text-left font-medium">Egress Rules</th>
              </tr>
            </thead>
            <tbody>
              {items.map((gnp) => (
                <tr
                  key={gnp.metadata.name}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{gnp.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{gnp.spec?.order ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                    {gnp.spec?.selector ?? "all()"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{gnp.spec?.ingress?.length ?? 0}</td>
                  <td className="px-4 py-2 text-muted-foreground">{gnp.spec?.egress?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
