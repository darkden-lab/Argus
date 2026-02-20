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

export function MariadbOverview() {
  const [counts, setCounts] = useState({ instances: 0, databases: 0, backups: 0 });

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/mariadbs?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/databases?clusterID=${clusterID}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/backups?clusterID=${clusterID}`),
    ]).then(([inst, db, bk]) => {
      setCounts({
        instances: inst.status === "fulfilled" ? (inst.value.items?.length ?? 0) : 0,
        databases: db.status === "fulfilled"   ? (db.value.items?.length ?? 0) : 0,
        backups:   bk.status === "fulfilled"   ? (bk.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MariaDB Operator</h1>
        <p className="text-muted-foreground">Manage MariaDB instances, databases, and backups.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CountCard label="Instances"  count={counts.instances} />
        <CountCard label="Databases"  count={counts.databases} />
        <CountCard label="Backups"    count={counts.backups} />
      </div>
    </div>
  );
}

export function MariadbStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">MariaDB</p>
      <p className="mt-1 text-sm font-medium">MariaDB Operator Active</p>
    </div>
  );
}
