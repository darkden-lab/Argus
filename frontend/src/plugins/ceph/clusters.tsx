"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface CephCluster {
  metadata: { name: string; namespace: string };
  spec?: { mon?: { count?: number }; storage?: { storageClassDeviceSets?: { count?: number }[] } };
  status?: { phase?: string; ceph?: { health?: string }; storage?: { osd?: { storeType?: Record<string, number> } } };
}

function osdCount(r: CephCluster): number {
  const store = r.status?.storage?.osd?.storeType;
  if (!store) return 0;
  return Object.values(store).reduce((a, b) => a + b, 0);
}

const columns: Column<CephCluster>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.mon.count",     label: "Monitors", render: (r) => String(r.spec?.mon?.count ?? "-") },
  { key: "status.storage",     label: "OSDs",     render: (r) => String(osdCount(r)), sortable: false },
  { key: "status.ceph.health", label: "Health",   render: (r) => r.status?.ceph?.health ?? "-" },
  { key: "status.phase",       label: "Phase",    render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} /> },
];

export function CephClusterList() {
  const [items, setItems] = useState<CephCluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: CephCluster[] }>(`/api/plugins/ceph/cephclusters?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Ceph Clusters</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter clusters..." />
    </div>
  );
}
