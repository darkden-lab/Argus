"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileKey2,
  Bot,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  LayoutGrid,
  Rocket,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/ui";

interface AgentTokenResponse {
  token_id: string;
  install_command: string;
  token: string;
  token_info: {
    id: string;
    cluster_name: string;
    created_by: string;
    permissions: string;
    used: boolean;
    cluster_id?: string;
    expires_at: string;
    created_at: string;
    used_at?: string;
  };
}

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
}

const permissionsPresets = [
  { value: "read-only", label: "Read Only", description: "View resources across all namespaces" },
  { value: "operator", label: "Operator", description: "View, scale, restart workloads" },
  { value: "admin", label: "Admin", description: "Full cluster access" },
];

const wizardSteps = [
  { label: "Welcome" },
  { label: "Connect" },
  { label: "Verify" },
  { label: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboardingCompleted = useUIStore((s) => s.setOnboardingCompleted);

  const [step, setStep] = useState(0);
  const [connectionType, setConnectionType] = useState<"kubeconfig" | "agent" | null>(null);

  // Kubeconfig state
  const [kubeconfigForm, setKubeconfigForm] = useState({
    name: "",
    api_server_url: "",
    kubeconfig: "",
  });

  // Agent state
  const [agentForm, setAgentForm] = useState({
    name: "",
    permissions: "read-only",
  });
  const [agentToken, setAgentToken] = useState<AgentTokenResponse | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean;
    message: string;
    cluster?: Cluster;
  } | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setKubeconfigForm((f) => ({ ...f, kubeconfig: content }));
    };
    reader.readAsText(file);
  }, []);

  async function handleCopyCommand() {
    if (!agentToken) return;
    await navigator.clipboard.writeText(agentToken.install_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerateAgentToken() {
    setGeneratingToken(true);
    try {
      const response = await api.post<AgentTokenResponse>(
        "/api/clusters/agent-token",
        {
          cluster_name: agentForm.name,
          permissions: agentForm.permissions,
        }
      );
      setAgentToken(response);
    } catch {
      // handled by api
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleVerifyKubeconfig() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const created = await api.post<Cluster>("/api/clusters", kubeconfigForm);
      setVerifyResult({
        success: true,
        message: `Connected to cluster "${created.name}" successfully.`,
        cluster: created,
      });
    } catch {
      setVerifyResult({
        success: false,
        message: "Failed to connect. Check your kubeconfig and try again.",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleVerifyAgent() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const clusters = await api.get<Cluster[]>("/api/clusters");
      const found = clusters.find(
        (c) => c.name === agentForm.name
      );
      if (found) {
        setVerifyResult({
          success: true,
          message: `Agent connected for cluster "${found.name}".`,
          cluster: found,
        });
      } else {
        setVerifyResult({
          success: false,
          message: "Agent not yet connected. Run the install command first.",
        });
      }
    } catch {
      setVerifyResult({
        success: false,
        message: "Failed to verify connection.",
      });
    } finally {
      setVerifying(false);
    }
  }

  function handleComplete() {
    setOnboardingCompleted(true);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Progress */}
      <ProgressSteps steps={wizardSteps} currentStep={step} className="mb-8" />

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="flex flex-col items-center text-center py-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <Network className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Welcome to Argus</h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            The multi-cluster Kubernetes dashboard built for teams.
            Monitor, manage, and troubleshoot all your clusters from one place.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <LayoutGrid className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Multi-cluster dashboard</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Rocket className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">App-level insights</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">AI-powered assistant</p>
            </div>
          </div>
          <Button className="mt-8" size="lg" onClick={() => setStep(1)}>
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 1: Connect cluster */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Connect Your Cluster</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how you want to connect your first Kubernetes cluster.
            </p>
          </div>

          {/* Connection type selection */}
          {!connectionType && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <button
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-8 transition-all hover:border-primary/30"
                  onClick={() => setConnectionType("kubeconfig")}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <FileKey2 className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Kubeconfig</p>
                    <p className="mt-1 text-xs text-muted-foreground">Upload or paste your kubeconfig</p>
                  </div>
                </button>
                <button
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-8 transition-all hover:border-primary/30"
                  onClick={() => setConnectionType("agent")}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Deploy Agent</p>
                    <p className="mt-1 text-xs text-muted-foreground">Install an agent in your cluster</p>
                  </div>
                </button>
              </div>
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
              </div>
            </>
          )}

          {/* Kubeconfig form */}
          {connectionType === "kubeconfig" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ob-cluster-name">Cluster Name</Label>
                <Input
                  id="ob-cluster-name"
                  placeholder="production"
                  value={kubeconfigForm.name}
                  onChange={(e) =>
                    setKubeconfigForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-api-server">API Server URL</Label>
                <Input
                  id="ob-api-server"
                  placeholder="https://k8s.example.com:6443"
                  value={kubeconfigForm.api_server_url}
                  onChange={(e) =>
                    setKubeconfigForm((f) => ({ ...f, api_server_url: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Kubeconfig File</Label>
                <FileDropzone
                  onFileSelect={handleFileSelect}
                  accept=".yaml,.yml,.conf"
                  label="Drag and drop your kubeconfig, or click to browse"
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-kubeconfig">Or paste kubeconfig</Label>
                <Textarea
                  id="ob-kubeconfig"
                  placeholder="Paste kubeconfig YAML..."
                  className="min-h-[100px] font-mono text-xs"
                  value={kubeconfigForm.kubeconfig}
                  onChange={(e) =>
                    setKubeconfigForm((f) => ({ ...f, kubeconfig: e.target.value }))
                  }
                />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setConnectionType(null)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => {
                    setStep(2);
                    handleVerifyKubeconfig();
                  }}
                  disabled={!kubeconfigForm.name || !kubeconfigForm.api_server_url || !kubeconfigForm.kubeconfig}
                >
                  Verify
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Agent form */}
          {connectionType === "agent" && (
            <div className="space-y-4">
              {!agentToken ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ob-agent-name">Cluster Name</Label>
                    <Input
                      id="ob-agent-name"
                      placeholder="production"
                      value={agentForm.name}
                      onChange={(e) =>
                        setAgentForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Permissions</Label>
                    <Select
                      value={agentForm.permissions}
                      onValueChange={(v) =>
                        setAgentForm((f) => ({ ...f, permissions: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {permissionsPresets.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <div className="flex flex-col">
                              <span>{p.label}</span>
                              <span className="text-xs text-muted-foreground">{p.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setConnectionType(null)}>
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleGenerateAgentToken}
                      disabled={generatingToken || !agentForm.name}
                    >
                      {generatingToken ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Command"
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-md bg-muted p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs text-muted-foreground">
                        Run this in your target cluster:
                      </Label>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleCopyCommand}>
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80 max-h-[150px] overflow-y-auto">
                      {agentToken.install_command}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Run the command above, then click Verify.
                    </p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setAgentToken(null)}>
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        setStep(2);
                        handleVerifyAgent();
                      }}
                    >
                      Verify
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Verify */}
      {step === 2 && (
        <div className="flex flex-col items-center py-12 text-center">
          {verifying ? (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="mt-6 text-lg font-medium">Verifying connection...</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Testing connectivity to your cluster
              </p>
            </>
          ) : verifyResult?.success ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <p className="mt-6 text-lg font-medium">Connection Successful</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {verifyResult.message}
              </p>
              <Button className="mt-8" onClick={() => setStep(3)}>
                Continue
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          ) : verifyResult ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-10 w-10 text-destructive" />
              </div>
              <p className="mt-6 text-lg font-medium">Connection Failed</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {verifyResult.message}
              </p>
              <div className="mt-8 flex gap-3">
                <Button variant="outline" onClick={() => {
                  setVerifyResult(null);
                  setStep(1);
                }}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Go Back
                </Button>
                <Button
                  onClick={() => {
                    if (connectionType === "kubeconfig") {
                      handleVerifyKubeconfig();
                    } else {
                      handleVerifyAgent();
                    }
                  }}
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 3 && (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">You are all set!</h2>
          <p className="mt-2 max-w-sm text-muted-foreground">
            Your cluster is connected and ready. Explore your dashboard or manage your applications.
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => {
              setOnboardingCompleted(true);
              router.push("/apps");
            }}>
              <Rocket className="mr-1.5 h-4 w-4" />
              View Apps
            </Button>
            <Button onClick={handleComplete}>
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
