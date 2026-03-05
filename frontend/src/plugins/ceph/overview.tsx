"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CephCluster {
  metadata: { name: string };
  status?: { phase?: string; ceph?: { health?: string } };
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
    </div>
  );
}

export function CephOverview() {
  const [counts, setCounts] = useState({ clusters: 0, blockPools: 0, filesystems: 0, objectStores: 0 });
  const [health, setHealth] = useState<string>("Unknown");
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) return;
    const nsParam = namespace ? `&namespace=${namespace}` : "";

    Promise.allSettled([
      api.get<{ items: CephCluster[] }>(`/api/plugins/ceph/clusters?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/ceph/blockpools?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/ceph/filesystems?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/ceph/objectstores?clusterID=${clusterID}${nsParam}`),
    ]).then(([cl, bp, fs, os]) => {
      if (cl.status === "fulfilled" && cl.value.items?.[0]) {
        setHealth(cl.value.items[0].status?.ceph?.health ?? cl.value.items[0].status?.phase ?? "Unknown");
      }
      setCounts({
        clusters:     cl.status === "fulfilled" ? (cl.value.items?.length ?? 0) : 0,
        blockPools:   bp.status === "fulfilled" ? (bp.value.items?.length ?? 0) : 0,
        filesystems:  fs.status === "fulfilled" ? (fs.value.items?.length ?? 0) : 0,
        objectStores: os.status === "fulfilled" ? (os.value.items?.length ?? 0) : 0,
      });
    });
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rook Ceph</h1>
          <p className="text-muted-foreground">Manage Ceph storage clusters and resources.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Cluster Health:</span>
          <StatusBadge status={health} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountCard label="Clusters"      count={counts.clusters} />
        <CountCard label="Block Pools"   count={counts.blockPools} />
        <CountCard label="Filesystems"   count={counts.filesystems} />
        <CountCard label="Object Stores" count={counts.objectStores} />
      </div>
    </div>
  );
}

export function CephStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ceph</p>
      <p className="mt-1 text-sm font-medium">Rook Ceph Active</p>
    </div>
  );
}
