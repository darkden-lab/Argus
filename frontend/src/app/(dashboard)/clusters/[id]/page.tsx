"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { useK8sWildcard } from "@/hooks/use-k8s-websocket";
import type { WatchEvent } from "@/lib/ws";

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
  const [activeTab, setActiveTab] = useState("overview");
  const [resources, setResources] = useState<Record<string, K8sResource[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nodeCount, setNodeCount] = useState(0);

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
              Cluster: {clusterId}
            </h1>
            <p className="text-muted-foreground">
              {nodeCount} nodes, {namespaces.length} namespaces
            </p>
          </div>
        </div>
        <LiveIndicator isConnected={isConnected} lastUpdated={lastUpdated} />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {resourceTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

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
        </TabsContent>

        {resourceTabs
          .filter((tab) => tab.id !== "overview")
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
                        `/clusters/${clusterId}/${res.type}/${row.metadata.name}`
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
