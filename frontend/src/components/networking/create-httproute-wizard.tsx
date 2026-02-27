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
  Route,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateHTTPRouteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface HeaderMatch {
  name: string;
  value: string;
}

interface RouteMatch {
  pathType: string;
  pathValue: string;
  method: string;
  headers: HeaderMatch[];
}

interface BackendRef {
  name: string;
  port: string;
  weight: string;
}

interface RouteRule {
  matches: RouteMatch[];
  backendRefs: BackendRef[];
}

interface ParentRef {
  name: string;
  namespace: string;
  sectionName: string;
}

interface HTTPRouteForm {
  name: string;
  namespace: string;
  hostnames: string[];
  parentRefs: ParentRef[];
  rules: RouteRule[];
}

const WIZARD_STEPS = [
  { label: "Basics", description: "Name & hostnames" },
  { label: "Parents", description: "Gateway references" },
  { label: "Rules", description: "Matches & backends" },
  { label: "Review", description: "Verify & create" },
];

function emptyParentRef(): ParentRef {
  return { name: "", namespace: "", sectionName: "" };
}

function emptyMatch(): RouteMatch {
  return { pathType: "PathPrefix", pathValue: "/", method: "", headers: [] };
}

function emptyBackendRef(): BackendRef {
  return { name: "", port: "", weight: "" };
}

function emptyRule(): RouteRule {
  return {
    matches: [emptyMatch()],
    backendRefs: [emptyBackendRef()],
  };
}

const defaultForm: HTTPRouteForm = {
  name: "",
  namespace: "default",
  hostnames: [],
  parentRefs: [emptyParentRef()],
  rules: [emptyRule()],
};

function buildManifest(form: HTTPRouteForm) {
  const spec: Record<string, unknown> = {};

  if (form.hostnames.length > 0) {
    spec.hostnames = form.hostnames;
  }

  const parentRefs = form.parentRefs
    .filter((p) => p.name.trim())
    .map((p) => {
      const ref: Record<string, unknown> = { name: p.name };
      if (p.namespace.trim()) ref.namespace = p.namespace;
      if (p.sectionName.trim()) ref.sectionName = p.sectionName;
      return ref;
    });
  if (parentRefs.length > 0) {
    spec.parentRefs = parentRefs;
  }

  const rules = form.rules.map((rule) => {
    const ruleObj: Record<string, unknown> = {};

    const matches = rule.matches
      .filter((m) => m.pathValue.trim())
      .map((m) => {
        const match: Record<string, unknown> = {
          path: { type: m.pathType, value: m.pathValue },
        };
        if (m.method.trim()) {
          match.method = m.method;
        }
        const headers = m.headers.filter(
          (h) => h.name.trim() && h.value.trim()
        );
        if (headers.length > 0) {
          match.headers = headers.map((h) => ({
            name: h.name,
            value: h.value,
          }));
        }
        return match;
      });
    if (matches.length > 0) {
      ruleObj.matches = matches;
    }

    const backendRefs = rule.backendRefs
      .filter((b) => b.name.trim() && b.port.trim())
      .map((b) => {
        const ref: Record<string, unknown> = {
          name: b.name,
          port: Number(b.port),
        };
        if (b.weight.trim()) {
          ref.weight = Number(b.weight);
        }
        return ref;
      });
    if (backendRefs.length > 0) {
      ruleObj.backendRefs = backendRefs;
    }

    return ruleObj;
  });
  if (rules.length > 0) {
    spec.rules = rules;
  }

  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "HTTPRoute",
    metadata: {
      name: form.name,
      namespace: form.namespace || "default",
    },
    spec,
  };
}

export function CreateHTTPRouteWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateHTTPRouteWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<HTTPRouteForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [hostnameInput, setHostnameInput] = useState("");

  const [namespaceOptions, setNamespaceOptions] = useState<ComboboxOption[]>(
    []
  );
  const [gatewayOptions, setGatewayOptions] = useState<ComboboxOption[]>([]);
  const [serviceOptions, setServiceOptions] = useState<ComboboxOption[]>([]);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  const [loadingGateways, setLoadingGateways] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);

  useEffect(() => {
    if (!open) return;

    setLoadingNamespaces(true);
    api
      .get<{ items: Array<{ metadata: { name: string } }> }>(
        `/api/clusters/${clusterId}/resources/_/v1/namespaces`
      )
      .then((data) => {
        setNamespaceOptions(
          (data.items || []).map((item) => ({
            value: item.metadata.name,
            label: item.metadata.name,
          }))
        );
      })
      .catch(() => {
        setNamespaceOptions([]);
      })
      .finally(() => setLoadingNamespaces(false));

    setLoadingGateways(true);
    api
      .get<{
        items: Array<{ metadata: { name: string; namespace?: string } }>;
      }>(
        `/api/clusters/${clusterId}/resources/gateway.networking.k8s.io/v1/gateways`
      )
      .then((data) => {
        setGatewayOptions(
          (data.items || []).map((item) => ({
            value: item.metadata.name,
            label: item.metadata.name,
            description: item.metadata.namespace
              ? `Namespace: ${item.metadata.namespace}`
              : undefined,
          }))
        );
      })
      .catch(() => {
        setGatewayOptions([]);
      })
      .finally(() => setLoadingGateways(false));

    setLoadingServices(true);
    api
      .get<{
        items: Array<{ metadata: { name: string; namespace?: string } }>;
      }>(`/api/clusters/${clusterId}/resources/_/v1/services`)
      .then((data) => {
        setServiceOptions(
          (data.items || []).map((item) => ({
            value: item.metadata.name,
            label: item.metadata.name,
            description: item.metadata.namespace
              ? `Namespace: ${item.metadata.namespace}`
              : undefined,
          }))
        );
      })
      .catch(() => {
        setServiceOptions([]);
      })
      .finally(() => setLoadingServices(false));
  }, [open, clusterId]);

  const filteredServiceOptions = serviceOptions.filter(
    (s) =>
      !s.description ||
      s.description === `Namespace: ${form.namespace}`
  );

  function reset() {
    setStep(0);
    setForm(defaultForm);
    setSubmitting(false);
    setErrors({});
    setHostnameInput("");
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  function updateForm(patch: Partial<HTTPRouteForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function addHostname() {
    const hostname = hostnameInput.trim();
    if (!hostname) return;
    if (form.hostnames.includes(hostname)) return;
    updateForm({ hostnames: [...form.hostnames, hostname] });
    setHostnameInput("");
  }

  function removeHostname(index: number) {
    updateForm({
      hostnames: form.hostnames.filter((_, i) => i !== index),
    });
  }

  function updateParentRef(index: number, patch: Partial<ParentRef>) {
    const newRefs = [...form.parentRefs];
    newRefs[index] = { ...newRefs[index], ...patch };
    updateForm({ parentRefs: newRefs });
  }

  function updateRule(index: number, patch: Partial<RouteRule>) {
    const newRules = [...form.rules];
    newRules[index] = { ...newRules[index], ...patch };
    updateForm({ rules: newRules });
  }

  function updateMatch(
    ruleIndex: number,
    matchIndex: number,
    patch: Partial<RouteMatch>
  ) {
    const newRules = [...form.rules];
    const newMatches = [...newRules[ruleIndex].matches];
    newMatches[matchIndex] = { ...newMatches[matchIndex], ...patch };
    newRules[ruleIndex] = { ...newRules[ruleIndex], matches: newMatches };
    updateForm({ rules: newRules });
  }

  function updateMatchHeader(
    ruleIndex: number,
    matchIndex: number,
    headerIndex: number,
    patch: Partial<HeaderMatch>
  ) {
    const newRules = [...form.rules];
    const newMatches = [...newRules[ruleIndex].matches];
    const newHeaders = [...newMatches[matchIndex].headers];
    newHeaders[headerIndex] = { ...newHeaders[headerIndex], ...patch };
    newMatches[matchIndex] = { ...newMatches[matchIndex], headers: newHeaders };
    newRules[ruleIndex] = { ...newRules[ruleIndex], matches: newMatches };
    updateForm({ rules: newRules });
  }

  function updateBackendRef(
    ruleIndex: number,
    refIndex: number,
    patch: Partial<BackendRef>
  ) {
    const newRules = [...form.rules];
    const newRefs = [...newRules[ruleIndex].backendRefs];
    newRefs[refIndex] = { ...newRefs[refIndex], ...patch };
    newRules[ruleIndex] = { ...newRules[ruleIndex], backendRefs: newRefs };
    updateForm({ rules: newRules });
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
        `/api/clusters/${clusterId}/resources/gateway.networking.k8s.io/v1/httproutes?namespace=${ns}`,
        manifest
      );
      toast("HTTPRoute Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create HTTPRoute", {
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
          <DialogTitle>Create HTTPRoute</DialogTitle>
          <DialogDescription>
            Define routing rules for HTTP traffic through a Gateway.
          </DialogDescription>
        </DialogHeader>

        <ProgressSteps
          steps={WIZARD_STEPS}
          currentStep={step}
          className="py-2"
        />

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="hr-name">Route Name</Label>
              <Input
                id="hr-name"
                placeholder="my-http-route"
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
                loading={loadingNamespaces}
                allowCustomValue
              />
              {errors.namespace && (
                <p className="text-xs text-destructive">{errors.namespace}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Hostnames</Label>
              <p className="text-xs text-muted-foreground">
                Optional list of hostnames to match for this route.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="example.com"
                  value={hostnameInput}
                  onChange={(e) => setHostnameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHostname();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addHostname}
                  disabled={!hostnameInput.trim()}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
              {form.hostnames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.hostnames.map((hostname, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {hostname}
                      <button
                        onClick={() => removeHostname(i)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Parent Refs */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Parent Gateway References</h3>
                <p className="text-xs text-muted-foreground">
                  Reference one or more Gateways this route attaches to.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  updateForm({
                    parentRefs: [...form.parentRefs, emptyParentRef()],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Parent
              </Button>
            </div>

            {form.parentRefs.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                No parent references. Add a Gateway reference for this route.
              </p>
            )}

            <div className="space-y-3">
              {form.parentRefs.map((ref, i) => (
                <div key={i} className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Parent Ref #{i + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateForm({
                          parentRefs: form.parentRefs.filter(
                            (_, j) => j !== i
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Gateway Name</Label>
                    <Combobox
                      options={gatewayOptions}
                      value={ref.name}
                      onValueChange={(v) => updateParentRef(i, { name: v })}
                      placeholder="Select gateway..."
                      searchPlaceholder="Search gateways..."
                      loading={loadingGateways}
                      allowCustomValue
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Namespace (optional)</Label>
                    <Input
                      placeholder="gateway-namespace"
                      value={ref.namespace}
                      onChange={(e) =>
                        updateParentRef(i, { namespace: e.target.value })
                      }
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Section Name (optional)</Label>
                    <Input
                      placeholder="http"
                      value={ref.sectionName}
                      onChange={(e) =>
                        updateParentRef(i, { sectionName: e.target.value })
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Rules */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Routing Rules</h3>
                <p className="text-xs text-muted-foreground">
                  Define match conditions and backend targets for each rule.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  updateForm({ rules: [...form.rules, emptyRule()] })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Rule
              </Button>
            </div>

            {form.rules.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                No routing rules. Add at least one rule with match conditions
                and backends.
              </p>
            )}

            <div className="space-y-4">
              {form.rules.map((rule, ri) => (
                <div key={ri} className="rounded-md border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Rule #{ri + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateForm({
                          rules: form.rules.filter((_, j) => j !== ri),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>

                  {/* Matches */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Matches</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateRule(ri, {
                            matches: [...rule.matches, emptyMatch()],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Match
                      </Button>
                    </div>

                    {rule.matches.map((match, mi) => (
                      <div
                        key={mi}
                        className="rounded border bg-muted/30 p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Match #{mi + 1}
                          </span>
                          {rule.matches.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                updateRule(ri, {
                                  matches: rule.matches.filter(
                                    (_, j) => j !== mi
                                  ),
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Path Type</Label>
                            <Select
                              value={match.pathType}
                              onValueChange={(v) =>
                                updateMatch(ri, mi, { pathType: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PathPrefix">
                                  PathPrefix
                                </SelectItem>
                                <SelectItem value="Exact">Exact</SelectItem>
                                <SelectItem value="RegularExpression">
                                  RegularExpression
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Path Value</Label>
                            <Input
                              placeholder="/"
                              value={match.pathValue}
                              onChange={(e) =>
                                updateMatch(ri, mi, {
                                  pathValue: e.target.value,
                                })
                              }
                              className="font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">
                            Method (optional)
                          </Label>
                          <Select
                            value={match.method || "__none__"}
                            onValueChange={(v) =>
                              updateMatch(ri, mi, {
                                method: v === "__none__" ? "" : v,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Any method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                Any method
                              </SelectItem>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                              <SelectItem value="PUT">PUT</SelectItem>
                              <SelectItem value="DELETE">DELETE</SelectItem>
                              <SelectItem value="PATCH">PATCH</SelectItem>
                              <SelectItem value="HEAD">HEAD</SelectItem>
                              <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Headers */}
                        <div className="space-y-2">
                          <Label className="text-xs">
                            Headers (optional)
                          </Label>
                          {match.headers.map((header, hi) => (
                            <div
                              key={hi}
                              className="flex items-center gap-2"
                            >
                              <Input
                                placeholder="header-name"
                                value={header.name}
                                onChange={(e) =>
                                  updateMatchHeader(ri, mi, hi, {
                                    name: e.target.value,
                                  })
                                }
                                className="flex-1 font-mono text-xs"
                              />
                              <span className="text-muted-foreground">:</span>
                              <Input
                                placeholder="value"
                                value={header.value}
                                onChange={(e) =>
                                  updateMatchHeader(ri, mi, hi, {
                                    value: e.target.value,
                                  })
                                }
                                className="flex-1 font-mono text-xs"
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  const newHeaders = match.headers.filter(
                                    (_, j) => j !== hi
                                  );
                                  updateMatch(ri, mi, {
                                    headers: newHeaders,
                                  });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateMatch(ri, mi, {
                                headers: [
                                  ...match.headers,
                                  { name: "", value: "" },
                                ],
                              })
                            }
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Add Header
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Backend Refs */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Backend Refs
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateRule(ri, {
                            backendRefs: [
                              ...rule.backendRefs,
                              emptyBackendRef(),
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Backend
                      </Button>
                    </div>

                    {rule.backendRefs.map((backend, bi) => (
                      <div
                        key={bi}
                        className="flex items-start gap-2 rounded border bg-muted/30 p-3"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Service</Label>
                            <Combobox
                              options={filteredServiceOptions}
                              value={backend.name}
                              onValueChange={(v) =>
                                updateBackendRef(ri, bi, { name: v })
                              }
                              placeholder="Select service..."
                              searchPlaceholder="Search services..."
                              loading={loadingServices}
                              allowCustomValue
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Port</Label>
                              <Input
                                placeholder="80"
                                value={backend.port}
                                onChange={(e) =>
                                  updateBackendRef(ri, bi, {
                                    port: e.target.value,
                                  })
                                }
                                className="font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                Weight (optional)
                              </Label>
                              <Input
                                placeholder="1"
                                value={backend.weight}
                                onChange={(e) =>
                                  updateBackendRef(ri, bi, {
                                    weight: e.target.value,
                                  })
                                }
                                className="font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>
                        {rule.backendRefs.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mt-6"
                            onClick={() =>
                              updateRule(ri, {
                                backendRefs: rule.backendRefs.filter(
                                  (_, j) => j !== bi
                                ),
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">HTTPRoute Preview</span>
              <Badge variant="outline">{form.name}</Badge>
            </div>

            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-muted-foreground">
                <p>Namespace: {form.namespace || "default"}</p>
                <p>
                  Hostnames:{" "}
                  {form.hostnames.length > 0
                    ? form.hostnames.join(", ")
                    : "(any)"}
                </p>
                <p>
                  Parent Refs:{" "}
                  {form.parentRefs
                    .filter((p) => p.name.trim())
                    .map((p) => p.name)
                    .join(", ") || "(none)"}
                </p>
                <p>Rules: {form.rules.length}</p>
                <p>
                  Total Backend Refs:{" "}
                  {form.rules.reduce(
                    (sum, r) =>
                      sum +
                      r.backendRefs.filter((b) => b.name.trim() && b.port.trim())
                        .length,
                    0
                  )}
                </p>
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
                  <Route className="mr-1.5 h-4 w-4" />
                  Create HTTPRoute
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
