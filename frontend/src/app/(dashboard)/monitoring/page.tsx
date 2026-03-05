"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";
import { PrometheusSelector } from "@/components/monitoring/prometheus-selector";
import { MetricsOverview } from "@/components/monitoring/metrics-overview";
import { AlertsTable } from "@/components/monitoring/alerts-table";
import { TargetsTable } from "@/components/monitoring/targets-table";
import { ServiceMonitorList } from "@/plugins/prometheus/service-monitors";
import { RulesList } from "@/plugins/prometheus/rules";
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  Loader2,
  BarChart3,
  AlertTriangle,
  Radio,
  FileText,
  Eye,
} from "lucide-react";

interface PluginInfo {
  id: string;
  name: string;
  enabled: boolean;
}

interface PluginConfig {
  namespace?: string;
  serviceName?: string;
  port?: number;
}

export default function MonitoringPage() {
  const [prometheusEnabled, setPrometheusEnabled] = useState(false);
  const [enablingPrometheus, setEnablingPrometheus] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const selectedCluster = useClusterStore((s) => s.selectedClusterId) ?? "";
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

  const checkConfig = useCallback(async () => {
    if (!selectedCluster || !prometheusEnabled) {
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    try {
      const config = await api.get<PluginConfig>(
        `/api/plugins/prometheus/${selectedCluster}/config`
      );
      setHasConfig(!!config.namespace && !!config.serviceName);
    } catch {
      setHasConfig(false);
    } finally {
      setConfigLoading(false);
    }
  }, [selectedCluster, prometheusEnabled]);

  useEffect(() => {
    checkConfig();
  }, [checkConfig]);

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
{/* Cluster selection is handled by the global sidebar selector */}
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

      {prometheusEnabled && selectedCluster && !configLoading && !hasConfig && (
        <PrometheusSelector
          clusterId={selectedCluster}
          pluginId="prometheus"
          onConfigured={() => setHasConfig(true)}
        />
      )}

      {prometheusEnabled && hasConfig && selectedCluster && (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="service-monitors" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Service Monitors
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Rules
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="targets" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Targets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-6">
            <MetricsOverview clusterId={selectedCluster} />
            <NodesCard nodes={nodes} selectedCluster={selectedCluster} />
          </TabsContent>

          <TabsContent value="service-monitors" className="mt-4">
            <ServiceMonitorList />
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <RulesList />
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <AlertsTable clusterId={selectedCluster} />
          </TabsContent>

          <TabsContent value="targets" className="mt-4">
            <TargetsTable clusterId={selectedCluster} />
          </TabsContent>
        </Tabs>
      )}

      {/* Show nodes when prometheus is not configured */}
      {(!prometheusEnabled || !hasConfig || !selectedCluster) && (
        <NodesCard nodes={nodes} selectedCluster={selectedCluster} />
      )}
    </div>
  );
}

function NodesCard({
  nodes,
  selectedCluster,
}: {
  nodes: Array<Record<string, unknown>>;
  selectedCluster: string;
}) {
  return (
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
  );
}
