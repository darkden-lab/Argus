"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ResourceCount {
  label: string;
  count: number;
}

function CountCard({ label, count }: ResourceCount) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
    </div>
  );
}

export function IstioOverview() {
  const [counts, setCounts] = useState({
    virtualservices: 0,
    gateways: 0,
    destinationrules: 0,
    serviceentries: 0,
  });

  useEffect(() => {
    const clusterID =
      typeof window !== "undefined"
        ? (localStorage.getItem("selected_cluster") ?? "")
        : "";
    if (!clusterID) return;

    Promise.allSettled([
      api.get<{ items: unknown[] }>(
        `/api/plugins/istio/virtualservices?clusterID=${clusterID}`
      ),
      api.get<{ items: unknown[] }>(
        `/api/plugins/istio/gateways?clusterID=${clusterID}`
      ),
      api.get<{ items: unknown[] }>(
        `/api/plugins/istio/destinationrules?clusterID=${clusterID}`
      ),
      api.get<{ items: unknown[] }>(
        `/api/plugins/istio/serviceentries?clusterID=${clusterID}`
      ),
    ]).then(([vs, gw, dr, se]) => {
      setCounts({
        virtualservices:
          vs.status === "fulfilled" ? (vs.value.items?.length ?? 0) : 0,
        gateways: gw.status === "fulfilled" ? (gw.value.items?.length ?? 0) : 0,
        destinationrules:
          dr.status === "fulfilled" ? (dr.value.items?.length ?? 0) : 0,
        serviceentries:
          se.status === "fulfilled" ? (se.value.items?.length ?? 0) : 0,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Istio Service Mesh</h1>
        <p className="text-muted-foreground">
          Manage Istio networking resources across your cluster.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountCard label="Virtual Services" count={counts.virtualservices} />
        <CountCard label="Gateways" count={counts.gateways} />
        <CountCard label="Destination Rules" count={counts.destinationrules} />
        <CountCard label="Service Entries" count={counts.serviceentries} />
      </div>
    </div>
  );
}

export function IstioMeshStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Istio
      </p>
      <p className="mt-1 text-sm font-medium">Service Mesh Active</p>
    </div>
  );
}
