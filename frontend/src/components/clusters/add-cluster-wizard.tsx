"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

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

type ConnectionType = "kubeconfig" | "agent";

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
  connection_type?: ConnectionType;
  agent_status?: string;
  labels: Record<string, string>;
  last_health: string;
}

interface AddClusterWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClusterAdded: (cluster: Cluster) => void;
}

const permissionsPresets = [
  { value: "read-only", label: "Read Only", description: "View resources across all namespaces" },
  { value: "operator", label: "Operator", description: "View, scale, restart workloads" },
  { value: "admin", label: "Admin", description: "Full cluster access" },
  { value: "custom", label: "Custom", description: "Define custom RBAC rules" },
];

const wizardSteps = [
  { label: "Connection", description: "Choose method" },
  { label: "Configure", description: "Setup details" },
  { label: "Verify", description: "Test connection" },
];

export function AddClusterWizard({
  open,
  onOpenChange,
  onClusterAdded,
}: AddClusterWizardProps) {
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
  function reset() {
    setStep(0);
    setConnectionType(null);
    setKubeconfigForm({ name: "", api_server_url: "", kubeconfig: "" });
    setAgentForm({ name: "", permissions: "read-only" });
    setAgentToken(null);
    setGeneratingToken(false);
    setCopied(false);
    setVerifying(false);
    setVerifyResult(null);
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

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
        message: `Successfully connected to cluster "${created.name}".`,
        cluster: created,
      });
      onClusterAdded(created);
    } catch {
      setVerifyResult({
        success: false,
        message: "Failed to connect. Please check your kubeconfig and try again.",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleVerifyAgent() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      // Check if the agent has connected by fetching clusters
      const clusters = await api.get<Cluster[]>("/api/clusters");
      const found = clusters.find(
        (c) => c.name === agentForm.name && c.connection_type === "agent"
      );
      if (found) {
        setVerifyResult({
          success: true,
          message: `Agent connected successfully for cluster "${found.name}".`,
          cluster: found,
        });
        onClusterAdded(found);
      } else {
        setVerifyResult({
          success: false,
          message: "Agent not yet connected. Make sure the install command has been run in the target cluster.",
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



  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Cluster</DialogTitle>
        </DialogHeader>

        {/* Progress steps */}
        <ProgressSteps steps={wizardSteps} currentStep={step} className="py-2" />

        {/* Step 0: Choose connection type */}
        {step === 0 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              How would you like to connect your cluster?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border-2 p-6 text-center transition-all",
                  connectionType === "kubeconfig"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
                onClick={() => setConnectionType("kubeconfig")}
              >
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  connectionType === "kubeconfig" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <FileKey2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium">Kubeconfig</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload or paste your kubeconfig file
                  </p>
                </div>
              </button>

              <button
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border-2 p-6 text-center transition-all",
                  connectionType === "agent"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
                onClick={() => setConnectionType("agent")}
              >
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  connectionType === "agent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium">Deploy Agent</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Install an agent inside your cluster
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setStep(1)}
                disabled={!connectionType}
              >
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Configure (Kubeconfig) */}
        {step === 1 && connectionType === "kubeconfig" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wiz-cluster-name">Cluster Name</Label>
              <Input
                id="wiz-cluster-name"
                placeholder="production"
                value={kubeconfigForm.name}
                onChange={(e) =>
                  setKubeconfigForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-api-server">API Server URL</Label>
              <Input
                id="wiz-api-server"
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
                label="Drag and drop your kubeconfig file, or click to browse"
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-kubeconfig">Or paste kubeconfig</Label>
              <Textarea
                id="wiz-kubeconfig"
                placeholder="Paste kubeconfig YAML..."
                className="min-h-[100px] font-mono text-xs"
                value={kubeconfigForm.kubeconfig}
                onChange={(e) =>
                  setKubeconfigForm((f) => ({ ...f, kubeconfig: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
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
                Verify Connection
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Configure (Agent) */}
        {step === 1 && connectionType === "agent" && (
          <div className="space-y-4 py-2">
            {!agentToken ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wiz-agent-name">Cluster Name</Label>
                  <Input
                    id="wiz-agent-name"
                    placeholder="production"
                    value={agentForm.name}
                    onChange={(e) =>
                      setAgentForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permissions Preset</Label>
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
                      {permissionsPresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          <div className="flex flex-col">
                            <span>{preset.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {preset.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(0)}>
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
                      Run this command in your target cluster:
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={handleCopyCommand}
                    >
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
                  <div>
                    <p className="text-sm font-medium">
                      Waiting for agent to connect...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Run the command above, then click Verify.
                    </p>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => {
                    setAgentToken(null);
                  }}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      setStep(2);
                      handleVerifyAgent();
                    }}
                  >
                    Verify Connection
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Verify */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center text-center">
              {verifying ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="mt-4 text-sm font-medium">
                    Verifying connection...
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Testing connection to your cluster
                  </p>
                </>
              ) : verifyResult?.success ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="mt-4 text-sm font-medium">
                    Connection Successful
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {verifyResult.message}
                  </p>
                </>
              ) : verifyResult ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                    <XCircle className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="mt-4 text-sm font-medium">
                    Connection Failed
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {verifyResult.message}
                  </p>
                </>
              ) : null}
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setVerifyResult(null);
                  setStep(1);
                }}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              {verifyResult?.success ? (
                <Button onClick={handleClose}>
                  Done
                </Button>
              ) : verifyResult && !verifyResult.success ? (
                <Button
                  onClick={() => {
                    if (connectionType === "kubeconfig") {
                      handleVerifyKubeconfig();
                    } else {
                      handleVerifyAgent();
                    }
                  }}
                  disabled={verifying}
                >
                  {verifying ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
