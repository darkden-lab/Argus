"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ProgressSteps } from "@/components/ui/progress-steps";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Database,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateDatabaseWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

type Engine = "postgresql" | "mariadb";

interface KVPair {
  key: string;
  value: string;
}

interface DatabaseForm {
  engine: Engine;
  name: string;
  namespace: string;
  instances: string;
  storageSize: string;
  storageClass: string;
  // PostgreSQL specific
  databaseName: string;
  databaseOwner: string;
  imageName: string;
  pgParameters: KVPair[];
  // MariaDB specific
  port: string;
  rootPasswordSecretName: string;
  rootPasswordSecretKey: string;
}

const WIZARD_STEPS = [
  { label: "Engine", description: "Database type" },
  { label: "Basics", description: "Name & storage" },
  { label: "Config", description: "Engine settings" },
  { label: "Review", description: "Verify & create" },
];

const defaultForm: DatabaseForm = {
  engine: "postgresql",
  name: "",
  namespace: "default",
  instances: "3",
  storageSize: "10Gi",
  storageClass: "",
  databaseName: "app",
  databaseOwner: "app",
  imageName: "",
  pgParameters: [],
  port: "3306",
  rootPasswordSecretName: "",
  rootPasswordSecretKey: "password",
};

function buildManifest(form: DatabaseForm) {
  if (form.engine === "postgresql") {
    const spec: Record<string, unknown> = {
      instances: parseInt(form.instances, 10) || 3,
      bootstrap: {
        initdb: {
          database: form.databaseName || "app",
          owner: form.databaseOwner || "app",
        },
      },
      storage: {
        size: form.storageSize || "10Gi",
        ...(form.storageClass ? { storageClass: form.storageClass } : {}),
      },
    };

    if (form.imageName.trim()) {
      spec.imageName = form.imageName.trim();
    }

    const filteredParams = form.pgParameters.filter((p) => p.key.trim());
    if (filteredParams.length > 0) {
      const params: Record<string, string> = {};
      for (const p of filteredParams) {
        params[p.key] = p.value;
      }
      spec.postgresql = { parameters: params };
    }

    return {
      apiVersion: "postgresql.cnpg.io/v1",
      kind: "Cluster",
      metadata: {
        name: form.name,
        namespace: form.namespace || "default",
      },
      spec,
    };
  }

  // MariaDB
  return {
    apiVersion: "k8s.mariadb.com/v1alpha1",
    kind: "MariaDB",
    metadata: {
      name: form.name,
      namespace: form.namespace || "default",
    },
    spec: {
      rootPasswordSecretKeyRef: {
        name: form.rootPasswordSecretName,
        key: form.rootPasswordSecretKey || "password",
      },
      port: parseInt(form.port, 10) || 3306,
      replicas: parseInt(form.instances, 10) || 3,
      storage: {
        size: form.storageSize || "10Gi",
        ...(form.storageClass
          ? { storageClassName: form.storageClass }
          : {}),
      },
    },
  };
}

function KVPairEditor({
  pairs,
  onChange,
  onRemove,
  addPair,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
}: {
  pairs: KVPair[];
  onChange: (index: number, patch: Partial<KVPair>) => void;
  onRemove: (index: number) => void;
  addPair: () => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder={keyPlaceholder}
            value={pair.key}
            onChange={(e) => onChange(i, { key: e.target.value })}
            className="flex-1 font-mono text-xs"
          />
          <span className="text-muted-foreground">=</span>
          <Input
            placeholder={valuePlaceholder}
            value={pair.value}
            onChange={(e) => onChange(i, { value: e.target.value })}
            className="flex-1 font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(i)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPair}>
        <Plus className="mr-1 h-3 w-3" />
        Add Parameter
      </Button>
    </div>
  );
}

export function CreateDatabaseWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateDatabaseWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DatabaseForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [namespaceOptions, setNamespaceOptions] = useState<ComboboxOption[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  const [storageClassOptions, setStorageClassOptions] = useState<ComboboxOption[]>([]);
  const [storageClassesLoading, setStorageClassesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setNamespacesLoading(true);
    api
      .get<{ items: Array<{ metadata: { name: string } }> }>(
        `/api/clusters/${clusterId}/resources/_/v1/namespaces`
      )
      .then((data) => {
        setNamespaceOptions(
          (data.items || []).map((ns) => ({
            value: ns.metadata.name,
            label: ns.metadata.name,
          }))
        );
      })
      .catch(() => {
        setNamespaceOptions([]);
      })
      .finally(() => setNamespacesLoading(false));

    setStorageClassesLoading(true);
    api
      .get<{
        items: Array<{ metadata: { name: string }; provisioner?: string }>;
      }>(
        `/api/clusters/${clusterId}/resources/storage.k8s.io/v1/storageclasses`
      )
      .then((data) => {
        setStorageClassOptions(
          (data.items || []).map((sc) => ({
            value: sc.metadata.name,
            label: sc.metadata.name,
            description: sc.provisioner,
          }))
        );
      })
      .catch(() => {
        setStorageClassOptions([]);
      })
      .finally(() => setStorageClassesLoading(false));
  }, [open, clusterId]);

  function reset() {
    setStep(0);
    setForm(defaultForm);
    setSubmitting(false);
    setErrors({});
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  function updateForm(patch: Partial<DatabaseForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): { valid: boolean; errors: Record<string, string> } {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(form.name)) {
      newErrors.name = "Must be a valid DNS name";
    }
    if (!form.namespace.trim()) {
      newErrors.namespace = "Namespace is required";
    }
    if (form.engine === "mariadb" && !form.rootPasswordSecretName.trim()) {
      newErrors.rootPasswordSecretName = "Root password secret name is required";
    }
    setErrors(newErrors);
    return { valid: Object.keys(newErrors).length === 0, errors: newErrors };
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return true;
      case 1:
        return form.name.trim().length > 0 && form.namespace.trim().length > 0;
      case 2:
        if (form.engine === "mariadb") {
          return form.rootPasswordSecretName.trim().length > 0;
        }
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    const result = validate();
    if (!result.valid) {
      if (result.errors.name || result.errors.namespace) {
        setStep(1);
      } else if (result.errors.rootPasswordSecretName) {
        setStep(2);
      }
      return;
    }

    setSubmitting(true);
    const ns = form.namespace || "default";
    const manifest = buildManifest(form);

    try {
      if (form.engine === "postgresql") {
        await api.post(
          `/api/plugins/cnpg/clusters?clusterID=${clusterId}&namespace=${ns}`,
          manifest
        );
      } else {
        await api.post(
          `/api/plugins/mariadb/instances?clusterID=${clusterId}&namespace=${ns}`,
          manifest
        );
      }
      toast("Database Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create database", {
        description: "Check cluster connectivity and permissions.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const manifest = buildManifest(form);
  const jsonPreview = JSON.stringify(manifest, null, 2);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Database</DialogTitle>
          <DialogDescription>
            Deploy a managed database instance on your Kubernetes cluster.
          </DialogDescription>
        </DialogHeader>

        <ProgressSteps steps={WIZARD_STEPS} currentStep={step} className="py-2" />

        {/* Step 0: Engine Selection */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Database Engine</Label>
              <p className="text-xs text-muted-foreground">
                Select the database engine to deploy.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className={`rounded-lg border p-4 text-left transition-all ${
                  form.engine === "postgresql"
                    ? "border-primary ring-2 ring-primary/20"
                    : "cursor-pointer hover:border-primary/40"
                }`}
                onClick={() => updateForm({ engine: "postgresql" })}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Database className="h-5 w-5 text-primary" />
                  <span className="font-medium text-sm">PostgreSQL</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  CloudNativePG operator
                </p>
              </button>
              <button
                type="button"
                className={`rounded-lg border p-4 text-left transition-all ${
                  form.engine === "mariadb"
                    ? "border-primary ring-2 ring-primary/20"
                    : "cursor-pointer hover:border-primary/40"
                }`}
                onClick={() => updateForm({ engine: "mariadb" })}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Database className="h-5 w-5 text-primary" />
                  <span className="font-medium text-sm">MariaDB</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  MariaDB operator
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="db-name">Name</Label>
              <Input
                id="db-name"
                placeholder="my-database"
                value={form.name}
                onChange={(e) =>
                  updateForm({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9.-]/g, "-"),
                  })
                }
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Namespace</Label>
              <Combobox
                options={namespaceOptions}
                value={form.namespace}
                onValueChange={(v) => updateForm({ namespace: v })}
                placeholder="Select namespace..."
                searchPlaceholder="Search namespaces..."
                emptyMessage="No namespaces found."
                loading={namespacesLoading}
                allowCustomValue
              />
              {errors.namespace && (
                <p className="text-xs text-destructive">{errors.namespace}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-instances">Instances</Label>
              <Input
                id="db-instances"
                type="number"
                min="1"
                value={form.instances}
                onChange={(e) => updateForm({ instances: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-storage-size">Storage Size</Label>
              <Input
                id="db-storage-size"
                placeholder="10Gi"
                value={form.storageSize}
                onChange={(e) => updateForm({ storageSize: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Storage Class</Label>
              <Combobox
                options={storageClassOptions}
                value={form.storageClass}
                onValueChange={(v) => updateForm({ storageClass: v })}
                placeholder="Select storage class (optional)..."
                searchPlaceholder="Search storage classes..."
                emptyMessage="No storage classes found."
                loading={storageClassesLoading}
                allowCustomValue
              />
            </div>
          </div>
        )}

        {/* Step 2: Config */}
        {step === 2 && form.engine === "postgresql" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="db-database-name">Database Name</Label>
              <Input
                id="db-database-name"
                placeholder="app"
                value={form.databaseName}
                onChange={(e) => updateForm({ databaseName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-database-owner">Database Owner</Label>
              <Input
                id="db-database-owner"
                placeholder="app"
                value={form.databaseOwner}
                onChange={(e) => updateForm({ databaseOwner: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-image-name">Image Name (optional)</Label>
              <Input
                id="db-image-name"
                placeholder="ghcr.io/cloudnative-pg/postgresql:16"
                value={form.imageName}
                onChange={(e) => updateForm({ imageName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>PostgreSQL Parameters</Label>
              <p className="text-xs text-muted-foreground">
                Custom PostgreSQL configuration parameters.
              </p>
              {form.pgParameters.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateForm({
                      pgParameters: [{ key: "", value: "" }],
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Parameter
                </Button>
              ) : (
                <KVPairEditor
                  pairs={form.pgParameters}
                  onChange={(index, patch) => {
                    const newParams = [...form.pgParameters];
                    newParams[index] = { ...newParams[index], ...patch };
                    updateForm({ pgParameters: newParams });
                  }}
                  onRemove={(index) =>
                    updateForm({
                      pgParameters: form.pgParameters.filter(
                        (_, j) => j !== index
                      ),
                    })
                  }
                  addPair={() =>
                    updateForm({
                      pgParameters: [
                        ...form.pgParameters,
                        { key: "", value: "" },
                      ],
                    })
                  }
                  keyPlaceholder="parameter"
                  valuePlaceholder="value"
                />
              )}
            </div>
          </div>
        )}

        {step === 2 && form.engine === "mariadb" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="db-port">Port</Label>
              <Input
                id="db-port"
                placeholder="3306"
                value={form.port}
                onChange={(e) => updateForm({ port: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-root-secret-name">
                Root Password Secret Name
              </Label>
              <Input
                id="db-root-secret-name"
                placeholder="mariadb-root-password"
                value={form.rootPasswordSecretName}
                onChange={(e) =>
                  updateForm({ rootPasswordSecretName: e.target.value })
                }
              />
              {errors.rootPasswordSecretName && (
                <p className="text-xs text-destructive">
                  {errors.rootPasswordSecretName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-root-secret-key">
                Root Password Secret Key
              </Label>
              <Input
                id="db-root-secret-key"
                placeholder="password"
                value={form.rootPasswordSecretKey}
                onChange={(e) =>
                  updateForm({ rootPasswordSecretKey: e.target.value })
                }
              />
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Database Preview</span>
              <Badge variant="outline">{form.name}</Badge>
            </div>

            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-muted-foreground">
                <p>
                  Engine:{" "}
                  {form.engine === "postgresql" ? "PostgreSQL (CNPG)" : "MariaDB"}
                </p>
                <p>Namespace: {form.namespace || "default"}</p>
                <p>
                  Instances: {form.instances}
                </p>
                <p>Storage: {form.storageSize}</p>
                {form.storageClass && (
                  <p>Storage Class: {form.storageClass}</p>
                )}
                {form.engine === "postgresql" && (
                  <>
                    <p>Database: {form.databaseName}</p>
                    <p>Owner: {form.databaseOwner}</p>
                    {form.imageName.trim() && (
                      <p>Image: {form.imageName}</p>
                    )}
                    {form.pgParameters.filter((p) => p.key.trim()).length >
                      0 && (
                      <p>
                        Parameters:{" "}
                        {form.pgParameters
                          .filter((p) => p.key.trim())
                          .map((p) => `${p.key}=${p.value}`)
                          .join(", ")}
                      </p>
                    )}
                  </>
                )}
                {form.engine === "mariadb" && (
                  <>
                    <p>Port: {form.port}</p>
                    <p>Root Password Secret: {form.rootPasswordSecretName}</p>
                    <p>Secret Key: {form.rootPasswordSecretKey}</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Generated Manifest (JSON)
              </Label>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                {jsonPreview}
              </pre>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 0) handleClose();
              else setStep(step - 1);
            }}
            disabled={submitting}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Database className="mr-1.5 h-4 w-4" />
                  Create Database
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
