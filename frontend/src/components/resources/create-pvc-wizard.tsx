"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

interface CreatePVCWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface PVCForm {
  name: string;
  namespace: string;
  storageClass: string;
  accessMode: string;
  size: string;
  sizeUnit: string;
}

const ACCESS_MODES = [
  { value: "ReadWriteOnce", label: "ReadWriteOnce (RWO)" },
  { value: "ReadWriteMany", label: "ReadWriteMany (RWX)" },
  { value: "ReadOnlyMany", label: "ReadOnlyMany (ROX)" },
];

const SIZE_UNITS = [
  { value: "Mi", label: "Mi" },
  { value: "Gi", label: "Gi" },
  { value: "Ti", label: "Ti" },
];

const defaultForm: PVCForm = {
  name: "",
  namespace: "default",
  storageClass: "",
  accessMode: "ReadWriteOnce",
  size: "1",
  sizeUnit: "Gi",
};

export function CreatePVCWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreatePVCWizardProps) {
  const [form, setForm] = useState<PVCForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PVCForm, string>>>({});

  function reset() {
    setForm(defaultForm);
    setErrors({});
    setSubmitting(false);
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  function updateForm(patch: Partial<PVCForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
    // Clear error for updated fields
    const keys = Object.keys(patch) as Array<keyof PVCForm>;
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof PVCForm, string>> = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(form.name)) {
      newErrors.name = "Must be a valid DNS name (lowercase, alphanumeric, hyphens)";
    }

    if (!form.namespace.trim()) {
      newErrors.namespace = "Namespace is required";
    }

    const sizeNum = parseFloat(form.size);
    if (!form.size.trim() || isNaN(sizeNum) || sizeNum <= 0) {
      newErrors.size = "Size must be a positive number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSubmitting(true);
    const ns = form.namespace || "default";
    const storageSize = `${form.size}${form.sizeUnit}`;

    const manifest = {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: form.name,
        namespace: ns,
      },
      spec: {
        accessModes: [form.accessMode],
        resources: {
          requests: {
            storage: storageSize,
          },
        },
        ...(form.storageClass ? { storageClassName: form.storageClass } : {}),
      },
    };

    try {
      await api.post(
        `/api/clusters/${clusterId}/resources/_/v1/persistentvolumeclaims?namespace=${ns}`,
        manifest
      );
      toast("PVC Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create PVC", {
        description: "Check cluster connectivity and permissions.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Persistent Volume Claim</DialogTitle>
          <DialogDescription>
            Create a new PVC to request storage in your cluster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pvc-name">Name</Label>
            <Input
              id="pvc-name"
              placeholder="my-pvc"
              value={form.name}
              onChange={(e) =>
                updateForm({
                  name: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "-"),
                })
              }
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Namespace */}
          <div className="space-y-2">
            <Label htmlFor="pvc-namespace">Namespace</Label>
            <Input
              id="pvc-namespace"
              placeholder="default"
              value={form.namespace}
              onChange={(e) => updateForm({ namespace: e.target.value })}
            />
            {errors.namespace && (
              <p className="text-xs text-destructive">{errors.namespace}</p>
            )}
          </div>

          {/* Storage Class */}
          <div className="space-y-2">
            <Label htmlFor="pvc-storage-class">
              Storage Class <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="pvc-storage-class"
              placeholder="standard"
              value={form.storageClass}
              onChange={(e) => updateForm({ storageClass: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default storage class.
            </p>
          </div>

          {/* Access Mode */}
          <div className="space-y-2">
            <Label>Access Mode</Label>
            <Select
              value={form.accessMode}
              onValueChange={(v) => updateForm({ accessMode: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Size */}
          <div className="space-y-2">
            <Label>Size</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={form.size}
                onChange={(e) => updateForm({ size: e.target.value })}
                className="flex-1"
              />
              <Select
                value={form.sizeUnit}
                onValueChange={(v) => updateForm({ sizeUnit: v })}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_UNITS.map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.size && (
              <p className="text-xs text-destructive">{errors.size}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.name || !form.namespace}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create PVC"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
