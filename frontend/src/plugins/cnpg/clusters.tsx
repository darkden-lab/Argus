"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface CnpgCluster {
  metadata: { name: string; namespace: string };
  spec?: { instances?: number; storage?: { size?: string } };
  status?: { phase?: string; readyInstances?: number };
}

const columns: Column<CnpgCluster>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "spec.instances",
    label: "Instances",
    render: (r) => String(r.spec?.instances ?? "-"),
  },
  {
    key: "status.readyInstances",
    label: "Ready",
    render: (r) => `${r.status?.readyInstances ?? 0}/${r.spec?.instances ?? 0}`,
  },
  {
    key: "spec.storage.size",
    label: "Storage",
    render: (r) => r.spec?.storage?.size ?? "-",
  },
  {
    key: "status.phase",
    label: "Status",
    render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} />,
  },
];

export function CnpgClusterList() {
  const [items, setItems] = useState<CnpgCluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: CnpgCluster[] }>(`/api/plugins/cnpg/clusters?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">PostgreSQL Clusters</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter clusters..." />
    </div>
  );
}
