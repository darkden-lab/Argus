"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDatabases } from "@/hooks/use-databases";
import { useClusterStore } from "@/stores/cluster";
import { ClusterSelector } from "@/components/layout/cluster-selector";
import { DatabaseCard } from "@/components/databases/database-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database as DatabaseIcon,
  Loader2,
  Plus,
  Search,
} from "lucide-react";

const ENGINE_FILTERS = [
  { value: "all", label: "All" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "mysql", label: "MySQL" },
  { value: "redis", label: "Redis" },
  { value: "mongodb", label: "MongoDB" },
  { value: "unknown", label: "Other" },
];

export default function DatabasesPage() {
  const router = useRouter();
  const clusters = useClusterStore((s) => s.clusters);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId) ?? "";
  const setSelectedClusterId = useClusterStore((s) => s.setSelectedClusterId);
  const clustersLoading = useClusterStore((s) => s.loading);
  const fetchClusters = useClusterStore((s) => s.fetchClusters);

  useEffect(() => {
    if (clusters.length === 0) fetchClusters();
  }, [clusters.length, fetchClusters]);
  const { databases, loading, error } = useDatabases(
    selectedClusterId || null
  );
  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = databases;

    if (engineFilter !== "all") {
      result = result.filter((db) => db.engine === engineFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (db) =>
          db.name.toLowerCase().includes(q) ||
          db.namespace.toLowerCase().includes(q) ||
          db.engine.toLowerCase().includes(q)
      );
    }

    return result;
  }, [databases, search, engineFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Databases</h1>
          <p className="text-muted-foreground">
            Database resources, operators, and cluster management.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ClusterSelector
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClusterChange={setSelectedClusterId}
            loading={clustersLoading}
          />
          <Button size="sm" disabled>
            <Plus className="mr-1.5 h-4 w-4" />
            Create Database
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter databases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {ENGINE_FILTERS.map((filter) => (
            <Badge
              key={filter.value}
              variant={engineFilter === filter.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setEngineFilter(filter.value)}
            >
              {filter.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading || clustersLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading databases...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>Failed to load databases: {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <DatabaseIcon className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">No databases found</p>
          <p className="text-sm">
            {search || engineFilter !== "all"
              ? "Try adjusting your filters."
              : "No database StatefulSets detected in this cluster."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {databases.length} database(s)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((db) => (
              <DatabaseCard
                key={db.id}
                database={db}
                onClick={() =>
                  router.push(
                    `/databases/${encodeURIComponent(db.name)}?cluster=${selectedClusterId}&namespace=${encodeURIComponent(db.namespace)}`
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
