"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, type Column } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

interface TriggerAuthentication {
  metadata: { name: string; namespace?: string; creationTimestamp?: string };
  spec?: {
    secretTargetRef?: { parameter: string; name: string; key: string }[];
    env?: { parameter: string; name: string; containerName?: string }[];
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

const namespacedColumns: Column<TriggerAuthentication>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.secretTargetRef", label: "Secret Refs", render: (r) => String(r.spec?.secretTargetRef?.length ?? 0), sortable: false },
  { key: "spec.env",             label: "Env Refs",    render: (r) => String(r.spec?.env?.length ?? 0), sortable: false },
  { key: "metadata.creationTimestamp", label: "Age",   render: (r) => age(r.metadata.creationTimestamp) },
];

const clusterColumns: Column<TriggerAuthentication>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "spec.secretTargetRef", label: "Secret Refs", render: (r) => String(r.spec?.secretTargetRef?.length ?? 0), sortable: false },
  { key: "spec.env",             label: "Env Refs",    render: (r) => String(r.spec?.env?.length ?? 0), sortable: false },
  { key: "metadata.creationTimestamp", label: "Age",   render: (r) => age(r.metadata.creationTimestamp) },
];

export function TriggerAuthenticationList() {
  const [nsItems, setNsItems] = useState<TriggerAuthentication[]>([]);
  const [clusterItems, setClusterItems] = useState<TriggerAuthentication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"namespaced" | "cluster">("namespaced");
  const namespace = useClusterStore((s) => s.selectedNamespace);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    const nsParam = namespace ? `&namespace=${namespace}` : "";

    Promise.allSettled([
      api.get<{ items: TriggerAuthentication[] }>(`/api/plugins/keda/triggerauthentications?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: TriggerAuthentication[] }>(`/api/plugins/keda/clustertriggerauthentications?clusterID=${clusterID}`),
    ]).then(([ns, cluster]) => {
      setNsItems(ns.status === "fulfilled" ? (ns.value.items ?? []) : []);
      setClusterItems(cluster.status === "fulfilled" ? (cluster.value.items ?? []) : []);
    }).finally(() => setLoading(false));
  }, [namespace]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Trigger Authentications</h1>

      <div className="flex gap-1 border-b border-border">
        {(["namespaced", "cluster"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "namespaced" ? "Namespaced" : "Cluster-scoped"}
          </button>
        ))}
      </div>

      {activeTab === "namespaced" && (
        <ResourceTable data={nsItems} columns={namespacedColumns} loading={loading} searchPlaceholder="Filter trigger authentications..." />
      )}

      {activeTab === "cluster" && (
        <ResourceTable data={clusterItems} columns={clusterColumns} loading={loading} searchPlaceholder="Filter cluster trigger authentications..." />
      )}
    </div>
  );
}
