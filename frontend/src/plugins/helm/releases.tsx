"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";

interface HelmRelease {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  spec?: { chart?: { spec?: { chart?: string; version?: string; sourceRef?: { name?: string } } }; interval?: string };
  status?: {
    conditions?: { type: string; status: string; message?: string }[];
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
    observedGeneration?: number;
  };
}

const columns: Column<HelmRelease>[] = [
  { key: "metadata.name",      label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "spec.chart.spec.chart",
    label: "Chart",
    render: (r) => r.spec?.chart?.spec?.chart ?? "-",
  },
  {
    key: "spec.chart.spec.version",
    label: "Version",
    render: (r) => r.spec?.chart?.spec?.version ?? "-",
  },
  {
    key: "status.lastAppliedRevision",
    label: "Revision",
    render: (r) => r.status?.lastAppliedRevision ?? "-",
  },
  {
    key: "spec.interval",
    label: "Interval",
    render: (r) => r.spec?.interval ?? "-",
  },
  {
    key: "status.conditions",
    label: "Status",
    render: (r) => {
      const ready = r.status?.conditions?.find((c) => c.type === "Ready");
      return <StatusBadge status={ready?.status === "True" ? "Ready" : "Not Ready"} />;
    },
  },
];

export function HelmReleaseList() {
  const [items, setItems] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: HelmRelease[] }>(`/api/plugins/helm/helmreleases?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Helm Releases</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter releases..." />
    </div>
  );
}
