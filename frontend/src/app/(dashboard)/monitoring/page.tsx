"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  Loader2,
  BarChart3,
} from "lucide-react";

interface PluginInfo {
  id: string;
  name: string;
  enabled: boolean;
}

export default function MonitoringPage() {
  const [prometheusEnabled, setPrometheusEnabled] = useState(false);
  const [enablingPrometheus, setEnablingPrometheus] = useState(false);
  const clusters = useClusterStore((s) => s.clusters);
  const selectedCluster = useClusterStore((s) => s.selectedClusterId) ?? "";
  const setSelectedCluster = useClusterStore((s) => s.setSelectedClusterId);
  const fetchClusters = useClusterStore((s) => s.fetchClusters);
  const clustersLoading = useClusterStore((s) => s.loading);
  const [nodes, setNodes] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await fetchClusters();
      try {
        const plugins = await api.get<PluginInfo[]>("/api/plugins/enabled");
        setPrometheusEnabled(plugins.some((p) => p.id === "prometheus"));
      } catch {
        // ignore
      }
      setLoading(false);
    };
    init();
  }, [fetchClusters]);

  useEffect(() => {
    if (!selectedCluster) return;
    api
      .get<{ items: Array<Record<string, unknown>> }>(
        `/api/clusters/${selectedCluster}/resources/_/v1/nodes`
      )
      .then((data) => setNodes(data.items ?? []))
      .catch(() => setNodes([]));
  }, [selectedCluster]);

  async function handleEnablePrometheus() {
    setEnablingPrometheus(true);
    try {
      await api.post("/api/plugins/prometheus/enable");
      setPrometheusEnabled(true);
    } catch {
      // handled by api
    } finally {
      setEnablingPrometheus(false);
    }
  }

  if (loading || clustersLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">Cluster health and resource usage.</p>
        </div>
        {clusters.length > 1 && (
          <select value={selectedCluster} onChange={(e) => setSelectedCluster(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm">
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {!prometheusEnabled && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
              <BarChart3 className="h-6 w-6 text-orange-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Enable Prometheus for advanced metrics</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get detailed CPU, memory, and custom metrics with the Prometheus plugin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleEnablePrometheus}
                disabled={enablingPrometheus}
              >
                {enablingPrometheus ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Enable Prometheus
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.location.href = "/settings/plugins"}>
                View Plugins
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" /> Nodes ({nodes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {selectedCluster ? "No nodes found." : "Select a cluster to view nodes."}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {nodes.map((node) => {
                const meta = node.metadata as Record<string, unknown>;
                const status = node.status as Record<string, unknown> | undefined;
                const conditions = status?.conditions as Array<Record<string, unknown>> | undefined;
                const isReady = conditions?.some((c) => c.type === "Ready" && c.status === "True");
                const capacity = status?.capacity as Record<string, string> | undefined;
                const nodeInfo = status?.nodeInfo as Record<string, string> | undefined;

                return (
                  <Card key={String(meta.name)} className="border-border/50">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${isReady ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span className="text-sm font-medium">{String(meta.name)}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {isReady ? "Ready" : "NotReady"}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Cpu className="h-3 w-3" /> CPU
                          </div>
                          <span>{capacity?.cpu ?? "-"} cores</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MemoryStick className="h-3 w-3" /> Memory
                          </div>
                          <span>{capacity?.memory ?? "-"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <HardDrive className="h-3 w-3" /> Storage
                          </div>
                          <span>{capacity?.["ephemeral-storage"] ?? "-"}</span>
                        </div>
                        {nodeInfo?.kubeletVersion && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Activity className="h-3 w-3" /> K8s
                            </div>
                            <span>{nodeInfo.kubeletVersion}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {prometheusEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Prometheus Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "CPU Usage", icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: "Memory Usage", icon: MemoryStick, color: "text-purple-500", bg: "bg-purple-500/10" },
                { label: "Disk Usage", icon: HardDrive, color: "text-amber-500", bg: "bg-amber-500/10" },
              ].map((metric) => (
                <Card key={metric.label} className="border-border/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.bg}`}>
                        <metric.icon className={`h-5 w-5 ${metric.color}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                        <p className="text-lg font-bold">--</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Detailed metrics available through the Prometheus plugin API endpoints.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
