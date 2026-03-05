"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CnpgScheduledBackup {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    cluster?: { name?: string };
    schedule?: string;
    suspend?: boolean;
    backupOwnerReference?: string;
  };
  status?: {
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
  };
}

function age(ts?: string): string {
  if (!ts) return "-";
  const ms = Date.now() - new Date(ts).getTime();
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h > 0) return `${h}h`;
  return `${Math.floor(ms / 60000)}m`;
}

const columns: Column<CnpgScheduledBackup>[] = [
  { key: "metadata.name",            label: "Name" },
  { key: "metadata.namespace",       label: "Namespace" },
  { key: "spec.cluster.name",        label: "Cluster",    render: (r) => r.spec?.cluster?.name ?? "-" },
  { key: "spec.schedule",            label: "Schedule",   render: (r) => r.spec?.schedule ?? "-" },
  { key: "spec.suspend",             label: "Suspended",  render: (r) => <StatusBadge status={r.spec?.suspend ? "Suspended" : "Active"} />, sortable: false },
  { key: "status.lastScheduleTime",  label: "Last Scheduled", render: (r) => r.status?.lastScheduleTime ? new Date(r.status.lastScheduleTime).toLocaleString() : "-" },
  { key: "metadata.creationTimestamp", label: "Age",       render: (r) => age(r.metadata.creationTimestamp) },
];

export function CnpgScheduledBackupList() {
  const [items, setItems] = useState<CnpgScheduledBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: CnpgScheduledBackup[] }>(`/api/plugins/cnpg/scheduledbackups?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Scheduled Backups</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter scheduled backups..." />
    </div>
  );
}
