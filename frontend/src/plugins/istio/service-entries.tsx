"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";
import { useClusterStore } from "@/stores/cluster";

interface ServiceEntry {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    hosts?: string[];
    location?: string;
    resolution?: string;
    ports?: { number: number; name?: string; protocol?: string }[];
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

export function ServiceEntryList() {
  const [items, setItems] = useState<ServiceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setIsLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api
      .get<{ items: ServiceEntry[] }>(
        `/api/plugins/istio/serviceentries?clusterID=${clusterID}${nsParam}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [namespace]);

  function handleDelete(ns: string, name: string) {
    if (!window.confirm(`Delete service entry "${name}" in namespace "${ns}"?`)) return;
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    api.del(`/api/plugins/istio/serviceentries/${name}?clusterID=${clusterID}&namespace=${ns}`)
      .then(() => setItems((prev) => prev.filter((i) => !(i.metadata.name === name && i.metadata.namespace === ns))))
      .catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Service Entries</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No service entries found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Namespace</th>
                <th className="px-4 py-2 text-left font-medium">Hosts</th>
                <th className="px-4 py-2 text-left font-medium">Ports</th>
                <th className="px-4 py-2 text-left font-medium">Resolution</th>
                <th className="px-4 py-2 text-left font-medium">Age</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((se) => (
                <tr
                  key={`${se.metadata.namespace}/${se.metadata.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{se.metadata.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{se.metadata.namespace}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {se.spec?.hosts?.join(", ") ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {se.spec?.ports?.map((p) => `${p.number}/${p.protocol ?? "TCP"}`).join(", ") ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{se.spec?.resolution ?? "-"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{age(se.metadata.creationTimestamp)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(se.metadata.namespace, se.metadata.name)}
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
