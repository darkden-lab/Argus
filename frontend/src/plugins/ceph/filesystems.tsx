"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CephFilesystem {
  metadata: { name: string; namespace: string };
  spec?: { metadataPool?: { replicated?: { size?: number } }; dataPools?: unknown[] };
  status?: { phase?: string };
}

const columns: Column<CephFilesystem>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "spec.metadataPool.replicated.size",
    label: "Metadata Replication",
    render: (r) => r.spec?.metadataPool?.replicated?.size ? `${r.spec.metadataPool.replicated.size}x` : "-",
  },
  { key: "spec.dataPools",  label: "Data Pools", render: (r) => String(r.spec?.dataPools?.length ?? 0) },
  { key: "status.phase",    label: "Status",     render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} /> },
];

export function CephFilesystemList() {
  const [items, setItems] = useState<CephFilesystem[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: CephFilesystem[] }>(`/api/plugins/ceph/cephfilesystems?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Filesystems</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter filesystems..." />
    </div>
  );
}
