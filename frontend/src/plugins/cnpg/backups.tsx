"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface CnpgBackup {
  metadata: { name: string; namespace: string };
  spec?: { cluster?: { name?: string } };
  status?: { phase?: string; startedAt?: string; stoppedAt?: string };
}

const columns: Column<CnpgBackup>[] = [
  { key: "metadata.name",            label: "Name" },
  { key: "metadata.namespace",       label: "Namespace" },
  { key: "spec.cluster.name",        label: "Cluster",   render: (r) => r.spec?.cluster?.name ?? "-" },
  { key: "status.phase",             label: "Status",    render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} /> },
  { key: "status.startedAt",         label: "Started",   render: (r) => r.status?.startedAt ? new Date(r.status.startedAt).toLocaleString() : "-" },
  { key: "status.stoppedAt",         label: "Completed", render: (r) => r.status?.stoppedAt ? new Date(r.status.stoppedAt).toLocaleString() : "-" },
];

export function CnpgBackupList() {
  const [items, setItems] = useState<CnpgBackup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: CnpgBackup[] }>(`/api/plugins/cnpg/backups?clusterID=${clusterID}`)
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

export function CnpgScheduledBackupList() {
  const [items, setItems] = useState<CnpgBackup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: CnpgBackup[] }>(`/api/plugins/cnpg/scheduledbackups?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Scheduled Backups</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter scheduled backups..." />
    </div>
  );
}
