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

export default function DashboardPage() {
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [resources, setResources] = useState<ResourceCounts>({ pods: 0, deployments: 0, services: 0, namespaces: 0 });
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

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
    Promise.allSettled([
      api.get<ClusterInfo[]>("/api/clusters").then(setClusters),
      api.get<PluginInfo[]>("/api/plugins/enabled").then(setPlugins),
    ]).finally(() => setLoading(false));
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
