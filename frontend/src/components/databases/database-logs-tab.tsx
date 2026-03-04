"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { LogViewer } from "@/components/resources/log-viewer";
import { Loader2 } from "lucide-react";

interface DatabaseLogsTabProps {
  clusterId: string;
  dbName: string;
  namespace: string;
}

export function DatabaseLogsTab({ clusterId, dbName, namespace }: DatabaseLogsTabProps) {
  const [pods, setPods] = useState<{ value: string; label: string; containers?: string[] }[]>([]);
  const [selectedPod, setSelectedPod] = useState("");
  const [selectedContainers, setSelectedContainers] = useState<string[] | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPods() {
      try {
        const res = await api.get<{ items: Record<string, unknown>[] }>(
          `/api/clusters/${clusterId}/resources/_/v1/pods?namespace=${namespace}`
        );
        const filtered = (res.items ?? []).filter((pod) => {
          const name = (pod.metadata as Record<string, string>)?.name ?? "";
          return name.startsWith(dbName);
        });
        const podOptions = filtered.map((pod) => {
          const meta = pod.metadata as Record<string, string>;
          const spec = pod.spec as Record<string, unknown>;
          const containers = (spec?.containers as Record<string, string>[])?.map((c) => c.name);
          return { value: meta.name, label: meta.name, containers };
        });
        setPods(podOptions);
        if (podOptions.length > 0) {
          setSelectedPod(podOptions[0].value);
          setSelectedContainers(podOptions[0].containers);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchPods();
  }, [clusterId, dbName, namespace]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pod Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {pods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pods found for this database.</p>
          ) : (
            <div className="space-y-3">
              <Combobox
                options={pods}
                value={selectedPod}
                onValueChange={(val) => {
                  setSelectedPod(val);
                  const pod = pods.find((p) => p.value === val);
                  setSelectedContainers(pod?.containers);
                }}
                placeholder="Select pod..."
              />
              {selectedPod && (
                <div className="rounded-md border">
                  <LogViewer
                    clusterID={clusterId}
                    namespace={namespace}
                    podName={selectedPod}
                    containers={selectedContainers}
                    onClose={() => {}}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
