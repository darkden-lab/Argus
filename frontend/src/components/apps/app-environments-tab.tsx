"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Save, Key, FileText, Loader2 } from "lucide-react";

interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string };
    secretKeyRef?: { name: string; key: string };
  };
}

interface AppEnvironmentsTabProps {
  clusterId: string;
  appName: string;
  namespace: string;
  onRefresh: () => void;
}

export function AppEnvironmentsTab({
  clusterId,
  appName,
  namespace,
  onRefresh,
}: AppEnvironmentsTabProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ConfigMap/Secret selector dialog
  const [refDialogOpen, setRefDialogOpen] = useState(false);
  const [refDialogType, setRefDialogType] = useState<"configMap" | "secret">(
    "configMap"
  );
  const [refResources, setRefResources] = useState<
    { value: string; label: string }[]
  >([]);
  const [refSelectedResource, setRefSelectedResource] = useState("");
  const [refSelectedKey, setRefSelectedKey] = useState("");
  const [refKeys, setRefKeys] = useState<
    { value: string; label: string }[]
  >([]);
  const [refLoading, setRefLoading] = useState(false);

  const loadEnvVars = useCallback(async () => {
    setLoading(true);
    try {
      const dep = await api.get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      );
      const spec = dep.spec as Record<string, unknown>;
      const template = spec.template as Record<string, unknown>;
      const podSpec = template.spec as Record<string, unknown>;
      const containers = podSpec.containers as Record<string, unknown>[];
      const first = containers?.[0];
      setEnvVars((first?.env as EnvVar[]) ?? []);
    } catch {
      // Handled by parent
    } finally {
      setLoading(false);
    }
  }, [clusterId, appName, namespace]);

  useEffect(() => {
    loadEnvVars();
  }, [loadEnvVars]);

  function addEnvVar() {
    setEnvVars([...envVars, { name: "", value: "" }]);
    setDirty(true);
  }

  function removeEnvVar(index: number) {
    setEnvVars(envVars.filter((_, i) => i !== index));
    setDirty(true);
  }

  function updateEnvVar(index: number, field: "name" | "value", val: string) {
    const updated = [...envVars];
    if (field === "name") {
      updated[index] = { ...updated[index], name: val };
    } else {
      updated[index] = { ...updated[index], value: val, valueFrom: undefined };
    }
    setEnvVars(updated);
    setDirty(true);
  }

  function openRefDialog(type: "configMap" | "secret") {
    setRefDialogType(type);
    setRefSelectedResource("");
    setRefSelectedKey("");
    setRefKeys([]);
    setRefDialogOpen(true);
    // Load resources
    setRefLoading(true);
    const endpoint =
      type === "configMap"
        ? `/api/clusters/${clusterId}/resources/_/v1/configmaps?namespace=${namespace}`
        : `/api/clusters/${clusterId}/resources/_/v1/secrets?namespace=${namespace}`;
    api
      .get<{ items: Record<string, unknown>[] }>(endpoint)
      .then((res) => {
        setRefResources(
          (res.items ?? []).map((item) => ({
            value: (item.metadata as Record<string, string>).name,
            label: (item.metadata as Record<string, string>).name,
          }))
        );
      })
      .catch(() => setRefResources([]))
      .finally(() => setRefLoading(false));
  }

  async function loadRefKeys(resourceName: string) {
    setRefSelectedResource(resourceName);
    setRefSelectedKey("");
    try {
      const endpoint =
        refDialogType === "configMap"
          ? `/api/clusters/${clusterId}/resources/_/v1/configmaps/${resourceName}?namespace=${namespace}`
          : `/api/clusters/${clusterId}/resources/_/v1/secrets/${resourceName}?namespace=${namespace}`;
      const res = await api.get<Record<string, unknown>>(endpoint);
      const data = (res.data as Record<string, string>) ?? {};
      setRefKeys(
        Object.keys(data).map((k) => ({ value: k, label: k }))
      );
    } catch {
      setRefKeys([]);
    }
  }

  function addRefEnvVar() {
    if (!refSelectedResource || !refSelectedKey) return;
    const newEnv: EnvVar = {
      name: refSelectedKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      valueFrom:
        refDialogType === "configMap"
          ? {
              configMapKeyRef: {
                name: refSelectedResource,
                key: refSelectedKey,
              },
            }
          : {
              secretKeyRef: {
                name: refSelectedResource,
                key: refSelectedKey,
              },
            },
    };
    setEnvVars([...envVars, newEnv]);
    setDirty(true);
    setRefDialogOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const dep = await api.get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      );
      const spec = dep.spec as Record<string, unknown>;
      const template = spec.template as Record<string, unknown>;
      const podSpec = template.spec as Record<string, unknown>;
      const containers = [
        ...(podSpec.containers as Record<string, unknown>[]),
      ];
      containers[0] = {
        ...containers[0],
        env: envVars.filter((e) => e.name),
      };
      const patched = {
        ...dep,
        spec: {
          ...spec,
          template: { ...template, spec: { ...podSpec, containers } },
        },
      };
      await api.put(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`,
        patched
      );
      toast("Environment saved", {
        description: "Deployment updated with new environment configuration",
        variant: "success",
      });
      setDirty(false);
      onRefresh();
    } catch {
      // Handled by api client
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Environment Variables */}
      <Card className="py-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Environment Variables</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => openRefDialog("configMap")}
              >
                <FileText className="h-3 w-3 mr-1" /> From ConfigMap
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => openRefDialog("secret")}
              >
                <Key className="h-3 w-3 mr-1" /> From Secret
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={addEnvVar}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Variable
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {envVars.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No environment variables configured. Click &quot;Add
              Variable&quot; to add one.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                <span className="flex-1">Name</span>
                <span className="flex-1">Value / Reference</span>
                <span className="w-8" />
              </div>
              {envVars.map((env, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={env.name}
                    onChange={(e) => updateEnvVar(i, "name", e.target.value)}
                    placeholder="KEY"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  {env.valueFrom ? (
                    <div className="flex-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono"
                      >
                        {env.valueFrom.configMapKeyRef ? (
                          <>
                            <FileText className="h-2.5 w-2.5 mr-1 inline" />
                            {env.valueFrom.configMapKeyRef.name}/
                            {env.valueFrom.configMapKeyRef.key}
                          </>
                        ) : env.valueFrom.secretKeyRef ? (
                          <>
                            <Key className="h-2.5 w-2.5 mr-1 inline" />
                            {env.valueFrom.secretKeyRef.name}/
                            {env.valueFrom.secretKeyRef.key}
                          </>
                        ) : (
                          "ref"
                        )}
                      </Badge>
                    </div>
                  ) : (
                    <Input
                      value={env.value ?? ""}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      placeholder="value"
                      className="h-7 text-xs font-mono flex-1"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-8 p-0 shrink-0"
                    onClick={() => removeEnvVar(i)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      {dirty && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                Save Environment
              </>
            )}
          </Button>
        </div>
      )}

      {/* Reference selector dialog */}
      <Dialog open={refDialogOpen} onOpenChange={setRefDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add from{" "}
              {refDialogType === "configMap" ? "ConfigMap" : "Secret"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {refDialogType === "configMap" ? "ConfigMap" : "Secret"}
              </Label>
              <Combobox
                options={refResources}
                value={refSelectedResource}
                onValueChange={loadRefKeys}
                loading={refLoading}
                placeholder={`Select ${refDialogType === "configMap" ? "ConfigMap" : "Secret"}...`}
              />
            </div>
            {refSelectedResource && (
              <div className="space-y-1.5">
                <Label className="text-xs">Key</Label>
                <Combobox
                  options={refKeys}
                  value={refSelectedKey}
                  onValueChange={setRefSelectedKey}
                  placeholder="Select key..."
                  emptyMessage="No keys found"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addRefEnvVar}
              disabled={!refSelectedResource || !refSelectedKey}
            >
              Add Variable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
