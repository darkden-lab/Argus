"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { useClusterStore } from "@/stores/cluster";
import { ClusterSelector } from "@/components/layout/cluster-selector";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Container,
  Globe,
  Loader2,
  Minus,
  Network,
  Plus,
  Rocket,
  Settings2,
  Trash2,
} from "lucide-react";
import yaml from "js-yaml";

interface EnvVar {
  key: string;
  value: string;
}

interface DeployConfig {
  name: string;
  namespace: string;
  image: string;
  replicas: number;
  ports: number[];
  envVars: EnvVar[];
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer";
  ingressHost: string;
  ingressEnabled: boolean;
}

interface HelmConfig {
  releaseName: string;
  chartRef: string;
  repoURL: string;
  namespace: string;
  values: string;
}

type DeployMethod = "container" | "helm";

const CONTAINER_STEPS = [
  { label: "Method" },
  { label: "Configure" },
  { label: "Networking" },
  { label: "Review" },
  { label: "Deploy" },
];

const HELM_STEPS = [
  { label: "Method" },
  { label: "Configure" },
  { label: "Review" },
  { label: "Deploy" },
];

const defaultHelmConfig: HelmConfig = {
  releaseName: "",
  chartRef: "",
  repoURL: "",
  namespace: "default",
  values: "",
};

const defaultConfig: DeployConfig = {
  name: "",
  namespace: "default",
  image: "",
  replicas: 1,
  ports: [80],
  envVars: [],
  serviceType: "ClusterIP",
  ingressHost: "",
  ingressEnabled: false,
};

export default function DeployAppPage() {
  const router = useRouter();
  const clusters = useClusterStore((s) => s.clusters);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId) ?? "";
  const setSelectedClusterId = useClusterStore((s) => s.setSelectedClusterId);
  const clustersLoading = useClusterStore((s) => s.loading);
  const fetchClusters = useClusterStore((s) => s.fetchClusters);

  useEffect(() => {
    if (clusters.length === 0) fetchClusters();
  }, [clusters.length, fetchClusters]);

  const [method, setMethod] = useState<DeployMethod | null>(null);
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<DeployConfig>(defaultConfig);
  const [helmConfig, setHelmConfig] = useState<HelmConfig>(defaultHelmConfig);
  const [helmValuesError, setHelmValuesError] = useState<string | null>(null);
  const [helmPluginEnabled, setHelmPluginEnabled] = useState<boolean | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<"success" | "error" | null>(
    null
  );

  const checkHelmPlugin = useCallback(async () => {
    if (helmPluginEnabled !== null) return;
    try {
      await api.get("/api/plugins/helm/status");
      setHelmPluginEnabled(true);
    } catch {
      setHelmPluginEnabled(false);
    }
  }, [helmPluginEnabled]);

  function updateConfig(patch: Partial<DeployConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  function updateHelmConfig(patch: Partial<HelmConfig>) {
    setHelmConfig((prev) => ({ ...prev, ...patch }));
  }

  function validateHelmValues(val: string) {
    if (!val.trim()) {
      setHelmValuesError(null);
      return;
    }
    try {
      yaml.load(val);
      setHelmValuesError(null);
    } catch (err) {
      setHelmValuesError(err instanceof Error ? err.message : "Invalid YAML");
    }
  }

  const steps = method === "helm" ? HELM_STEPS : CONTAINER_STEPS;
  const deployStepIdx = method === "helm" ? 3 : 4;
  const reviewStepIdx = method === "helm" ? 2 : 3;

  function canProceed(): boolean {
    if (method === "helm") {
      switch (step) {
        case 0: return true;
        case 1: return helmConfig.releaseName.length > 0 && helmConfig.chartRef.length > 0 && !helmValuesError;
        case 2: return true;
        default: return false;
      }
    }
    switch (step) {
      case 0:
        return true;
      case 1:
        return config.name.length > 0 && config.image.length > 0;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  }

  function handleNext() {
    if (step < deployStepIdx) setStep(step + 1);
    if (step === reviewStepIdx) {
      if (method === "helm") {
        handleHelmDeploy();
      } else {
        handleDeploy();
      }
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
    if (step === 1) setMethod(null);
  }

  async function handleHelmDeploy() {
    if (!selectedClusterId) {
      toast("No cluster selected", { variant: "error" });
      return;
    }
    setDeploying(true);
    setStep(3);

    let parsedValues: Record<string, unknown> = {};
    if (helmConfig.values.trim()) {
      try {
        parsedValues = yaml.load(helmConfig.values) as Record<string, unknown>;
      } catch {
        // Already validated
      }
    }

    try {
      await api.post(`/api/plugins/helm/${selectedClusterId}/releases`, {
        releaseName: helmConfig.releaseName,
        chartRef: helmConfig.chartRef,
        repoURL: helmConfig.repoURL,
        namespace: helmConfig.namespace || "default",
        values: parsedValues,
      });
      setDeployResult("success");
      toast("Helm release deployed", {
        description: `${helmConfig.releaseName} deployed successfully`,
        variant: "success",
      });
    } catch {
      setDeployResult("error");
    } finally {
      setDeploying(false);
    }
  }

  async function handleDeploy() {
    if (!selectedClusterId) {
      toast("No cluster selected", { variant: "error" });
      return;
    }

    setDeploying(true);
    setStep(4);

    const ns = config.namespace || "default";
    const containerPorts = config.ports
      .filter((p) => p > 0)
      .map((p) => ({ containerPort: p, protocol: "TCP" }));

    const envVars = config.envVars
      .filter((e) => e.key.length > 0)
      .map((e) => ({ name: e.key, value: e.value }));

    const labels = { app: config.name };

    try {
      // Create Deployment
      await api.post(
        `/api/clusters/${selectedClusterId}/resources/apps/v1/deployments?namespace=${ns}`,
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { name: config.name, namespace: ns, labels },
          spec: {
            replicas: config.replicas,
            selector: { matchLabels: labels },
            template: {
              metadata: { labels },
              spec: {
                containers: [
                  {
                    name: config.name,
                    image: config.image,
                    ports: containerPorts,
                    ...(envVars.length > 0 ? { env: envVars } : {}),
                  },
                ],
              },
            },
          },
        }
      );

      // Create Service
      if (config.ports.length > 0) {
        const svcPorts = config.ports
          .filter((p) => p > 0)
          .map((p, i) => ({
            name: `port-${i}`,
            port: p,
            targetPort: p,
            protocol: "TCP",
          }));

        await api.post(
          `/api/clusters/${selectedClusterId}/resources/_/v1/services?namespace=${ns}`,
          {
            apiVersion: "v1",
            kind: "Service",
            metadata: { name: config.name, namespace: ns, labels },
            spec: {
              type: config.serviceType,
              selector: labels,
              ports: svcPorts,
            },
          }
        );
      }

      // Create Ingress (if enabled)
      if (config.ingressEnabled && config.ingressHost) {
        await api.post(
          `/api/clusters/${selectedClusterId}/resources/networking.k8s.io/v1/ingresses?namespace=${ns}`,
          {
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: { name: config.name, namespace: ns, labels },
            spec: {
              rules: [
                {
                  host: config.ingressHost,
                  http: {
                    paths: [
                      {
                        path: "/",
                        pathType: "Prefix",
                        backend: {
                          service: {
                            name: config.name,
                            port: {
                              number:
                                config.ports[0] > 0 ? config.ports[0] : 80,
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          }
        );
      }

      setDeployResult("success");
      toast("Deployment created", {
        description: `${config.name} deployed successfully`,
        variant: "success",
      });
    } catch {
      setDeployResult("error");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/apps")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Deploy New App
            </h1>
            <p className="text-muted-foreground">
              Deploy a container image or Helm chart to your cluster.
            </p>
          </div>
        </div>
        <ClusterSelector
          clusters={clusters}
          selectedClusterId={selectedClusterId}
          onClusterChange={setSelectedClusterId}
          loading={clustersLoading}
        />
      </div>

      {/* Progress Steps */}
      <ProgressSteps steps={steps} currentStep={step} className="max-w-xl mx-auto" />

      {/* Step Content */}
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          {/* Step 0: Method */}
          {step === 0 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Choose Deployment Method</CardTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="flex flex-col items-center gap-3 rounded-lg border-2 border-primary bg-primary/5 p-6 text-center"
                  onClick={() => { setMethod("container"); setStep(1); }}
                >
                  <Container className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">Container Image</p>
                    <p className="text-xs text-muted-foreground">
                      Deploy from a Docker/OCI image
                    </p>
                  </div>
                </button>
                <button
                  className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted p-6 text-center hover:border-primary/50 transition-colors"
                  onClick={() => { checkHelmPlugin(); setMethod("helm"); setStep(1); }}
                >
                  <Box className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">Helm Chart</p>
                    <p className="text-xs text-muted-foreground">
                      Deploy from a Helm chart repository
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Helm Step 1: Configure */}
          {step === 1 && method === "helm" && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Configure Helm Release</CardTitle>

              {helmPluginEnabled === false && (
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-600">
                  Helm plugin may not be enabled. Deployment might fail.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="release-name">Release Name</Label>
                <Input
                  id="release-name"
                  placeholder="my-release"
                  value={helmConfig.releaseName}
                  onChange={(e) =>
                    updateHelmConfig({
                      releaseName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="chart-ref">Chart Reference</Label>
                <Input
                  id="chart-ref"
                  placeholder="bitnami/nginx"
                  value={helmConfig.chartRef}
                  onChange={(e) => updateHelmConfig({ chartRef: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  e.g. bitnami/nginx, oci://registry/chart
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo-url">Repository URL</Label>
                <Input
                  id="repo-url"
                  placeholder="https://charts.bitnami.com/bitnami"
                  value={helmConfig.repoURL}
                  onChange={(e) => updateHelmConfig({ repoURL: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="helm-namespace">Namespace</Label>
                <Input
                  id="helm-namespace"
                  placeholder="default"
                  value={helmConfig.namespace}
                  onChange={(e) => updateHelmConfig({ namespace: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="helm-values">Values (YAML)</Label>
                <Textarea
                  id="helm-values"
                  placeholder={`replicaCount: 2\nservice:\n  type: ClusterIP`}
                  value={helmConfig.values}
                  onChange={(e) => updateHelmConfig({ values: e.target.value })}
                  onBlur={() => validateHelmValues(helmConfig.values)}
                  className="font-mono text-xs min-h-[120px]"
                />
                {helmValuesError && (
                  <p className="text-xs text-destructive">{helmValuesError}</p>
                )}
              </div>
            </div>
          )}

          {/* Helm Step 2: Review */}
          {step === 2 && method === "helm" && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Review Helm Release</CardTitle>
              <p className="text-sm text-muted-foreground">
                The following Helm release will be deployed to the cluster.
              </p>

              <div className="rounded-md border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-primary" />
                  <span className="font-medium">Helm Release</span>
                  <Badge variant="outline">{helmConfig.releaseName}</Badge>
                </div>
                <div className="pl-6 space-y-1 text-muted-foreground">
                  <p>Chart: {helmConfig.chartRef}</p>
                  {helmConfig.repoURL && <p>Repository: {helmConfig.repoURL}</p>}
                  <p>Namespace: {helmConfig.namespace || "default"}</p>
                  {helmConfig.values.trim() && (
                    <div>
                      <p className="mb-1">Values:</p>
                      <pre className="rounded bg-muted p-2 text-xs font-mono overflow-auto max-h-40">
                        {helmConfig.values}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Container Step 1: Configure */}
          {step === 1 && method !== "helm" && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Configure Application</CardTitle>

              <div className="space-y-2">
                <Label htmlFor="app-name">Application Name</Label>
                <Input
                  id="app-name"
                  placeholder="my-app"
                  value={config.name}
                  onChange={(e) =>
                    updateConfig({
                      name: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="namespace">Namespace</Label>
                <Input
                  id="namespace"
                  placeholder="default"
                  value={config.namespace}
                  onChange={(e) => updateConfig({ namespace: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Container Image</Label>
                <Input
                  id="image"
                  placeholder="nginx:latest"
                  value={config.image}
                  onChange={(e) => updateConfig({ image: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="replicas">Replicas</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      updateConfig({
                        replicas: Math.max(0, config.replicas - 1),
                      })
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-mono font-medium">
                    {config.replicas}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      updateConfig({
                        replicas: Math.min(20, config.replicas + 1),
                      })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Container Ports</Label>
                {config.ports.map((port, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={port}
                      onChange={(e) => {
                        const newPorts = [...config.ports];
                        newPorts[i] = Number(e.target.value);
                        updateConfig({ ports: newPorts });
                      }}
                      className="w-28"
                      placeholder="80"
                    />
                    {config.ports.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          updateConfig({
                            ports: config.ports.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateConfig({ ports: [...config.ports, 0] })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Port
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Environment Variables</Label>
                {config.envVars.map((env, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="KEY"
                      value={env.key}
                      onChange={(e) => {
                        const newEnv = [...config.envVars];
                        newEnv[i] = { ...newEnv[i], key: e.target.value };
                        updateConfig({ envVars: newEnv });
                      }}
                      className="flex-1 font-mono text-xs"
                    />
                    <Input
                      placeholder="value"
                      value={env.value}
                      onChange={(e) => {
                        const newEnv = [...config.envVars];
                        newEnv[i] = { ...newEnv[i], value: e.target.value };
                        updateConfig({ envVars: newEnv });
                      }}
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        updateConfig({
                          envVars: config.envVars.filter((_, j) => j !== i),
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
                    updateConfig({
                      envVars: [...config.envVars, { key: "", value: "" }],
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Variable
                </Button>
              </div>
            </div>
          )}

          {/* Container Step 2: Networking */}
          {step === 2 && method !== "helm" && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Networking</CardTitle>

              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select
                  value={config.serviceType}
                  onValueChange={(v) =>
                    updateConfig({
                      serviceType: v as DeployConfig["serviceType"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ClusterIP">
                      ClusterIP (internal only)
                    </SelectItem>
                    <SelectItem value="NodePort">
                      NodePort (expose on node)
                    </SelectItem>
                    <SelectItem value="LoadBalancer">
                      LoadBalancer (external IP)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Ingress (optional)</Label>
                  <Button
                    variant={config.ingressEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      updateConfig({
                        ingressEnabled: !config.ingressEnabled,
                      })
                    }
                  >
                    {config.ingressEnabled ? "Enabled" : "Disabled"}
                  </Button>
                </div>

                {config.ingressEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="ingress-host">Hostname</Label>
                    <Input
                      id="ingress-host"
                      placeholder="app.example.com"
                      value={config.ingressHost}
                      onChange={(e) =>
                        updateConfig({ ingressHost: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Container Step 3: Review */}
          {step === 3 && method !== "helm" && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Review Deployment</CardTitle>
              <p className="text-sm text-muted-foreground">
                The following resources will be created in the cluster.
              </p>

              <div className="rounded-md border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" />
                  <span className="font-medium">Deployment</span>
                  <Badge variant="outline">{config.name}</Badge>
                </div>
                <div className="pl-6 space-y-1 text-muted-foreground">
                  <p>Namespace: {config.namespace || "default"}</p>
                  <p>Image: {config.image}</p>
                  <p>Replicas: {config.replicas}</p>
                  {config.ports.filter((p) => p > 0).length > 0 && (
                    <p>
                      Ports:{" "}
                      {config.ports
                        .filter((p) => p > 0)
                        .join(", ")}
                    </p>
                  )}
                  {config.envVars.filter((e) => e.key).length > 0 && (
                    <p>
                      Env vars:{" "}
                      {config.envVars
                        .filter((e) => e.key)
                        .map((e) => e.key)
                        .join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {config.ports.filter((p) => p > 0).length > 0 && (
                <div className="rounded-md border p-4 space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    <span className="font-medium">Service</span>
                    <Badge variant="outline">{config.serviceType}</Badge>
                  </div>
                  <div className="pl-6 space-y-1 text-muted-foreground">
                    <p>
                      Ports:{" "}
                      {config.ports
                        .filter((p) => p > 0)
                        .join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {config.ingressEnabled && config.ingressHost && (
                <div className="rounded-md border p-4 space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="font-medium">Ingress</span>
                  </div>
                  <div className="pl-6 space-y-1 text-muted-foreground">
                    <p>Host: {config.ingressHost}</p>
                    <p>Path: /</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deploy result (for both methods) */}
          {step === deployStepIdx && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              {deploying ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-lg font-medium">Deploying...</p>
                  <p className="text-sm text-muted-foreground">
                    {method === "helm" ? "Installing Helm release..." : "Creating resources in the cluster."}
                  </p>
                </>
              ) : deployResult === "success" ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                    <Check className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="text-lg font-medium">
                    {method === "helm" ? "Helm Release Deployed" : "Deployment Created"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {method === "helm"
                      ? `${helmConfig.releaseName} has been deployed successfully.`
                      : `${config.name} has been deployed successfully.`}
                  </p>
                  <Button onClick={() => router.push("/apps")}>
                    View Apps
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                    <Settings2 className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="text-lg font-medium">Deployment Failed</p>
                  <p className="text-sm text-muted-foreground">
                    Something went wrong while creating resources.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(reviewStepIdx)}>
                      Back to Review
                    </Button>
                    <Button onClick={method === "helm" ? handleHelmDeploy : handleDeploy}>Retry</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      {step < deployStepIdx && step > 0 && (
        <div className="flex justify-center gap-3 max-w-2xl mx-auto">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canProceed()}>
            {step === reviewStepIdx ? (
              <>
                <Rocket className="mr-1.5 h-4 w-4" />
                Deploy
              </>
            ) : (
              <>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
