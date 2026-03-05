"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
    </div>
  );
}

export function MariadbOverview() {
  const [counts, setCounts] = useState({ instances: 0, databases: 0, backups: 0, users: 0, connections: 0 });
  const namespace = useClusterStore((s) => s.selectedNamespace);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  useEffect(() => {
    const clusterID = selectedClusterId ?? "";
    if (!clusterID) return;
    const nsParam = namespace ? `&namespace=${namespace}` : "";

    Promise.allSettled([
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/instances?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/databases?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/backups?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/users?clusterID=${clusterID}${nsParam}`),
      api.get<{ items: unknown[] }>(`/api/plugins/mariadb/connections?clusterID=${clusterID}${nsParam}`),
    ]).then(([inst, db, bk, usr, conn]) => {
      setCounts({
        instances:   inst.status === "fulfilled" ? (inst.value.items?.length ?? 0) : 0,
        databases:   db.status === "fulfilled"   ? (db.value.items?.length ?? 0) : 0,
        backups:     bk.status === "fulfilled"   ? (bk.value.items?.length ?? 0) : 0,
        users:       usr.status === "fulfilled"  ? (usr.value.items?.length ?? 0) : 0,
        connections: conn.status === "fulfilled" ? (conn.value.items?.length ?? 0) : 0,
      });
    });
  }, [namespace, selectedClusterId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MariaDB Operator</h1>
        <p className="text-muted-foreground">Manage MariaDB instances, databases, users, and backups.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <CountCard label="Instances"   count={counts.instances} />
        <CountCard label="Databases"   count={counts.databases} />
        <CountCard label="Backups"     count={counts.backups} />
        <CountCard label="Users"       count={counts.users} />
        <CountCard label="Connections" count={counts.connections} />
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
