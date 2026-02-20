"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface CalicoStats {
  networkPolicies: number;
  ipPools: number;
}

export function CalicoOverview() {
  const [stats, setStats] = useState<CalicoStats>({ networkPolicies: 0, ipPools: 0 });

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(
        `/api/plugins/calico/networkpolicies?clusterID=${clusterID}`
      ),
      api.get<{ items: unknown[] }>(
        `/api/plugins/calico/ippools?clusterID=${clusterID}`
      ),
    ]).then(([np, ip]) => {
      setStats({
        networkPolicies:
          np.status === "fulfilled" ? (np.value.items?.length ?? 0) : 0,
        ipPools: ip.status === "fulfilled" ? (ip.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calico</h1>
        <p className="text-muted-foreground">
          Manage Calico network policies and IP pools.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Network Policies</p>
          <p className="mt-1 text-2xl font-bold">{stats.networkPolicies}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">IP Pools</p>
          <p className="mt-1 text-2xl font-bold">{stats.ipPools}</p>
        </div>
      </div>
    </div>
  );
}

export function CalicoStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Calico
      </p>
      <p className="mt-1 text-sm font-medium">CNI Active</p>
    </div>
  );
}
