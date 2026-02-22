"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { useK8sWebSocket } from "@/hooks/use-k8s-websocket";
import type { WatchEvent } from "@/lib/ws";

interface K8sResource {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
  };
  status?: {
    phase?: string;
  };
  [key: string]: unknown;
}

interface ResourceListResponse {
  items: K8sResource[];
}

const resourceTypeToGVR: Record<string, string> = {
  pods: "_/v1/pods",
  services: "_/v1/services",
  configmaps: "_/v1/configmaps",
  secrets: "_/v1/secrets",
  persistentvolumeclaims: "_/v1/persistentvolumeclaims",
  persistentvolumes: "_/v1/persistentvolumes",
  deployments: "apps/v1/deployments",
  statefulsets: "apps/v1/statefulsets",
  daemonsets: "apps/v1/daemonsets",
  replicasets: "apps/v1/replicasets",
  ingresses: "networking.k8s.io/v1/ingresses",
  networkpolicies: "networking.k8s.io/v1/networkpolicies",
};

function getAge(timestamp: string | undefined): string {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor((diff % 3600000) / 60000)}m`;
}

const columns: Column<K8sResource>[] = [
  { key: "metadata.name", label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  {
    key: "status.phase",
    label: "Status",
    render: (row) => <StatusBadge status={row.status?.phase ?? "Unknown"} />,
  },
  {
    key: "metadata.creationTimestamp",
    label: "Age",
    render: (row) => getAge(row.metadata.creationTimestamp),
  },
];

export default function ResourceListPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;
  const resourceType = params.resourceType as string;
  const [data, setData] = useState<K8sResource[]>([]);
  const [loading, setLoading] = useState(true);

  const gvr = resourceTypeToGVR[resourceType] ?? `_/v1/${resourceType}`;
  const title = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);

  const handleWsEvent = useCallback((event: WatchEvent) => {
    const obj = event.object as K8sResource | undefined;
    if (!obj?.metadata) return;

    setData((prev) => {
      if (event.type === "ADDED") {
        const exists = prev.some(
          (r) => r.metadata.name === obj.metadata.name && r.metadata.namespace === obj.metadata.namespace
        );
        if (exists) return prev;
        return [...prev, obj];
      }
      if (event.type === "DELETED") {
        return prev.filter(
          (r) => !(r.metadata.name === obj.metadata.name && r.metadata.namespace === obj.metadata.namespace)
        );
      }
      if (event.type === "MODIFIED") {
        return prev.map((r) =>
          r.metadata.name === obj.metadata.name && r.metadata.namespace === obj.metadata.namespace ? obj : r
        );
      }
      return prev;
    });
  }, []);

  const { lastUpdated, isConnected } = useK8sWebSocket({
    cluster: clusterId,
    resource: resourceType,
    onEvent: handleWsEvent,
  });

  useEffect(() => {
    api
      .get<ResourceListResponse>(
        `/api/clusters/${clusterId}/resources/${gvr}`
      )
      .then((res) => setData(res.items))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [clusterId, gvr]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/clusters/${clusterId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">
              Cluster: {clusterId}
            </p>
          </div>
        </div>
        <LiveIndicator isConnected={isConnected} lastUpdated={lastUpdated} />
      </div>

      <ResourceTable
        data={data}
        columns={columns}
        loading={loading}
        onRowClick={(row) =>
          router.push(
            `/clusters/${clusterId}/${resourceType}/${encodeURIComponent(row.metadata.name)}${row.metadata.namespace ? `?namespace=${encodeURIComponent(row.metadata.namespace)}` : ""}`
          )
        }
      />
    </div>
  );
}
