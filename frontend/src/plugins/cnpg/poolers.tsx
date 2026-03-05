"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CnpgPooler {
  metadata: { name: string; namespace: string };
  spec?: { cluster?: { name?: string }; instances?: number; type?: string };
  status?: { ready?: number };
}

const columns: Column<CnpgPooler>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.cluster.name",  label: "Cluster",   render: (r) => r.spec?.cluster?.name ?? "-" },
  { key: "spec.type",          label: "Type",      render: (r) => r.spec?.type ?? "-" },
  { key: "spec.instances",     label: "Instances", render: (r) => String(r.spec?.instances ?? "-") },
  {
    key: "status.ready",
    label: "Status",
    render: (r) => <StatusBadge status={r.status?.ready ? "Ready" : "Not Ready"} />,
  },
];

export function CnpgPoolerList() {
  const [items, setItems] = useState<CnpgPooler[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: CnpgPooler[] }>(`/api/plugins/cnpg/poolers?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Poolers</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter poolers..." />
    </div>
  );
}
