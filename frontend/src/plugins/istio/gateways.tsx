"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Gateway {
  metadata: { name: string; namespace: string };
  spec?: {
    servers?: { hosts?: string[]; port?: { number: number; protocol: string } }[];
  };
}

export function GatewayList() {
  const [items, setItems] = useState<Gateway[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }

    api
      .get<{ items: Gateway[] }>(
        `/api/plugins/istio/gateways?clusterID=${clusterID}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Gateways</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No gateways found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Servers</th>
                <th className="px-4 py-2 text-left font-medium">Hosts</th>
              </tr>
            </thead>
            <tbody>
              {items.map((gw) => (
                <tr
                  key={`${gw.metadata.namespace}/${gw.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{gw.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{gw.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {gw.spec?.servers?.length ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {gw.spec?.servers?.flatMap((s) => s.hosts ?? []).join(", ") ?? "-"}
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
