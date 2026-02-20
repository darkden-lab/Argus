"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface MariaDBInstance {
  metadata: { name: string; namespace: string };
  spec?: { image?: string; replicas?: number; storage?: { size?: string } };
  status?: { conditions?: { type: string; status: string }[] };
}

function instanceStatus(r: MariaDBInstance): string {
  const ready = r.status?.conditions?.find((c) => c.type === "Ready");
  return ready?.status === "True" ? "Ready" : "Not Ready";
}

const columns: Column<MariaDBInstance>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.image",         label: "Image",    render: (r) => r.spec?.image?.split(":")[1] ?? r.spec?.image ?? "-" },
  { key: "spec.replicas",      label: "Replicas", render: (r) => String(r.spec?.replicas ?? 1) },
  { key: "spec.storage.size",  label: "Storage",  render: (r) => r.spec?.storage?.size ?? "-" },
  { key: "status",             label: "Status",   render: (r) => <StatusBadge status={instanceStatus(r)} />, sortable: false },
];

export function MariadbInstanceList() {
  const [items, setItems] = useState<MariaDBInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: MariaDBInstance[] }>(`/api/plugins/mariadb/mariadbs?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">MariaDB Instances</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter instances..." />
    </div>
  );
}
