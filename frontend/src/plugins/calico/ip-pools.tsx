"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PluginTableSkeleton } from "@/components/skeletons";
import { useClusterStore } from "@/stores/cluster";

interface IPPool {
  metadata: { name: string };
  spec?: {
    cidr?: string;
    ipipMode?: string;
    vxlanMode?: string;
    disabled?: boolean;
  };
}

export function IPPoolList() {
  const [items, setItems] = useState<IPPool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setIsLoading(false); return; }

    api
      .get<{ items: IPPool[] }>(
        `/api/plugins/calico/ippools?clusterID=${clusterID}`
      )
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">IP Pools</h1>
      {isLoading ? (
        <PluginTableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No IP pools found.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">CIDR</th>
                <th className="px-4 py-2 text-left font-medium">IPIP Mode</th>
                <th className="px-4 py-2 text-left font-medium">VXLAN Mode</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pool) => (
                <tr
                  key={pool.metadata.name}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-mono text-xs">{pool.metadata.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {pool.spec?.cidr ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pool.spec?.ipipMode ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {pool.spec?.vxlanMode ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        pool.spec?.disabled
                          ? "text-destructive"
                          : "text-green-500"
                      }
                    >
                      {pool.spec?.disabled ? "Disabled" : "Active"}
                    </span>
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
