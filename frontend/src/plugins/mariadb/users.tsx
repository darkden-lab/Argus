"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface MariaDBUser {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    mariaDbRef?: { name?: string };
    username?: string;
    database?: string;
    maxUserConnections?: number;
    host?: string;
  };
  status?: { conditions?: { type: string; status: string }[] };
}

function userStatus(r: MariaDBUser): string {
  const ready = r.status?.conditions?.find((c) => c.type === "Ready");
  return ready?.status === "True" ? "Ready" : "Not Ready";
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

const columns: Column<MariaDBUser>[] = [
  { key: "metadata.name",        label: "Name" },
  { key: "metadata.namespace",   label: "Namespace" },
  { key: "spec.username",        label: "Username",  render: (r) => r.spec?.username ?? r.metadata.name },
  { key: "spec.database",        label: "Database",  render: (r) => r.spec?.database ?? "-" },
  { key: "spec.mariaDbRef.name", label: "Instance",  render: (r) => r.spec?.mariaDbRef?.name ?? "-" },
  { key: "spec.host",            label: "Host",      render: (r) => r.spec?.host ?? "%" },
  { key: "metadata.creationTimestamp", label: "Age",  render: (r) => age(r.metadata.creationTimestamp) },
  { key: "status",               label: "Status",    render: (r) => <StatusBadge status={userStatus(r)} />, sortable: false },
];

export function MariadbUserList() {
  const [items, setItems] = useState<MariaDBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: MariaDBUser[] }>(`/api/plugins/mariadb/users?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter users..." />
    </div>
  );
}
