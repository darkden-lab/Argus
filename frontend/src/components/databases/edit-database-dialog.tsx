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
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface EditDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  dbName: string;
  namespace: string;
  engine: string;
  isCNPG?: boolean;
  isMariaDB?: boolean;
  currentReplicas: number;
  currentStorage: string;
  onSaved: () => void;
}

export function EditDatabaseDialog({
  open,
  onOpenChange,
  clusterId,
  dbName,
  namespace,
  engine,
  isCNPG,
  isMariaDB,
  currentReplicas,
  currentStorage,
  onSaved,
}: EditDatabaseDialogProps) {
  const [replicas, setReplicas] = useState(1);
  const [storage, setStorage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReplicas(currentReplicas);
    setStorage(currentStorage);
    setLoadingDetails(true);

    if (isCNPG) {
      api
        .get<Record<string, unknown>>(
          `/api/plugins/cnpg/clusters?clusterID=${clusterId}`
        )
        .then((data) => {
          const items = (data as unknown as Record<string, unknown>[]) || [];
          const cluster = Array.isArray(items)
            ? items.find(
                (item) =>
                  (item.metadata as Record<string, unknown>)?.name === dbName
              )
            : null;
          if (cluster) {
            const spec = cluster.spec as Record<string, unknown>;
            if (spec?.instances) setReplicas(spec.instances as number);
            const storageObj = spec?.storage as Record<string, unknown>;
            if (storageObj?.size) setStorage(storageObj.size as string);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingDetails(false));
    } else if (isMariaDB) {
      api
        .get<Record<string, unknown>>(
          `/api/clusters/${clusterId}/resources/k8s.mariadb.com/v1alpha1/mariadbs/${dbName}?namespace=${namespace}`
        )
        .then((data) => {
          const spec = data.spec as Record<string, unknown>;
          if (spec?.replicas) setReplicas(spec.replicas as number);
          const storageObj = spec?.storage as Record<string, unknown>;
          if (storageObj?.size) setStorage(storageObj.size as string);
        })
        .catch(() => {})
        .finally(() => setLoadingDetails(false));
    } else {
      api
        .get<Record<string, unknown>>(
          `/api/clusters/${clusterId}/resources/apps/v1/statefulsets/${dbName}?namespace=${namespace}`
        )
        .then((data) => {
          const spec = data.spec as Record<string, unknown>;
          if (spec?.replicas != null) setReplicas(spec.replicas as number);
        })
        .catch(() => {})
        .finally(() => setLoadingDetails(false));
    }
  }, [open, clusterId, dbName, namespace, isCNPG, isMariaDB, currentReplicas, currentStorage]);

  async function handleSave() {
    setSaving(true);
    try {
      if (isCNPG) {
        const data = await api.get<Record<string, unknown>>(
          `/api/plugins/cnpg/clusters?clusterID=${clusterId}`
        );
        const items = (data as unknown as Record<string, unknown>[]) || [];
        const cluster = Array.isArray(items)
          ? items.find(
              (item) =>
                (item.metadata as Record<string, unknown>)?.name === dbName
            )
          : null;

        if (!cluster) throw new Error("CNPG cluster not found");

        const spec = cluster.spec as Record<string, unknown>;
        const storageObj = (spec.storage as Record<string, unknown>) || {};
        const patched = {
          ...cluster,
          spec: {
            ...spec,
            instances: replicas,
            storage: { ...storageObj, size: storage },
          },
        };

        await api.put(
          `/api/clusters/${clusterId}/resources/postgresql.cnpg.io/v1/clusters/${dbName}?namespace=${namespace}`,
          patched
        );
      } else if (isMariaDB) {
        const data = await api.get<Record<string, unknown>>(
          `/api/clusters/${clusterId}/resources/k8s.mariadb.com/v1alpha1/mariadbs/${dbName}?namespace=${namespace}`
        );
        const spec = data.spec as Record<string, unknown>;
        const storageObj = (spec.storage as Record<string, unknown>) || {};
        const patched = {
          ...data,
          spec: {
            ...spec,
            replicas,
            storage: { ...storageObj, size: storage },
          },
        };

        await api.put(
          `/api/clusters/${clusterId}/resources/k8s.mariadb.com/v1alpha1/mariadbs/${dbName}?namespace=${namespace}`,
          patched
        );
      } else {
        const data = await api.get<Record<string, unknown>>(
          `/api/clusters/${clusterId}/resources/apps/v1/statefulsets/${dbName}?namespace=${namespace}`
        );
        const spec = data.spec as Record<string, unknown>;
        const patched = {
          ...data,
          spec: {
            ...spec,
            replicas,
          },
        };

        await api.put(
          `/api/clusters/${clusterId}/resources/apps/v1/statefulsets/${dbName}?namespace=${namespace}`,
          patched
        );
      }

      toast("Database updated", {
        description: `${dbName} has been updated`,
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

  const showStorageField = isCNPG || isMariaDB;
  const maxReplicas = isCNPG || isMariaDB ? 10 : 20;
  const minReplicas = isCNPG || isMariaDB ? 1 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {dbName}
            <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">
              ({engine})
            </span>
          </DialogTitle>
        </DialogHeader>
        {loadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className={showStorageField ? "grid grid-cols-2 gap-3" : ""}>
              <div className="space-y-1.5">
                <Label>{isCNPG ? "Instances" : "Replicas"}</Label>
                <Input
                  type="number"
                  min={minReplicas}
                  max={maxReplicas}
                  value={replicas}
                  onChange={(e) => setReplicas(Number(e.target.value))}
                />
              </div>
              {showStorageField && (
                <div className="space-y-1.5">
                  <Label>Storage Size</Label>
                  <Input
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    placeholder="10Gi"
                    className="font-mono text-xs"
                  />
                </div>
              )}
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
          <Button onClick={handleSave} disabled={saving || loadingDetails}>
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
