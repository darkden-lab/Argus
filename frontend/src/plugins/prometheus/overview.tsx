"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PrometheusStats {
  serviceMonitors: number;
  rules: number;
}

export function PrometheusOverview() {
  const [stats, setStats] = useState<PrometheusStats>({ serviceMonitors: 0, rules: 0 });

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(
        `/api/plugins/prometheus/servicemonitors?clusterID=${clusterID}`
      ),
      api.get<{ items: unknown[] }>(
        `/api/plugins/prometheus/prometheusrules?clusterID=${clusterID}`
      ),
    ]).then(([sm, pr]) => {
      setStats({
        serviceMonitors:
          sm.status === "fulfilled" ? (sm.value.items?.length ?? 0) : 0,
        rules: pr.status === "fulfilled" ? (pr.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prometheus</h1>
        <p className="text-muted-foreground">
          Manage Prometheus monitoring resources across your cluster.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Service Monitors</p>
          <p className="mt-1 text-2xl font-bold">{stats.serviceMonitors}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Prometheus Rules</p>
          <p className="mt-1 text-2xl font-bold">{stats.rules}</p>
        </div>
      </div>
    </div>
  );
}

export function PrometheusStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Prometheus
      </p>
      <p className="mt-1 text-sm font-medium">Monitoring Active</p>
    </div>
  );
}
