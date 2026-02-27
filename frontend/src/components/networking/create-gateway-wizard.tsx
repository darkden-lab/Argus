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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  DoorOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateGatewayWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface Listener {
  name: string;
  port: string;
  protocol: string;
  hostname: string;
  tlsMode: string;
  certificateRef: string;
}

interface GatewayForm {
  name: string;
  namespace: string;
  gatewayClassName: string;
  listeners: Listener[];
}

const WIZARD_STEPS = [
  { label: "Basics", description: "Name & gateway class" },
  { label: "Listeners", description: "Ports & protocols" },
  { label: "Review", description: "Verify & create" },
];

function defaultListener(): Listener {
  return {
    name: "http",
    port: "80",
    protocol: "HTTP",
    hostname: "",
    tlsMode: "Terminate",
    certificateRef: "",
  };
}

const defaultForm: GatewayForm = {
  name: "",
  namespace: "default",
  gatewayClassName: "",
  listeners: [defaultListener()],
};

function buildManifest(form: GatewayForm) {
  const listeners = form.listeners.map((l) => {
    const listener: Record<string, unknown> = {
      name: l.name,
      port: Number(l.port),
      protocol: l.protocol,
    };

    if (l.hostname.trim()) {
      listener.hostname = l.hostname.trim();
    }

    if (l.protocol === "HTTPS" || l.protocol === "TLS") {
      listener.tls = {
        mode: l.tlsMode,
        ...(l.certificateRef.trim()
          ? { certificateRefs: [{ name: l.certificateRef.trim() }] }
          : {}),
      };
    }

    return listener;
  });

  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: {
      name: form.name,
      namespace: form.namespace || "default",
    },
    spec: {
      gatewayClassName: form.gatewayClassName,
      listeners,
    },
  };
}

export function CreateGatewayWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateGatewayWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<GatewayForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [namespaceOptions, setNamespaceOptions] = useState<ComboboxOption[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  const [gatewayClassOptions, setGatewayClassOptions] = useState<ComboboxOption[]>([]);
  const [gatewayClassesLoading, setGatewayClassesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setNamespacesLoading(true);
    api
      .get<{ items: Array<{ metadata: { name: string } }> }>(
        `/api/clusters/${clusterId}/resources/_/v1/namespaces`
      )
      .then((data) => {
        const opts = (data.items || []).map((item) => ({
          value: item.metadata.name,
          label: item.metadata.name,
        }));
        setNamespaceOptions(opts);
      })
      .catch(() => {
        setNamespaceOptions([]);
      })
      .finally(() => {
        setNamespacesLoading(false);
      });

    setGatewayClassesLoading(true);
    api
      .get<{ items: Array<{ metadata: { name: string } }> }>(
        `/api/clusters/${clusterId}/resources/gateway.networking.k8s.io/v1/gatewayclasses`
      )
      .then((data) => {
        const opts = (data.items || []).map((item) => ({
          value: item.metadata.name,
          label: item.metadata.name,
        }));
        setGatewayClassOptions(opts);
      })
      .catch(() => {
        setGatewayClassOptions([]);
      })
      .finally(() => {
        setGatewayClassesLoading(false);
      });
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

  function updateForm(patch: Partial<GatewayForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updateListener(index: number, patch: Partial<Listener>) {
    const newListeners = [...form.listeners];
    newListeners[index] = { ...newListeners[index], ...patch };
    updateForm({ listeners: newListeners });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(form.name)) {
      newErrors.name = "Must be a valid DNS name";
    }
    if (!form.namespace.trim()) {
      newErrors.namespace = "Namespace is required";
    }
    if (!form.gatewayClassName.trim()) {
      newErrors.gatewayClassName = "Gateway class is required";
    }
    if (form.listeners.length === 0) {
      newErrors.listeners = "At least one listener is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return (
          form.name.trim().length > 0 &&
          form.namespace.trim().length > 0 &&
          form.gatewayClassName.trim().length > 0
        );
      case 1:
        return form.listeners.length > 0;
      case 2:
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    if (!validate()) {
      setStep(0);
      return;
    }

    setSubmitting(true);
    const ns = form.namespace || "default";
    const manifest = buildManifest(form);

    try {
      await api.post(
        `/api/clusters/${clusterId}/resources/gateway.networking.k8s.io/v1/gateways?namespace=${ns}`,
        manifest
      );
      toast("Gateway Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create Gateway", {
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
          <DialogTitle>Create Gateway</DialogTitle>
          <DialogDescription>
            Configure a Kubernetes Gateway resource with listeners and TLS settings.
          </DialogDescription>
        </DialogHeader>

        <ProgressSteps steps={WIZARD_STEPS} currentStep={step} className="py-2" />

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="gw-name">Gateway Name</Label>
              <Input
                id="gw-name"
                placeholder="my-gateway"
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
              <Label>Gateway Class</Label>
              <Combobox
                options={gatewayClassOptions}
                value={form.gatewayClassName}
                onValueChange={(v) => updateForm({ gatewayClassName: v })}
                placeholder="Select gateway class..."
                searchPlaceholder="Search gateway classes..."
                emptyMessage="No gateway classes found."
                loading={gatewayClassesLoading}
                allowCustomValue
              />
              {errors.gatewayClassName && (
                <p className="text-xs text-destructive">{errors.gatewayClassName}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Listeners */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Listeners</h3>
                <p className="text-xs text-muted-foreground">
                  Define ports, protocols, and optional TLS configuration for each listener.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  updateForm({
                    listeners: [
                      ...form.listeners,
                      {
                        name: "",
                        port: "",
                        protocol: "HTTP",
                        hostname: "",
                        tlsMode: "Terminate",
                        certificateRef: "",
                      },
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Listener
              </Button>
            </div>

            {form.listeners.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                No listeners configured. Add at least one listener for the gateway.
              </p>
            )}

            {errors.listeners && (
              <p className="text-xs text-destructive">{errors.listeners}</p>
            )}

            <div className="space-y-3">
              {form.listeners.map((listener, i) => (
                <div key={i} className="rounded-md border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Listener {i + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateForm({
                          listeners: form.listeners.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Name</Label>
                      <Input
                        placeholder="http"
                        value={listener.name}
                        onChange={(e) =>
                          updateListener(i, {
                            name: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9.-]/g, "-"),
                          })
                        }
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Port</Label>
                      <Input
                        placeholder="80"
                        value={listener.port}
                        onChange={(e) =>
                          updateListener(i, { port: e.target.value })
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Protocol</Label>
                      <Select
                        value={listener.protocol}
                        onValueChange={(v) =>
                          updateListener(i, { protocol: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HTTP">HTTP</SelectItem>
                          <SelectItem value="HTTPS">HTTPS</SelectItem>
                          <SelectItem value="TLS">TLS</SelectItem>
                          <SelectItem value="TCP">TCP</SelectItem>
                          <SelectItem value="UDP">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Hostname (optional)</Label>
                      <Input
                        placeholder="*.example.com"
                        value={listener.hostname}
                        onChange={(e) =>
                          updateListener(i, { hostname: e.target.value })
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  {(listener.protocol === "HTTPS" ||
                    listener.protocol === "TLS") && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">TLS Mode</Label>
                        <Select
                          value={listener.tlsMode}
                          onValueChange={(v) =>
                            updateListener(i, { tlsMode: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Terminate">Terminate</SelectItem>
                            <SelectItem value="Passthrough">
                              Passthrough
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Certificate Ref</Label>
                        <Input
                          placeholder="my-cert-secret"
                          value={listener.certificateRef}
                          onChange={(e) =>
                            updateListener(i, {
                              certificateRef: e.target.value,
                            })
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Gateway Preview</span>
              <Badge variant="outline">{form.name}</Badge>
            </div>

            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-muted-foreground">
                <p>Namespace: {form.namespace || "default"}</p>
                <p>Gateway Class: {form.gatewayClassName}</p>
                <p>Listeners: {form.listeners.length}</p>
                {form.listeners.map((l, i) => (
                  <p key={i} className="ml-4">
                    - {l.name}: {l.protocol} :{l.port}
                    {l.hostname ? ` (${l.hostname})` : ""}
                    {(l.protocol === "HTTPS" || l.protocol === "TLS")
                      ? ` [TLS: ${l.tlsMode}]`
                      : ""}
                  </p>
                ))}
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

          {step < 2 ? (
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
                  <DoorOpen className="mr-1.5 h-4 w-4" />
                  Create Gateway
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
