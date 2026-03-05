"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

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
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: MariaBackup[] }>(`/api/plugins/mariadb/backups?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Backups</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter backups..." />
    </div>
  );
}
