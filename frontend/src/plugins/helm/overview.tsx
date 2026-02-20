"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/resources/resource-table";

interface HelmRelease {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  spec?: { chart?: { spec?: { chart?: string; version?: string } }; interval?: string };
  status?: { conditions?: { type: string; status: string; message?: string }[]; lastAppliedRevision?: string };
}

interface NamespaceSummary { namespace: string; count: number }

export function HelmOverview() {
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: HelmRelease[] }>(`/api/plugins/helm/helmreleases?clusterID=${clusterID}`)
      .then((d) => setReleases(d.items ?? []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  const byNamespace = releases.reduce<Record<string, number>>((acc, r) => {
    const ns = r.metadata.namespace;
    acc[ns] = (acc[ns] ?? 0) + 1;
    return acc;
  }, {});

  const namespaceSummary: NamespaceSummary[] = Object.entries(byNamespace)
    .map(([namespace, count]) => ({ namespace, count }))
    .sort((a, b) => b.count - a.count);

  const recentlyUpdated = [...releases]
    .filter((r) => r.status?.lastAppliedRevision)
    .slice(0, 5);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Helm Releases</h1>
        <p className="text-muted-foreground">Manage Flux HelmRelease resources across namespaces.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Releases</p>
          <p className="mt-1 text-2xl font-bold">{releases.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Namespaces</p>
          <p className="mt-1 text-2xl font-bold">{namespaceSummary.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">With Revisions</p>
          <p className="mt-1 text-2xl font-bold">
            {releases.filter((r) => r.status?.lastAppliedRevision).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {namespaceSummary.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Releases by Namespace</h2>
            <div className="space-y-2">
              {namespaceSummary.map((ns) => (
                <div key={ns.namespace} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-muted-foreground">{ns.namespace}</span>
                  <span className="font-medium">{ns.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentlyUpdated.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Recently Updated</h2>
            <div className="space-y-2">
              {recentlyUpdated.map((r) => {
                const ready = r.status?.conditions?.find((c) => c.type === "Ready");
                return (
                  <div key={`${r.metadata.namespace}/${r.metadata.name}`} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-muted-foreground truncate max-w-[160px]">{r.metadata.name}</span>
                    <StatusBadge status={ready?.status === "True" ? "Ready" : "Not Ready"} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function HelmStatus() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Helm</p>
      <p className="mt-1 text-sm font-medium">Helm Releases Active</p>
    </div>
  );
}
