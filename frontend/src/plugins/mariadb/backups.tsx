"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface MariaBackup {
  metadata: { name: string; namespace: string };
  spec?: { mariaDbRef?: { name?: string } };
  status?: { conditions?: { type: string; status: string }[] };
}

function backupStatus(r: MariaBackup): string {
  const complete = r.status?.conditions?.find((c) => c.type === "Complete");
  return complete?.status === "True" ? "Complete" : "Running";
}

const columns: Column<MariaBackup>[] = [
  { key: "metadata.name",        label: "Name" },
  { key: "metadata.namespace",   label: "Namespace" },
  { key: "spec.mariaDbRef.name", label: "Instance", render: (r) => r.spec?.mariaDbRef?.name ?? "-" },
  { key: "status",               label: "Status",   render: (r) => <StatusBadge status={backupStatus(r)} />, sortable: false },
];

export function MariadbBackupList() {
  const [items, setItems] = useState<MariaBackup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: MariaBackup[] }>(`/api/plugins/mariadb/backups?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Backups</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter backups..." />
    </div>
  );
}
