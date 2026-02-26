"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FileKey2,
  Bot,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { RBACGate } from "@/components/auth/rbac-gate";
import { cn } from "@/lib/utils";
import { ClusterCard } from "@/components/clusters/cluster-card";
import { AddClusterWizard } from "@/components/clusters/add-cluster-wizard";

type ConnectionType = "kubeconfig" | "agent";

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
  connection_type?: ConnectionType;
  agent_status?: string;
  labels: Record<string, string>;
  last_health: string;
  node_count?: number;
}

function ConnectionTypeIcon({ type }: { type?: ConnectionType }) {
  if (type === "agent") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Bot className="h-4 w-4 text-blue-500" />
          </TooltipTrigger>
          <TooltipContent>Connected via Agent</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <FileKey2 className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>Connected via Kubeconfig</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const columns: Column<Cluster>[] = [
  {
    key: "name",
    label: "Name",
    render: (row) => (
      <div className="flex items-center gap-2">
        <ConnectionTypeIcon type={row.connection_type} />
        <span>{row.name}</span>
      </div>
    ),
  },
  { key: "api_server_url", label: "API Server" },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <div className="flex items-center gap-2">
        <StatusBadge status={row.status} />
        {row.connection_type === "agent" && row.agent_status && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              row.agent_status === "connected" && "border-green-500 text-green-600",
              row.agent_status === "reconnecting" && "border-yellow-500 text-yellow-600",
              row.agent_status === "offline" && "border-destructive text-destructive"
            )}
          >
            {row.agent_status}
          </Badge>
        )}
      </div>
    ),
  },
  { key: "last_health", label: "Last Health Check" },
];

type ViewMode = "grid" | "table";

export default function ClustersPage() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("argus:clusters-view") as ViewMode) || "grid";
    }
    return "grid";
  });

  useEffect(() => {
    api
      .get<Cluster[]>("/api/clusters")
      .then(setClusters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("argus:clusters-view", mode);
    }
  }

  const filteredClusters = useMemo(() => {
    if (!gridSearch) return clusters;
    const q = gridSearch.toLowerCase();
    return clusters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.api_server_url.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [clusters, gridSearch]);

  function handleClusterAdded(cluster: Cluster) {
    setClusters((prev) => [...prev, cluster]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clusters</h1>
          <p className="text-muted-foreground">
            Manage your Kubernetes clusters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleViewChange("grid")}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Grid view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "table" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleViewChange("table")}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Table view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <RBACGate resource="clusters" action="write">
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Cluster
            </Button>
          </RBACGate>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === "grid" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading clusters...
            </div>
          ) : clusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <LayoutGrid className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-sm font-medium">No clusters</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first Kubernetes cluster to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter clusters..."
                  value={gridSearch}
                  onChange={(e) => setGridSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredClusters.map((cluster) => (
                  <ClusterCard key={cluster.id} cluster={cluster} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredClusters.length} of {clusters.length} cluster(s)
              </p>
            </div>
          )}
        </>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <ResourceTable
          data={clusters}
          columns={columns}
          loading={loading}
          onRowClick={(row) => router.push(`/clusters/${row.id}`)}
          searchPlaceholder="Filter clusters..."
        />
      )}

      {/* Add Cluster Wizard */}
      <AddClusterWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onClusterAdded={handleClusterAdded}
      />
    </div>
  );
}
