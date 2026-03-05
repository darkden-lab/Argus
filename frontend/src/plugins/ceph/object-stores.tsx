"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface CephObjectStore {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    gateway?: { instances?: number; port?: number };
    metadataPool?: { replicated?: { size?: number } };
    dataPool?: { replicated?: { size?: number }; erasureCoded?: { dataChunks?: number; codingChunks?: number } };
  };
  status?: { phase?: string };
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

function dataPoolInfo(r: CephObjectStore): string {
  if (r.spec?.dataPool?.erasureCoded) {
    const ec = r.spec.dataPool.erasureCoded;
    return `EC ${ec.dataChunks ?? 0}+${ec.codingChunks ?? 0}`;
  }
  if (r.spec?.dataPool?.replicated?.size) return `${r.spec.dataPool.replicated.size}x replicated`;
  return "-";
}

const columns: Column<CephObjectStore>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.gateway.instances", label: "Gateway Instances", render: (r) => String(r.spec?.gateway?.instances ?? "-") },
  { key: "spec.gateway.port",     label: "Port",              render: (r) => String(r.spec?.gateway?.port ?? "-") },
  { key: "spec.dataPool",         label: "Data Pool",         render: dataPoolInfo, sortable: false },
  { key: "spec.metadataPool.replicated.size", label: "Metadata Pool", render: (r) => r.spec?.metadataPool?.replicated?.size ? `${r.spec.metadataPool.replicated.size}x replicated` : "-" },
  { key: "metadata.creationTimestamp", label: "Age",           render: (r) => age(r.metadata.creationTimestamp) },
  { key: "status.phase",       label: "Status",               render: (r) => <StatusBadge status={r.status?.phase ?? "Unknown"} /> },
];

export function CephObjectStoreList() {
  const [items, setItems] = useState<CephObjectStore[]>([]);
  const [loading, setLoading] = useState(true);
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";
    api.get<{ items: CephObjectStore[] }>(`/api/plugins/ceph/objectstores?clusterID=${clusterID}${nsParam}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [namespace]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Object Stores</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter object stores..." />
    </div>
  );
}
