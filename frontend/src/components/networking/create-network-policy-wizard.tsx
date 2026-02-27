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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressSteps } from "@/components/ui/progress-steps";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateNetworkPolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface LabelPair {
  key: string;
  value: string;
}

interface PortRule {
  protocol: string;
  port: string;
}

interface IngressRule {
  podSelectorLabels: LabelPair[];
  namespaceSelectorLabels: LabelPair[];
  ipBlock: string;
  ports: PortRule[];
}

interface EgressRule {
  podSelectorLabels: LabelPair[];
  namespaceSelectorLabels: LabelPair[];
  ipBlock: string;
  ports: PortRule[];
}

interface PolicyForm {
  name: string;
  namespace: string;
  podSelectorLabels: LabelPair[];
  ingressRules: IngressRule[];
  egressRules: EgressRule[];
  policyTypes: string[];
}

const WIZARD_STEPS = [
  { label: "Basics", description: "Name & selector" },
  { label: "Ingress", description: "Inbound rules" },
  { label: "Egress", description: "Outbound rules" },
  { label: "Review", description: "YAML preview" },
];

function emptyIngressRule(): IngressRule {
  return {
    podSelectorLabels: [],
    namespaceSelectorLabels: [],
    ipBlock: "",
    ports: [],
  };
}

function emptyEgressRule(): EgressRule {
  return {
    podSelectorLabels: [],
    namespaceSelectorLabels: [],
    ipBlock: "",
    ports: [],
  };
}

const defaultForm: PolicyForm = {
  name: "",
  namespace: "default",
  podSelectorLabels: [{ key: "", value: "" }],
  ingressRules: [],
  egressRules: [],
  policyTypes: [],
};

function labelsToSelector(labels: LabelPair[]): Record<string, string> | undefined {
  const filtered = labels.filter((l) => l.key.trim());
  if (filtered.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const l of filtered) result[l.key] = l.value;
  return result;
}

function buildManifest(form: PolicyForm) {
  const policyTypes: string[] = [];
  if (form.ingressRules.length > 0 || form.policyTypes.includes("Ingress")) {
    policyTypes.push("Ingress");
  }
  if (form.egressRules.length > 0 || form.policyTypes.includes("Egress")) {
    policyTypes.push("Egress");
  }

  const podSelector: Record<string, unknown> = {};
  const podLabels = labelsToSelector(form.podSelectorLabels);
  if (podLabels) podSelector.matchLabels = podLabels;

  const ingress = form.ingressRules.map((rule) => {
    const from: Array<Record<string, unknown>> = [];
    const podLabels = labelsToSelector(rule.podSelectorLabels);
    const nsLabels = labelsToSelector(rule.namespaceSelectorLabels);

    if (podLabels || nsLabels) {
      const peer: Record<string, unknown> = {};
      if (podLabels) peer.podSelector = { matchLabels: podLabels };
      if (nsLabels) peer.namespaceSelector = { matchLabels: nsLabels };
      from.push(peer);
    }

    if (rule.ipBlock.trim()) {
      from.push({ ipBlock: { cidr: rule.ipBlock.trim() } });
    }

    const ports = rule.ports
      .filter((p) => p.port.trim())
      .map((p) => ({
        protocol: p.protocol,
        port: isNaN(Number(p.port)) ? p.port : Number(p.port),
      }));

    return {
      ...(from.length > 0 ? { from } : {}),
      ...(ports.length > 0 ? { ports } : {}),
    };
  });

  const egress = form.egressRules.map((rule) => {
    const to: Array<Record<string, unknown>> = [];
    const podLabels = labelsToSelector(rule.podSelectorLabels);
    const nsLabels = labelsToSelector(rule.namespaceSelectorLabels);

    if (podLabels || nsLabels) {
      const peer: Record<string, unknown> = {};
      if (podLabels) peer.podSelector = { matchLabels: podLabels };
      if (nsLabels) peer.namespaceSelector = { matchLabels: nsLabels };
      to.push(peer);
    }

    if (rule.ipBlock.trim()) {
      to.push({ ipBlock: { cidr: rule.ipBlock.trim() } });
    }

    const ports = rule.ports
      .filter((p) => p.port.trim())
      .map((p) => ({
        protocol: p.protocol,
        port: isNaN(Number(p.port)) ? p.port : Number(p.port),
      }));

    return {
      ...(to.length > 0 ? { to } : {}),
      ...(ports.length > 0 ? { ports } : {}),
    };
  });

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: form.name,
      namespace: form.namespace || "default",
    },
    spec: {
      podSelector,
      policyTypes: policyTypes.length > 0 ? policyTypes : ["Ingress"],
      ...(ingress.length > 0 ? { ingress } : {}),
      ...(egress.length > 0 ? { egress } : {}),
    },
  };
}

function LabelPairEditor({
  labels,
  onChange,
  onRemove,
  addLabel,
}: {
  labels: LabelPair[];
  onChange: (index: number, patch: Partial<LabelPair>) => void;
  onRemove: (index: number) => void;
  addLabel: () => void;
}) {
  return (
    <div className="space-y-2">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="key"
            value={label.key}
            onChange={(e) => onChange(i, { key: e.target.value })}
            className="flex-1 font-mono text-xs"
          />
          <span className="text-muted-foreground">=</span>
          <Input
            placeholder="value"
            value={label.value}
            onChange={(e) => onChange(i, { value: e.target.value })}
            className="flex-1 font-mono text-xs"
          />
          {labels.length > 1 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(i)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addLabel}>
        <Plus className="mr-1 h-3 w-3" />
        Add Label
      </Button>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
  direction,
}: {
  rule: IngressRule | EgressRule;
  onChange: (patch: Partial<IngressRule>) => void;
  onRemove: () => void;
  direction: "ingress" | "egress";
}) {
  const dirLabel = direction === "ingress" ? "Source" : "Destination";

  function updatePodLabel(index: number, patch: Partial<LabelPair>) {
    if (index === -1) return; // Full replace handled below
    const newLabels = [...rule.podSelectorLabels];
    newLabels[index] = { ...newLabels[index], ...patch };
    onChange({ podSelectorLabels: newLabels });
  }

  function updateNsLabel(index: number, patch: Partial<LabelPair>) {
    if (index === -1) return;
    const newLabels = [...rule.namespaceSelectorLabels];
    newLabels[index] = { ...newLabels[index], ...patch };
    onChange({ namespaceSelectorLabels: newLabels });
  }

  function updatePort(index: number, patch: Partial<PortRule>) {
    const newPorts = [...rule.ports];
    newPorts[index] = { ...newPorts[index], ...patch };
    onChange({ ports: newPorts });
  }

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {direction === "ingress" ? "Ingress" : "Egress"} Rule
        </span>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Remove
        </Button>
      </div>

      {/* Pod Selector */}
      <div className="space-y-2">
        <Label className="text-xs">{dirLabel} Pod Selector Labels</Label>
        {rule.podSelectorLabels.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({ podSelectorLabels: [{ key: "", value: "" }] })
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Pod Selector
          </Button>
        ) : (
          <>
            {rule.podSelectorLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="key"
                  value={label.key}
                  onChange={(e) =>
                    updatePodLabel(i, { key: e.target.value })
                  }
                  className="flex-1 font-mono text-xs"
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  placeholder="value"
                  value={label.value}
                  onChange={(e) =>
                    updatePodLabel(i, { value: e.target.value })
                  }
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    onChange({
                      podSelectorLabels: rule.podSelectorLabels.filter(
                        (_, j) => j !== i
                      ),
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  podSelectorLabels: [
                    ...rule.podSelectorLabels,
                    { key: "", value: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Label
            </Button>
          </>
        )}
      </div>

      {/* Namespace Selector */}
      <div className="space-y-2">
        <Label className="text-xs">{dirLabel} Namespace Selector Labels</Label>
        {rule.namespaceSelectorLabels.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                namespaceSelectorLabels: [{ key: "", value: "" }],
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Namespace Selector
          </Button>
        ) : (
          <>
            {rule.namespaceSelectorLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="key"
                  value={label.key}
                  onChange={(e) =>
                    updateNsLabel(i, { key: e.target.value })
                  }
                  className="flex-1 font-mono text-xs"
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  placeholder="value"
                  value={label.value}
                  onChange={(e) =>
                    updateNsLabel(i, { value: e.target.value })
                  }
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    onChange({
                      namespaceSelectorLabels:
                        rule.namespaceSelectorLabels.filter(
                          (_, j) => j !== i
                        ),
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  namespaceSelectorLabels: [
                    ...rule.namespaceSelectorLabels,
                    { key: "", value: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Label
            </Button>
          </>
        )}
      </div>

      {/* IP Block */}
      <div className="space-y-2">
        <Label className="text-xs">IP Block CIDR</Label>
        <Input
          placeholder="10.0.0.0/24"
          value={rule.ipBlock}
          onChange={(e) => onChange({ ipBlock: e.target.value })}
          className="font-mono text-xs"
        />
      </div>

      {/* Ports */}
      <div className="space-y-2">
        <Label className="text-xs">Ports</Label>
        {rule.ports.map((port, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={port.protocol}
              onValueChange={(v) => updatePort(i, { protocol: v })}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TCP">TCP</SelectItem>
                <SelectItem value="UDP">UDP</SelectItem>
                <SelectItem value="SCTP">SCTP</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="80"
              value={port.port}
              onChange={(e) => updatePort(i, { port: e.target.value })}
              className="flex-1 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                onChange({
                  ports: rule.ports.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ports: [...rule.ports, { protocol: "TCP", port: "" }],
            })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Port
        </Button>
      </div>
    </div>
  );
}

export function CreateNetworkPolicyWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateNetworkPolicyWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PolicyForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  function updateForm(patch: Partial<PolicyForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updatePodSelectorLabel(index: number, patch: Partial<LabelPair>) {
    if (index === -1) return;
    const newLabels = [...form.podSelectorLabels];
    newLabels[index] = { ...newLabels[index], ...patch };
    updateForm({ podSelectorLabels: newLabels });
  }

  function updateIngressRule(index: number, patch: Partial<IngressRule>) {
    const newRules = [...form.ingressRules];
    newRules[index] = { ...newRules[index], ...patch };
    updateForm({ ingressRules: newRules });
  }

  function updateEgressRule(index: number, patch: Partial<EgressRule>) {
    const newRules = [...form.egressRules];
    newRules[index] = { ...newRules[index], ...patch };
    updateForm({ egressRules: newRules });
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return form.name.trim().length > 0 && form.namespace.trim().length > 0;
      case 1:
      case 2:
      case 3:
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
        `/api/clusters/${clusterId}/resources/networking.k8s.io/v1/networkpolicies?namespace=${ns}`,
        manifest
      );
      toast("Network Policy Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create Network Policy", {
        description: "Check cluster connectivity and permissions.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const manifest = buildManifest(form);
  const yamlPreview = JSON.stringify(manifest, null, 2);

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
          <DialogTitle>Create Network Policy</DialogTitle>
          <DialogDescription>
            Define ingress and egress rules to control traffic flow.
          </DialogDescription>
        </DialogHeader>

        <ProgressSteps steps={WIZARD_STEPS} currentStep={step} className="py-2" />

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="np-name">Policy Name</Label>
              <Input
                id="np-name"
                placeholder="deny-all-ingress"
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
              <Label htmlFor="np-namespace">Namespace</Label>
              <Input
                id="np-namespace"
                placeholder="default"
                value={form.namespace}
                onChange={(e) => updateForm({ namespace: e.target.value })}
              />
              {errors.namespace && (
                <p className="text-xs text-destructive">{errors.namespace}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Pod Selector Labels</Label>
              <p className="text-xs text-muted-foreground">
                Select which pods this policy applies to. Leave empty to select all pods.
              </p>
              <LabelPairEditor
                labels={form.podSelectorLabels}
                onChange={updatePodSelectorLabel}
                onRemove={(index) =>
                  updateForm({
                    podSelectorLabels: form.podSelectorLabels.filter(
                      (_, j) => j !== index
                    ),
                  })
                }
                addLabel={() =>
                  updateForm({
                    podSelectorLabels: [
                      ...form.podSelectorLabels,
                      { key: "", value: "" },
                    ],
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Step 1: Ingress Rules */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Ingress Rules</h3>
                <p className="text-xs text-muted-foreground">
                  Define allowed inbound traffic sources. No rules means all ingress is denied.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  updateForm({
                    ingressRules: [...form.ingressRules, emptyIngressRule()],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Rule
              </Button>
            </div>

            {form.ingressRules.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                No ingress rules. All inbound traffic will be denied if Ingress policy type is set.
              </p>
            )}

            <div className="space-y-3">
              {form.ingressRules.map((rule, i) => (
                <RuleEditor
                  key={i}
                  rule={rule}
                  direction="ingress"
                  onChange={(patch) => updateIngressRule(i, patch)}
                  onRemove={() =>
                    updateForm({
                      ingressRules: form.ingressRules.filter(
                        (_, j) => j !== i
                      ),
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Egress Rules */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Egress Rules</h3>
                <p className="text-xs text-muted-foreground">
                  Define allowed outbound traffic destinations. No rules means all egress is denied.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  updateForm({
                    egressRules: [...form.egressRules, emptyEgressRule()],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Rule
              </Button>
            </div>

            {form.egressRules.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                No egress rules. All outbound traffic will be denied if Egress policy type is set.
              </p>
            )}

            <div className="space-y-3">
              {form.egressRules.map((rule, i) => (
                <RuleEditor
                  key={i}
                  rule={rule}
                  direction="egress"
                  onChange={(patch) => updateEgressRule(i, patch)}
                  onRemove={() =>
                    updateForm({
                      egressRules: form.egressRules.filter(
                        (_, j) => j !== i
                      ),
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Network Policy Preview</span>
              <Badge variant="outline">{form.name}</Badge>
            </div>

            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-muted-foreground">
                <p>Namespace: {form.namespace || "default"}</p>
                <p>
                  Pod Selector:{" "}
                  {form.podSelectorLabels
                    .filter((l) => l.key.trim())
                    .map((l) => `${l.key}=${l.value}`)
                    .join(", ") || "(all pods)"}
                </p>
                <p>
                  Policy Types:{" "}
                  {[
                    ...(form.ingressRules.length > 0 ? ["Ingress"] : []),
                    ...(form.egressRules.length > 0 ? ["Egress"] : []),
                  ].join(", ") || "Ingress"}
                </p>
                <p>Ingress Rules: {form.ingressRules.length}</p>
                <p>Egress Rules: {form.egressRules.length}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Generated Manifest (JSON)
              </Label>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                {yamlPreview}
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
                  <Shield className="mr-1.5 h-4 w-4" />
                  Create Policy
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
