"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
    </div>
  );
}

export function KedaOverview() {
  const [counts, setCounts] = useState({ scaledObjects: 0, scaledJobs: 0, triggerAuths: 0 });

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(`/api/plugins/keda/scaledobjects?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/keda/scaledjobs?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/keda/triggerauthentications?clusterID=${clusterID}`),
    ]).then(([so, sj, ta]) => {
      setCounts({
        scaledObjects: so.status === "fulfilled" ? (so.value.items?.length ?? 0) : 0,
        scaledJobs:    sj.status === "fulfilled" ? (sj.value.items?.length ?? 0) : 0,
        triggerAuths:  ta.status === "fulfilled" ? (ta.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KEDA Autoscaling</h1>
        <p className="text-muted-foreground">Manage event-driven autoscaling for your workloads.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CountCard label="Scaled Objects"          count={counts.scaledObjects} />
        <CountCard label="Scaled Jobs"             count={counts.scaledJobs} />
        <CountCard label="Trigger Authentications" count={counts.triggerAuths} />
      </div>
    </div>
  );
}

export function KedaScalerStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">KEDA</p>
      <p className="mt-1 text-sm font-medium">Event-Driven Autoscaling Active</p>
    </div>
  );
}
