"use client";

import { useEffect, useState, useCallback } from "react";
import { ClusterHealthCard, type ClusterInfo } from "@/components/dashboard/cluster-health-card";
import { ResourceSummary, type ResourceCounts } from "@/components/dashboard/resource-summary";
import { RecentEvents, type K8sEvent } from "@/components/dashboard/recent-events";
import { PluginStatusCard, type PluginInfo } from "@/components/dashboard/plugin-status-card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { useK8sWildcard } from "@/hooks/use-k8s-websocket";
import { api } from "@/lib/api";
import type { WatchEvent } from "@/lib/ws";

// Placeholder data used when the API is unreachable
const placeholderClusters: ClusterInfo[] = [
  { id: "1", name: "production", status: "connected", apiServer: "https://k8s-prod.example.com:6443", lastCheck: "10s ago" },
  { id: "2", name: "staging", status: "connected", apiServer: "https://k8s-staging.example.com:6443", lastCheck: "12s ago" },
  { id: "3", name: "dev", status: "disconnected", apiServer: "https://k8s-dev.example.com:6443", lastCheck: "5m ago" },
];

const placeholderResources: ResourceCounts = {
  pods: 124,
  deployments: 38,
  services: 52,
  namespaces: 12,
};

const placeholderEvents: K8sEvent[] = [
  { id: "1", type: "Normal", reason: "Scheduled", message: "Successfully assigned default/nginx-7d5b to node-1", object: "pod/nginx-7d5b", timestamp: "2m ago" },
  { id: "2", type: "Warning", reason: "BackOff", message: "Back-off restarting failed container", object: "pod/api-server-c3f1", timestamp: "5m ago" },
  { id: "3", type: "Normal", reason: "Pulled", message: "Container image \"nginx:1.25\" already present on machine", object: "pod/nginx-7d5b", timestamp: "2m ago" },
  { id: "4", type: "Normal", reason: "ScalingReplicaSet", message: "Scaled up replica set web-app-6f8d to 3", object: "deployment/web-app", timestamp: "8m ago" },
];

const placeholderPlugins: PluginInfo[] = [
  { id: "prometheus", name: "Prometheus Operator", version: "0.72.0", enabled: true },
  { id: "istio", name: "Istio Service Mesh", version: "1.21.0", enabled: true },
  { id: "calico", name: "Calico CNI", version: "3.27.0", enabled: true },
];

export default function DashboardPage() {
  const [clusters, setClusters] = useState<ClusterInfo[]>(placeholderClusters);
  const [resources, setResources] = useState<ResourceCounts>(placeholderResources);
  const [events, setEvents] = useState<K8sEvent[]>(placeholderEvents);
  const [plugins, setPlugins] = useState<PluginInfo[]>(placeholderPlugins);

  const handleWsEvent = useCallback((event: WatchEvent) => {
    if (event.resource === "pods") {
      setResources((prev) => {
        if (event.type === "ADDED") return { ...prev, pods: prev.pods + 1 };
        if (event.type === "DELETED") return { ...prev, pods: Math.max(0, prev.pods - 1) };
        return prev;
      });
    }
    if (event.resource === "deployments") {
      setResources((prev) => {
        if (event.type === "ADDED") return { ...prev, deployments: prev.deployments + 1 };
        if (event.type === "DELETED") return { ...prev, deployments: Math.max(0, prev.deployments - 1) };
        return prev;
      });
    }
    if (event.resource === "services") {
      setResources((prev) => {
        if (event.type === "ADDED") return { ...prev, services: prev.services + 1 };
        if (event.type === "DELETED") return { ...prev, services: Math.max(0, prev.services - 1) };
        return prev;
      });
    }

    const obj = event.object as Record<string, unknown> | undefined;
    const meta = obj?.metadata as Record<string, unknown> | undefined;
    const newEvent: K8sEvent = {
      id: String(Date.now()),
      type: event.type === "DELETED" ? "Warning" : "Normal",
      reason: event.type,
      message: `${event.resource} ${meta?.name ?? "unknown"} was ${event.type.toLowerCase()}`,
      object: `${event.resource}/${meta?.name ?? "unknown"}`,
      timestamp: "Just now",
    };
    setEvents((prev) => [newEvent, ...prev].slice(0, 20));
  }, []);

  const { lastUpdated, isConnected } = useK8sWildcard({ onEvent: handleWsEvent });

  useEffect(() => {
    api.get<ClusterInfo[]>("/api/clusters").then(setClusters).catch(() => {});
    api.get<PluginInfo[]>("/api/plugins/enabled").then(setPlugins).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your Kubernetes clusters.
          </p>
        </div>
        <LiveIndicator isConnected={isConnected} lastUpdated={lastUpdated} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ClusterHealthCard clusters={clusters} />
        <ResourceSummary resources={resources} />
        <RecentEvents events={events} />
        <PluginStatusCard plugins={plugins} />
      </div>
    </div>
  );
}
