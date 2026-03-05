"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";

interface HostEndpoint {
  metadata: { name: string; creationTimestamp?: string };
  spec?: {
    node?: string;
    interfaceName?: string;
    expectedIPs?: string[];
  };
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

export function HostEndpointList() {
  const [items, setItems] = useState<HostEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }

    api
      .get<{ items: HostEndpoint[] }>(
        `/api/plugins/calico/hostendpoints?clusterID=${clusterID}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  function handleDelete(name: string) {
    if (!window.confirm(`Delete host endpoint "${name}"?`)) return;
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    api.del(`/api/plugins/calico/hostendpoints/${name}?clusterID=${clusterID}`)
      .then(() => setItems((prev) => prev.filter((i) => i.metadata.name !== name)))
      .catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Host Endpoints</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No host endpoints found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Node</th>
                <th className="px-4 py-2 text-left font-medium">Interface</th>
                <th className="px-4 py-2 text-left font-medium">Expected IPs</th>
                <th className="px-4 py-2 text-left font-medium">Age</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((he) => (
                <tr
                  key={he.metadata.name}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{he.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{he.spec?.node ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{he.spec?.interfaceName ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {he.spec?.expectedIPs?.join(", ") ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{age(he.metadata.creationTimestamp)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(he.metadata.name)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Delete
                    </button>
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
