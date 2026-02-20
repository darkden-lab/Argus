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

export function CnpgOverview() {
  const [counts, setCounts] = useState({ clusters: 0, backups: 0, poolers: 0 });

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(`/api/plugins/cnpg/clusters?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/cnpg/backups?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/cnpg/poolers?clusterID=${clusterID}`),
    ]).then(([cl, bk, pl]) => {
      setCounts({
        clusters: cl.status === "fulfilled" ? (cl.value.items?.length ?? 0) : 0,
        backups:  bk.status === "fulfilled" ? (bk.value.items?.length ?? 0) : 0,
        poolers:  pl.status === "fulfilled" ? (pl.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CloudNativePG</h1>
        <p className="text-muted-foreground">Manage PostgreSQL clusters and backups.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CountCard label="Clusters"  count={counts.clusters} />
        <CountCard label="Backups"   count={counts.backups} />
        <CountCard label="Poolers"   count={counts.poolers} />
      </div>
    </div>
  );
}

export function CnpgStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">CNPG</p>
      <p className="mt-1 text-sm font-medium">PostgreSQL Operator Active</p>
    </div>
  );
}
