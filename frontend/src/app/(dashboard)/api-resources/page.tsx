"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowLeft, Loader2, X, FileCode2 } from "lucide-react";

interface APIResource {
  kind: string;
  group: string;
  version: string;
  resource: string;
  namespaced: boolean;
  verbs: string[];
}

interface ResourceInstance {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    uid?: string;
  };
  [key: string]: unknown;
}

interface ResourceListResponse {
  items?: ResourceInstance[];
}

export default function APIResourcesPage() {
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const [resources, setResources] = useState<APIResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "namespaced" | "cluster">("all");

  // Instance list state
  const [selectedResource, setSelectedResource] = useState<APIResource | null>(null);
  const [instances, setInstances] = useState<ResourceInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  // Detail view state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailYaml, setDetailYaml] = useState("");
  const [detailName, setDetailName] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedClusterId) return;
    setLoading(true);
    setSelectedResource(null);
    api
      .get<APIResource[]>(`/api/clusters/${selectedClusterId}/api-resources`)
      .then(setResources)
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, [selectedClusterId]);

  const filtered = useMemo(() => {
    let result = resources;
    if (scopeFilter === "namespaced") result = result.filter((r) => r.namespaced);
    if (scopeFilter === "cluster") result = result.filter((r) => !r.namespaced);
    if (!search) return result;
    const q = search.toLowerCase();
    return result.filter(
      (r) =>
        r.kind.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q) ||
        r.version.toLowerCase().includes(q) ||
        r.resource.toLowerCase().includes(q)
    );
  }, [resources, search, scopeFilter]);

  const handleRowClick = useCallback(
    (res: APIResource) => {
      if (!selectedClusterId) return;
      setSelectedResource(res);
      setInstancesLoading(true);
      setInstances([]);

      const group = res.group || "_";
      api
        .get<ResourceListResponse>(
          `/api/clusters/${selectedClusterId}/resources/${group}/${res.version}/${res.resource}`
        )
        .then((data) => setInstances(data.items ?? []))
        .catch(() => setInstances([]))
        .finally(() => setInstancesLoading(false));
    },
    [selectedClusterId]
  );

  const handleInstanceClick = useCallback(
    (instance: ResourceInstance, res: APIResource) => {
      if (!selectedClusterId) return;
      setDetailLoading(true);
      setDetailName(instance.metadata.name);
      setDetailOpen(true);

      const group = res.group || "_";
      const ns = instance.metadata.namespace
        ? `?namespace=${instance.metadata.namespace}`
        : "";
      api
        .get<Record<string, unknown>>(
          `/api/clusters/${selectedClusterId}/resources/${group}/${res.version}/${res.resource}/${instance.metadata.name}${ns}`
        )
        .then((data) => setDetailYaml(JSON.stringify(data, null, 2)))
        .catch(() => setDetailYaml("Error loading resource detail"))
        .finally(() => setDetailLoading(false));
    },
    [selectedClusterId]
  );

  if (!selectedClusterId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileCode2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-sm font-medium">No cluster selected</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a cluster from the sidebar to explore its API resources.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Resources</h1>
        <p className="text-muted-foreground">
          Explore Kubernetes API resources available in the selected cluster.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by kind, group, version..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={scopeFilter}
          onValueChange={(v) => setScopeFilter(v as "all" | "namespaced" | "cluster")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="namespaced">Namespaced</SelectItem>
            <SelectItem value="cluster">Cluster-wide</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} resource(s)
        </span>
      </div>

      <div className="flex gap-6">
        {/* Resource table */}
        <div className={selectedResource ? "w-1/2" : "w-full"}>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading API resources...
            </div>
          ) : (
            <div className="rounded-md border max-h-[calc(100vh-280px)] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Verbs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No resources found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((res) => (
                      <TableRow
                        key={`${res.group}/${res.version}/${res.resource}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(res)}
                        data-active={selectedResource?.resource === res.resource && selectedResource?.group === res.group}
                      >
                        <TableCell className="font-medium">{res.kind}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {res.group || "core"}
                        </TableCell>
                        <TableCell>{res.version}</TableCell>
                        <TableCell>
                          <Badge variant={res.namespaced ? "default" : "secondary"}>
                            {res.namespaced ? "Namespaced" : "Cluster"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {res.verbs.map((v) => (
                              <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Instance list panel */}
        {selectedResource && (
          <div className="w-1/2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedResource(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-sm font-semibold">
                  {selectedResource.kind} instances
                </h2>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedResource(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {instancesLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading instances...
              </div>
            ) : instances.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No instances found.
              </div>
            ) : (
              <div className="rounded-md border max-h-[calc(100vh-320px)] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      {selectedResource.namespaced && <TableHead>Namespace</TableHead>}
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instances.map((inst) => (
                      <TableRow
                        key={inst.metadata.uid || inst.metadata.name}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleInstanceClick(inst, selectedResource)}
                      >
                        <TableCell className="font-medium">{inst.metadata.name}</TableCell>
                        {selectedResource.namespaced && (
                          <TableCell className="text-muted-foreground">
                            {inst.metadata.namespace || "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground text-xs">
                          {inst.metadata.creationTimestamp
                            ? new Date(inst.metadata.creationTimestamp).toLocaleString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail dialog with raw JSON */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{detailName}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <pre className="flex-1 overflow-auto rounded-md bg-muted p-4 text-xs font-mono whitespace-pre">
              {detailYaml}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
