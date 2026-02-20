"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, type Column } from "@/components/resources/resource-table";

interface ScaledJob {
  metadata: { name: string; namespace: string };
  spec?: {
    jobTargetRef?: { template?: { spec?: { containers?: { image?: string }[] } } };
    minReplicaCount?: number;
    maxReplicaCount?: number;
    triggers?: { type: string }[];
  };
}

const columns: Column<ScaledJob>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.minReplicaCount", label: "Min", render: (r) => String(r.spec?.minReplicaCount ?? 0) },
  { key: "spec.maxReplicaCount", label: "Max", render: (r) => String(r.spec?.maxReplicaCount ?? "-") },
  { key: "spec.triggers",        label: "Triggers", render: (r) => (r.spec?.triggers ?? []).map((t) => t.type).join(", ") || "-", sortable: false },
];

export function ScaledJobList() {
  const [items, setItems] = useState<ScaledJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: ScaledJob[] }>(`/api/plugins/keda/scaledjobs?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Scaled Jobs</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter scaled jobs..." />
    </div>
  );
}
