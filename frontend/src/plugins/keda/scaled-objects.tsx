"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface ScaledObject {
  metadata: { name: string; namespace: string };
  spec?: {
    scaleTargetRef?: { name?: string; kind?: string };
    minReplicaCount?: number;
    maxReplicaCount?: number;
    triggers?: { type: string }[];
  };
  status?: { conditions?: { type: string; status: string }[] };
}

function scaledObjectStatus(r: ScaledObject): string {
  const ready = r.status?.conditions?.find((c) => c.type === "Ready");
  return ready?.status === "True" ? "Active" : "Idle";
}

const columns: Column<ScaledObject>[] = [
  { key: "metadata.name",               label: "Name" },
  { key: "metadata.namespace",          label: "Namespace" },
  { key: "spec.scaleTargetRef.name",    label: "Target",   render: (r) => `${r.spec?.scaleTargetRef?.kind ?? "Deployment"}/${r.spec?.scaleTargetRef?.name ?? "-"}` },
  { key: "spec.minReplicaCount",        label: "Min",      render: (r) => String(r.spec?.minReplicaCount ?? 0) },
  { key: "spec.maxReplicaCount",        label: "Max",      render: (r) => String(r.spec?.maxReplicaCount ?? "-") },
  { key: "spec.triggers",               label: "Triggers", render: (r) => (r.spec?.triggers ?? []).map((t) => t.type).join(", ") || "-", sortable: false },
  { key: "status",                      label: "Status",   render: (r) => <StatusBadge status={scaledObjectStatus(r)} />, sortable: false },
];

export function ScaledObjectList() {
  const [items, setItems] = useState<ScaledObject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: ScaledObject[] }>(`/api/plugins/keda/scaledobjects?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Scaled Objects</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter scaled objects..." />
    </div>
  );
}
