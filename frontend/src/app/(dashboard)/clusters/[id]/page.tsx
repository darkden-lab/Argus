"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, MessageSquare, Terminal, Copy, Check, Rocket, Database, Timer } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { StatusDot } from "@/components/ui/status-dot";
import { useAiChatStore } from "@/stores/ai-chat";
import { useClusterStore } from "@/stores/cluster";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { useK8sWildcard } from "@/hooks/use-k8s-websocket";
import { cn } from "@/lib/utils";
import type { WatchEvent } from "@/lib/ws";
import {
  compositeApps,
  compositeDatabases,
  compositeJobs,
  getStatusDot,
  formatAge,
  truncateImage,
  type App,
  type Database as DbType,
  type CompositeJob,
  type K8sDeployment,
  type K8sService,
  type K8sIngress,
  type K8sStatefulSet,
  type K8sPVC,
  type K8sCronJob,
  type K8sJob,
} from "@/lib/abstractions";

interface K8sResource {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    uid?: string;
  };
  status?: {
    phase?: string;
    conditions?: Array<{ type: string; status: string }>;
  };
  [key: string]: unknown;
}

interface ResourceListResponse {
  items: K8sResource[];
}

const resourceTabs = [
  {
    id: "overview",
    label: "Overview",
    resources: [],
  },
  {
    id: "apps",
    label: "Apps",
    icon: Rocket,
    resources: [
      { type: "deployments", gvr: "apps/v1/deployments", label: "Deployments" },
      { type: "services", gvr: "_/v1/services", label: "Services" },
      { type: "ingresses", gvr: "networking.k8s.io/v1/ingresses", label: "Ingresses" },
    ],
  },
  {
    id: "databases",
    label: "Databases",
    icon: Database,
    resources: [
      { type: "statefulsets", gvr: "apps/v1/statefulsets", label: "StatefulSets" },
      { type: "persistentvolumeclaims", gvr: "_/v1/persistentvolumeclaims", label: "PVCs" },
      { type: "services", gvr: "_/v1/services", label: "Services" },
    ],
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: Timer,
    resources: [
      { type: "cronjobs", gvr: "batch/v1/cronjobs", label: "CronJobs" },
      { type: "jobs", gvr: "batch/v1/jobs", label: "Jobs" },
    ],
  },
  {
    id: "workloads",
    label: "Workloads",
    resources: [
      { type: "pods", gvr: "_/v1/pods", label: "Pods" },
      { type: "deployments", gvr: "apps/v1/deployments", label: "Deployments" },
      { type: "statefulsets", gvr: "apps/v1/statefulsets", label: "StatefulSets" },
      { type: "daemonsets", gvr: "apps/v1/daemonsets", label: "DaemonSets" },
    ],
  },
  {
    id: "networking",
    label: "Networking",
    resources: [
      { type: "services", gvr: "_/v1/services", label: "Services" },
      { type: "ingresses", gvr: "networking.k8s.io/v1/ingresses", label: "Ingresses" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    resources: [
      { type: "persistentvolumeclaims", gvr: "_/v1/persistentvolumeclaims", label: "PVCs" },
      { type: "persistentvolumes", gvr: "_/v1/persistentvolumes", label: "PVs" },
    ],
  },
  {
    id: "config",
    label: "Config",
    resources: [
      { type: "configmaps", gvr: "_/v1/configmaps", label: "ConfigMaps" },
      { type: "secrets", gvr: "_/v1/secrets", label: "Secrets" },
    ],
  },
];

// Tabs grouped under "Resources (Advanced)" collapsible
const advancedTabIds = new Set(["workloads", "networking", "storage", "config"]);

function getAge(timestamp: string | undefined): string {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor((diff % 3600000) / 60000)}m`;
}

const resourceColumns: Column<K8sResource>[] = [
  { key: "metadata.name", label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "status.phase",
    label: "Status",
    render: (row) => {
      const phase = row.status?.phase ?? "Unknown";
      return <StatusBadge status={phase} />;
    },
  },
  {
    key: "metadata.creationTimestamp",
    label: "Age",
    render: (row) => getAge(row.metadata.creationTimestamp),
  },
];

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;
  const clusters = useClusterStore((s) => s.clusters);
  const clusterName = clusters.find((c) => c.id === clusterId)?.name ?? clusterId;
  const [activeTab, setActiveTab] = useState("overview");
  const [resources, setResources] = useState<Record<string, K8sResource[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const openChat = useAiChatStore((s) => s.open);
  const setPageContext = useAiChatStore((s) => s.setPageContext);

  // Computed abstractions
  const apps: App[] = compositeApps(
    (resources.deployments ?? []) as unknown as K8sDeployment[],
    (resources.services ?? []) as unknown as K8sService[],
    (resources.ingresses ?? []) as unknown as K8sIngress[]
  );

  const databases: DbType[] = compositeDatabases(
    (resources.statefulsets ?? []) as unknown as K8sStatefulSet[],
    (resources.persistentvolumeclaims ?? []) as unknown as K8sPVC[],
    (resources.services ?? []) as unknown as K8sService[]
  );

  const jobs: CompositeJob[] = compositeJobs(
    (resources.cronjobs ?? []) as unknown as K8sCronJob[],
    (resources.jobs ?? []) as unknown as K8sJob[]
  );

  const handleWsEvent = useCallback(
    (event: WatchEvent) => {
      if (event.cluster !== clusterId) return;

      const obj = event.object as K8sResource | undefined;
      if (!obj?.metadata) return;

      setResources((prev) => {
        const list = prev[event.resource] ?? [];
        if (event.type === "ADDED") {
          const exists = list.some(
            (r) => r.metadata.uid === obj.metadata.uid
          );
          if (exists) return prev;
          return { ...prev, [event.resource]: [...list, obj] };
        }
        if (event.type === "DELETED") {
          return {
            ...prev,
            [event.resource]: list.filter(
              (r) => r.metadata.uid !== obj.metadata.uid
            ),
          };
        }
        if (event.type === "MODIFIED") {
          return {
            ...prev,
            [event.resource]: list.map((r) =>
              r.metadata.uid === obj.metadata.uid ? obj : r
            ),
          };
        }
        return prev;
      });
    },
    [clusterId]
  );

  const { lastUpdated, isConnected } = useK8sWildcard({
    onEvent: handleWsEvent,
  });

  useEffect(() => {
    api
      .get<ResourceListResponse>(`/api/clusters/${clusterId}/namespaces`)
      .then((res) => setNamespaces(res.items.map((n) => n.metadata.name)))
      .catch(() => {});

    api
      .get<ResourceListResponse>(`/api/clusters/${clusterId}/nodes`)
      .then((res) => setNodeCount(res.items.length))
      .catch(() => {});
  }, [clusterId]);

  function loadResources(gvr: string, type: string) {
    if (resources[type] || loading[type]) return;
    setLoading((prev) => ({ ...prev, [type]: true }));
    api
      .get<ResourceListResponse>(
        `/api/clusters/${clusterId}/resources/${gvr}`
      )
      .then((res) => setResources((prev) => ({ ...prev, [type]: res.items })))
      .catch(() => setResources((prev) => ({ ...prev, [type]: [] })))
      .finally(() => setLoading((prev) => ({ ...prev, [type]: false })));
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    const section = resourceTabs.find((t) => t.id === tab);
    if (section) {
      for (const res of section.resources) {
        loadResources(res.gvr, res.type);
      }
    }
  }

  const handleDownloadKubeconfig = async () => {
    setIsDownloading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/proxy/kubeconfig?cluster_id=${clusterId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kubeconfig-${clusterId}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // api error handling will show toast
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAskAi = () => {
    setPageContext({ cluster: clusterId });
    openChat();
  };

  const cliSetupCommand = `argus login --server ${typeof window !== "undefined" ? window.location.origin : "https://dashboard.example.com"}`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(cliSetupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Separate primary tabs and advanced tabs
  const primaryTabs = resourceTabs.filter((t) => !advancedTabIds.has(t.id));
  const advancedTabs = resourceTabs.filter((t) => advancedTabIds.has(t.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/clusters")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Cluster: {clusterName}
            </h1>
            <p className="text-muted-foreground">
              {nodeCount} nodes, {namespaces.length} namespaces
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAskAi}>
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Ask AI
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadKubeconfig}
            disabled={isDownloading}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {isDownloading ? "Downloading..." : "Kubeconfig"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/terminal")}
          >
            <Terminal className="mr-1.5 h-3.5 w-3.5" />
            Terminal
          </Button>
          <LiveIndicator isConnected={isConnected} lastUpdated={lastUpdated} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center gap-2">
          <TabsList>
            {primaryTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.icon && <tab.icon className="mr-1.5 h-3.5 w-3.5" />}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Advanced tabs toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide" : "Show"} Resources (Advanced)
          </Button>
        </div>

        {/* Advanced tabs row */}
        {showAdvanced && (
          <TabsList className="mt-2">
            {advancedTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Nodes</p>
              <p className="text-2xl font-bold">{nodeCount}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Namespaces</p>
              <p className="text-2xl font-bold">{namespaces.length}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Pods</p>
              <p className="text-2xl font-bold">
                {resources.pods?.length ?? "-"}
              </p>
            </div>
          </div>
          <div className="rounded-md border p-4">
            <p className="mb-2 text-sm font-medium">Namespaces</p>
            <div className="flex flex-wrap gap-1.5">
              {namespaces.map((ns) => (
                <Badge key={ns} variant="outline">
                  {ns}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* CLI Setup */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">CLI Setup</p>
            <p className="text-xs text-muted-foreground">
              Use the argus CLI to interact with this cluster from your terminal.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono">
                {cliSetupCommand}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyCommand}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>After logging in, configure kubectl for this cluster:</p>
              <code className="block rounded-md bg-muted px-3 py-2 font-mono">
                argus use {clusterId}
              </code>
            </div>
          </div>
        </TabsContent>

        {/* Apps Tab */}
        <TabsContent value="apps" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            High-level view of applications composed from Deployments, Services, and Ingresses.
          </p>
          {(loading.deployments || loading.services || loading.ingresses) ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading apps...
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Rocket className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No apps found in this cluster.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="rounded-lg border p-4 space-y-2 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={getStatusDot(app.status)} size="sm" />
                      <span className="text-sm font-medium truncate">{app.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {app.namespace}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {truncateImage(app.image)}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Replicas: {app.replicas.ready}/{app.replicas.desired}
                    </span>
                    <span className="text-muted-foreground">
                      {app.serviceType !== "None" ? app.serviceType : "No svc"}
                    </span>
                  </div>
                  {app.hosts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {app.hosts.map((host) => (
                        <Badge key={host} variant="secondary" className="text-[10px]">
                          {app.hasTLS ? "https://" : ""}{host}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Age: {formatAge(app.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Databases Tab */}
        <TabsContent value="databases" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Detected database workloads composed from StatefulSets, PVCs, and Services.
          </p>
          {(loading.statefulsets || loading.persistentvolumeclaims) ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading databases...
            </div>
          ) : databases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No databases found in this cluster.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {databases.map((db) => (
                <div
                  key={db.id}
                  className="rounded-lg border p-4 space-y-2 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={getStatusDot(db.status)} size="sm" />
                      <span className="text-sm font-medium truncate">{db.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {db.namespace}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        db.engine === "postgresql" && "bg-blue-500/10 text-blue-600",
                        db.engine === "mariadb" && "bg-orange-500/10 text-orange-600",
                        db.engine === "mysql" && "bg-cyan-500/10 text-cyan-600",
                        db.engine === "redis" && "bg-red-500/10 text-red-600"
                      )}
                    >
                      {db.engine}
                    </Badge>
                    {db.isCNPG && (
                      <Badge variant="outline" className="text-[10px]">CNPG</Badge>
                    )}
                    {db.isMariaDB && (
                      <Badge variant="outline" className="text-[10px]">Operator</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Replicas: {db.replicas.ready}/{db.replicas.desired}
                    </span>
                    <span className="text-muted-foreground">
                      Storage: {db.storage}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Age: {formatAge(db.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            CronJobs and standalone Jobs running in this cluster.
          </p>
          {(loading.cronjobs || loading.jobs) ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Timer className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No jobs found in this cluster.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg border p-4 space-y-2 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={getStatusDot(job.status)} size="sm" />
                      <span className="text-sm font-medium truncate">{job.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {job.namespace}
                    </Badge>
                  </div>
                  {job.schedule && (
                    <p className="text-xs font-mono text-muted-foreground">
                      Schedule: {job.schedule}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {truncateImage(job.image)}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Completed: {job.completions.succeeded}/{job.completions.total}
                    </span>
                    {job.lastRun && (
                      <span className="text-muted-foreground">
                        Last: {formatAge(job.lastRun)} ago
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Age: {formatAge(job.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Advanced resource tabs */}
        {resourceTabs
          .filter((tab) => advancedTabIds.has(tab.id))
          .map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-6">
              {tab.resources.map((res) => (
                <div key={res.type}>
                  <h3 className="mb-2 text-lg font-semibold">{res.label}</h3>
                  <ResourceTable
                    data={resources[res.type] ?? []}
                    columns={resourceColumns}
                    loading={loading[res.type]}
                    onRowClick={(row) =>
                      router.push(
                        `/clusters/${clusterId}/${res.type}/${encodeURIComponent(row.metadata.name)}${row.metadata.namespace ? `?namespace=${encodeURIComponent(row.metadata.namespace)}` : ""}`
                      )
                    }
                  />
                </div>
              ))}
            </TabsContent>
          ))}
      </Tabs>
    </div>
  );
}
