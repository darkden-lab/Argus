"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Server,
  Shuffle,
} from "lucide-react";

interface CNPGStatus {
  phase?: string;
  currentPrimary?: string;
  targetPrimary?: string;
  readyInstances?: number;
  instances?: number;
  conditions?: Array<{ type: string; status: string; message?: string; lastTransitionTime?: string }>;
  instancesStatus?: Record<string, string[]>;
}

interface DatabaseMonitoringTabProps {
  clusterId: string;
  dbName: string;
  namespace: string;
  isCNPG: boolean;
  cnpgCluster?: {
    metadata: { name: string; namespace?: string };
    spec?: { instances?: number };
    status?: CNPGStatus;
  } | null;
}

export function DatabaseMonitoringTab({
  clusterId,
  dbName,
  namespace,
  isCNPG,
  cnpgCluster,
}: DatabaseMonitoringTabProps) {
  const [pods, setPods] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchoverTarget, setSwitchoverTarget] = useState("");
  const [switchoverOpen, setSwitchoverOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    async function fetchPods() {
      try {
        const res = await api.get<{ items: Record<string, unknown>[] }>(
          `/api/clusters/${clusterId}/resources/_/v1/pods?namespace=${namespace}`
        );
        setPods(
          (res.items ?? []).filter((pod) => {
            const name = ((pod.metadata as Record<string, string>)?.name) ?? "";
            return name.startsWith(dbName);
          })
        );
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchPods();
  }, [clusterId, dbName, namespace]);

  async function handleSwitchover() {
    if (!switchoverTarget) return;
    setSwitching(true);
    try {
      const cluster = await api.get<Record<string, unknown>>(
        `/api/plugins/cnpg/clusters/${dbName}?clusterID=${clusterId}&namespace=${namespace}`
      );
      const patched = {
        ...cluster,
        status: {
          ...(cluster.status as Record<string, unknown>),
          targetPrimary: switchoverTarget,
        },
      };
      await api.put(
        `/api/plugins/cnpg/clusters/${dbName}?clusterID=${clusterId}&namespace=${namespace}`,
        patched
      );
      toast("Switchover initiated", {
        description: `Target primary set to ${switchoverTarget}`,
        variant: "success",
      });
      setSwitchoverOpen(false);
    } catch {
      // Handled by api client
    } finally {
      setSwitching(false);
    }
  }

  if (!isCNPG) {
    return (
      <Card className="py-4">
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Monitoring details are available for CNPG (PostgreSQL) databases.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = cnpgCluster?.status;
  const replicaPods = pods
    .filter((p) => ((p.metadata as Record<string, string>)?.name) !== status?.currentPrimary)
    .map((p) => ({
      value: (p.metadata as Record<string, string>).name,
      label: (p.metadata as Record<string, string>).name,
    }));

  return (
    <div className="space-y-4">
      {/* Cluster Status */}
      <Card className="py-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Cluster Status
            </CardTitle>
            <Badge
              variant={
                status?.phase === "Cluster in healthy state"
                  ? "success"
                  : status?.phase?.includes("fail")
                    ? "destructive"
                    : "warning"
              }
            >
              {status?.phase ?? "Unknown"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Primary:</span>{" "}
              <span className="font-mono font-medium">{status?.currentPrimary ?? "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Instances:</span>{" "}
              <span className="font-medium">{status?.readyInstances ?? 0} / {cnpgCluster?.spec?.instances ?? 0} ready</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instance Status */}
      <Card className="py-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" /> Instances
            </CardTitle>
            {replicaPods.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSwitchoverOpen(true)}>
                <Shuffle className="h-3 w-3 mr-1" /> Switchover
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pods.map((pod) => {
              const name = (pod.metadata as Record<string, string>).name;
              const podStatus = (pod.status as Record<string, unknown>);
              const phase = (podStatus?.phase as string) ?? "Unknown";
              const isPrimary = name === status?.currentPrimary;
              const containerStatuses = (podStatus?.containerStatuses as Array<{ ready: boolean; restartCount: number }>) ?? [];
              const restarts = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0);

              return (
                <div key={name} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {isPrimary ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Server className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-mono">{name}</span>
                    {isPrimary && <Badge variant="default" className="text-[10px]">Primary</Badge>}
                    {!isPrimary && <Badge variant="outline" className="text-[10px]">Replica</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={phase === "Running" ? "outline" : "destructive"} className="text-[10px]">
                      {phase}
                    </Badge>
                    {restarts > 0 && (
                      <span className="text-xs text-yellow-500">{restarts} restarts</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Conditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.conditions.map((cond, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                  <Badge variant={cond.status === "True" ? "outline" : "destructive"} className="text-[10px] shrink-0">
                    {cond.type}
                  </Badge>
                  <div>
                    <span className="font-medium">{cond.status}</span>
                    {cond.message && <p className="text-muted-foreground mt-0.5">{cond.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Switchover Dialog */}
      {switchoverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSwitchoverOpen(false)}>
          <div className="bg-background rounded-lg border p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Select New Primary</h3>
            <p className="text-sm text-muted-foreground">
              Select a replica to promote as the new primary. This will trigger a controlled switchover.
            </p>
            <Combobox
              options={replicaPods}
              value={switchoverTarget}
              onValueChange={setSwitchoverTarget}
              placeholder="Select replica..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSwitchoverOpen(false)}>Cancel</Button>
              <Button onClick={handleSwitchover} disabled={!switchoverTarget || switching}>
                {switching ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Switching...</> : "Switchover"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
