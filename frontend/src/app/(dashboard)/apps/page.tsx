"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApps } from "@/hooks/use-apps";
import { useClusterStore } from "@/stores/cluster";
import { AppCard } from "@/components/apps/app-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Rocket, Search } from "lucide-react";

export default function AppsPage() {
  const router = useRouter();
  const clusters = useClusterStore((s) => s.clusters);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId) ?? "";
  const clustersLoading = useClusterStore((s) => s.loading);
  const fetchClusters = useClusterStore((s) => s.fetchClusters);

  useEffect(() => {
    if (clusters.length === 0) fetchClusters();
  }, [clusters.length, fetchClusters]);
  const { apps, loading, error } = useApps(selectedClusterId || null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.namespace.toLowerCase().includes(q) ||
        app.image.toLowerCase().includes(q)
    );
  }, [apps, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apps</h1>
          <p className="text-muted-foreground">
            Manage your deployed applications across clusters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => router.push("/apps/deploy")}>
            <Plus className="mr-1.5 h-4 w-4" />
            Deploy New App
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter apps by name, namespace, or image..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {loading || clustersLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading apps...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>Failed to load apps: {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Rocket className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">No apps found</p>
          <p className="text-sm">
            {search
              ? "Try adjusting your search filter."
              : "Deploy your first application to get started."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {apps.length} app(s)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onClick={() =>
                  router.push(
                    `/apps/${encodeURIComponent(app.name)}?cluster=${selectedClusterId}&namespace=${encodeURIComponent(app.namespace)}`
                  )
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
