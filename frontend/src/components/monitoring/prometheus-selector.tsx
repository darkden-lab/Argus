"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Loader2, Search } from "lucide-react";

interface DiscoveredInstance {
  namespace: string;
  serviceName: string;
  port: number;
}

type PrometheusDiscoverResponse = DiscoveredInstance[];

interface PrometheusSelectorProps {
  clusterId: string;
  pluginId: "prometheus" | "istio";
  onConfigured: () => void;
}

export function PrometheusSelector({
  clusterId,
  pluginId,
  onConfigured,
}: PrometheusSelectorProps) {
  const [instances, setInstances] = useState<DiscoveredInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    setError(null);

    const path =
      pluginId === "istio"
        ? `/api/plugins/istio/${clusterId}/discover-prometheus`
        : `/api/plugins/${pluginId}/${clusterId}/discover`;

    api
      .get<PrometheusDiscoverResponse>(path)
      .then((data) => setInstances(Array.isArray(data) ? data : []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Discovery failed")
      )
      .finally(() => setLoading(false));
  }, [clusterId, pluginId]);

  const handleSave = async () => {
    if (!selected) return;
    const instance = instances.find(
      (i) => `${i.namespace}/${i.serviceName}:${i.port}` === selected
    );
    if (!instance) return;

    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/plugins/${pluginId}/${clusterId}/config`, {
        namespace: instance.namespace,
        serviceName: instance.serviceName,
        port: instance.port,
      });
      onConfigured();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Search className="h-4 w-4" />
          Configure Prometheus Instance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Discovering Prometheus instances...
            </span>
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 py-2">{error}</p>
        ) : instances.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No Prometheus instances found in this cluster.
          </p>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Prometheus Instance
              </label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an instance..." />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((inst) => {
                    const value = `${inst.namespace}/${inst.serviceName}:${inst.port}`;
                    return (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!selected || saving}
            >
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
