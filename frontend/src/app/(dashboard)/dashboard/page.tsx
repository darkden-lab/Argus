"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { useK8sWildcard } from "@/hooks/use-k8s-socket";
import { useDashboardStore } from "@/stores/dashboard";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";
import {
  Loader2,
  Rocket,
  Database,
  Timer,
  Network,
  Plus,
  ArrowRight,
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Server,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchEvent } from "@/lib/socket";

interface K8sEvent {
  id: string;
  type: string;
  reason: string;
  message: string;
  object: string;
  timestamp: string;
}

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  category: string;
}

interface ProjectSummary {
  name: string;
  namespaces: string[];
  workloads: number;
  podsRunning: number;
  podsTotal: number;
  health: "healthy" | "degraded" | "unknown";
}

export default function DashboardPage() {
  const router = useRouter();
  const { clusters, stats, loading, fetchAll } = useDashboardStore();
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const handleWsEvent = useCallback((event: WatchEvent) => {
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
    setEvents((prev) => [newEvent, ...prev].slice(0, 15));
  }, []);

  const { lastUpdated, isConnected } = useK8sWildcard({ onEvent: handleWsEvent });

  useEffect(() => {
    fetchAll();
    api.get<PluginInfo[]>("/api/plugins/enabled").then(setPlugins).catch(() => {});
  }, [fetchAll]);

  useEffect(() => {
    if (!selectedClusterId) {
      setProjects([]);
      return;
    }
    api
      .get<{ projects: ProjectSummary[] }>(`/api/clusters/${selectedClusterId}/projects`)
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]));
  }, [selectedClusterId]);

  const statCards = [
    {
      label: "Apps",
      value: stats.totalApps,
      subValue: `${stats.healthyApps} healthy`,
      icon: Rocket,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      href: "/apps",
    },
    {
      label: "Databases",
      value: stats.totalDatabases,
      subValue: `${stats.runningDatabases} running`,
      icon: Database,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      href: "/databases",
    },
    {
      label: "CronJobs",
      value: stats.totalCronJobs,
      subValue: `${stats.activeCronJobs} active`,
      icon: Timer,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      href: "/jobs",
    },
    {
      label: "Clusters",
      value: stats.totalClusters,
      subValue: `${stats.healthyClusters} connected`,
      icon: Network,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      href: "/clusters",
    },
  ];

  const quickActions = [
    { label: "Deploy App", icon: Rocket, href: "/apps/deploy" },
    { label: "Add Cluster", icon: Plus, href: "/clusters" },
    { label: "View Monitoring", icon: Activity, href: "/monitoring" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your infrastructure at a glance.
          </p>
        </div>
        <LiveIndicator isConnected={isConnected} lastUpdated={lastUpdated} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading dashboard...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => (
              <Card
                key={stat.label}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(stat.href)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-3xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.subValue}</p>
                    </div>
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", stat.bg)}>
                      <stat.icon className={cn("h-6 w-6", stat.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Cluster Health - Left Column */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Clusters</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push("/clusters")}>
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {clusters.length === 0 && (
                    <div className="text-center py-8">
                      <Server className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">No clusters connected.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => router.push("/clusters")}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add Cluster
                      </Button>
                    </div>
                  )}
                  {clusters.map((cluster) => {
                    const isHealthy = cluster.status === "connected" || cluster.status === "healthy";
                    return (
                      <div
                        key={cluster.id}
                        className="flex items-center justify-between rounded-lg border border-border/50 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => router.push(`/clusters/${cluster.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            isHealthy ? "bg-emerald-500" : "bg-red-500"
                          )} />
                          <div>
                            <p className="text-sm font-medium">{cluster.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {cluster.api_server_url}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            isHealthy
                              ? "border-emerald-500/20 text-emerald-500"
                              : "border-red-500/20 text-red-500"
                          )}
                        >
                          {cluster.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Quick Actions + Plugins */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {quickActions.map((action) => (
                      <Button
                        key={action.label}
                        variant="outline"
                        className="justify-start h-auto py-3"
                        onClick={() => router.push(action.href)}
                      >
                        <action.icon className="mr-2 h-4 w-4" />
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Projects Widget */}
              {selectedClusterId && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">Projects</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
                      View Projects <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {projects.length === 0 ? (
                      <div className="text-center py-4">
                        <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-xs text-muted-foreground">
                          No projects yet. Add label{" "}
                          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                            argus.darkden.net/projects
                          </code>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-success" />
                            {projects.filter((p) => p.health === "healthy").length} healthy
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-warning" />
                            {projects.filter((p) => p.health === "degraded").length} degraded
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                            {projects.filter((p) => p.health === "unknown").length} unknown
                          </span>
                        </div>
                        {projects.slice(0, 5).map((p) => (
                          <div
                            key={p.name}
                            className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                            onClick={() => router.push(`/projects/${p.name}`)}
                          >
                            <span className="truncate">{p.name}</span>
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                p.health === "healthy"
                                  ? "bg-success"
                                  : p.health === "degraded"
                                    ? "bg-warning"
                                    : "bg-muted-foreground"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Active Plugins */}
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Plugins</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/settings/plugins")}>
                    Manage
                  </Button>
                </CardHeader>
                <CardContent>
                  {plugins.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No plugins enabled.</p>
                  ) : (
                    <div className="space-y-2">
                      {plugins.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span>{p.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {p.version}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No recent activity. Events will appear here in real-time.
                </p>
              ) : (
                <div className="space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      {event.type === "Normal" ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                      ) : event.type === "Warning" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{event.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.object} &middot; {event.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
