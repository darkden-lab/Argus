"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface EditAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  appName: string;
  namespace: string;
  currentImage: string;
  currentReplicas: number;
  onSaved: () => void;
}

export function EditAppDialog({
  open,
  onOpenChange,
  clusterId,
  appName,
  namespace,
  currentImage,
  currentReplicas,
  onSaved,
}: EditAppDialogProps) {
  const [image, setImage] = useState("");
  const [replicas, setReplicas] = useState(1);
  const [strategy, setStrategy] = useState("RollingUpdate");
  const [cpuRequest, setCpuRequest] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memRequest, setMemRequest] = useState("");
  const [memLimit, setMemLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!open) return;
    setImage(currentImage);
    setReplicas(currentReplicas);
    // Load current resource limits from the deployment
    setLoadingDetails(true);
    api
      .get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      )
      .then((dep) => {
        const spec = dep.spec as Record<string, unknown>;
        const strategyObj = spec.strategy as Record<string, unknown> | undefined;
        if (strategyObj?.type) setStrategy(strategyObj.type as string);
        const template = spec.template as Record<string, unknown>;
        const podSpec = template.spec as Record<string, unknown>;
        const containers = podSpec.containers as Record<string, unknown>[];
        const first = containers?.[0];
        if (first) {
          const resources = first.resources as Record<string, Record<string, string>> | undefined;
          if (resources?.requests) {
            setCpuRequest(resources.requests.cpu ?? "");
            setMemRequest(resources.requests.memory ?? "");
          }
          if (resources?.limits) {
            setCpuLimit(resources.limits.cpu ?? "");
            setMemLimit(resources.limits.memory ?? "");
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDetails(false));
  }, [open, clusterId, appName, namespace, currentImage, currentReplicas]);

  async function handleSave() {
    if (!image.trim()) return;
    setSaving(true);
    try {
      const dep = await api.get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      );
      const spec = dep.spec as Record<string, unknown>;
      const template = spec.template as Record<string, unknown>;
      const podSpec = template.spec as Record<string, unknown>;
      const containers = [...(podSpec.containers as Record<string, unknown>[])];

      // Build resources object only with non-empty values
      const requests: Record<string, string> = {};
      const limits: Record<string, string> = {};
      if (cpuRequest) requests.cpu = cpuRequest;
      if (memRequest) requests.memory = memRequest;
      if (cpuLimit) limits.cpu = cpuLimit;
      if (memLimit) limits.memory = memLimit;
      const resources =
        Object.keys(requests).length > 0 || Object.keys(limits).length > 0
          ? {
              ...(Object.keys(requests).length > 0 ? { requests } : {}),
              ...(Object.keys(limits).length > 0 ? { limits } : {}),
            }
          : undefined;

      containers[0] = {
        ...containers[0],
        image,
        ...(resources ? { resources } : {}),
      };

      const patched = {
        ...dep,
        spec: {
          ...spec,
          replicas,
          strategy: { type: strategy },
          template: {
            ...template,
            spec: { ...podSpec, containers },
          },
        },
      };

      await api.put(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`,
        patched
      );
      toast("App updated", {
        description: `${appName} has been updated`,
        variant: "success",
      });
      onSaved();
      onOpenChange(false);
    } catch {
      // Handled by api client
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {appName}</DialogTitle>
        </DialogHeader>
        {loadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Container Image</Label>
              <Input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="nginx:latest"
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Replicas</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={replicas}
                  onChange={(e) => setReplicas(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Update Strategy</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RollingUpdate">Rolling Update</SelectItem>
                    <SelectItem value="Recreate">Recreate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Resource Limits
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">CPU Request</Label>
                  <Input
                    value={cpuRequest}
                    onChange={(e) => setCpuRequest(e.target.value)}
                    placeholder="100m"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPU Limit</Label>
                  <Input
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(e.target.value)}
                    placeholder="500m"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Memory Request</Label>
                  <Input
                    value={memRequest}
                    onChange={(e) => setMemRequest(e.target.value)}
                    placeholder="128Mi"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Memory Limit</Label>
                  <Input
                    value={memLimit}
                    onChange={(e) => setMemLimit(e.target.value)}
                    placeholder="512Mi"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !image.trim() || loadingDetails}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
