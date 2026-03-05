"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CephBlockPool {
  metadata: { name: string; namespace: string };
  spec?: { replicated?: { size?: number }; erasureCoded?: { codingChunks?: number; dataChunks?: number } };
  status?: { phase?: string };
}

const columns: Column<CephBlockPool>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "spec.replicated.size",
    label: "Replication",
    render: (r) =>
      r.spec?.replicated?.size
        ? `${r.spec.replicated.size}x`
        : r.spec?.erasureCoded
          ? `EC ${r.spec.erasureCoded.dataChunks}+${r.spec.erasureCoded.codingChunks}`
          : "-",
    sortable: false,
  },
  { key: "status.phase", label: "Status", render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} /> },
];

export function CephBlockPoolList() {
  const [items, setItems] = useState<CephBlockPool[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: CephBlockPool[] }>(`/api/plugins/ceph/blockpools?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Block Pools</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter block pools..." />
    </div>
  );
}
