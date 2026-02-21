"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FileKey2,
  Bot,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { RBACGate } from "@/components/auth/rbac-gate";
import { cn } from "@/lib/utils";

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

function ConnectionTypeIcon({ type }: { type?: ConnectionType }) {
  if (type === "agent") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Bot className="h-4 w-4 text-blue-500" />
          </TooltipTrigger>
          <TooltipContent>Connected via Agent</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <FileKey2 className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>Connected via Kubeconfig</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const columns: Column<Cluster>[] = [
  {
    key: "name",
    label: "Name",
    render: (row) => (
      <div className="flex items-center gap-2">
        <ConnectionTypeIcon type={row.connection_type} />
        <span>{row.name}</span>
      </div>
    ),
  },
  { key: "api_server_url", label: "API Server" },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <div className="flex items-center gap-2">
        <StatusBadge status={row.status} />
        {row.connection_type === "agent" && row.agent_status && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              row.agent_status === "connected" && "border-green-500 text-green-600",
              row.agent_status === "reconnecting" && "border-yellow-500 text-yellow-600",
              row.agent_status === "offline" && "border-destructive text-destructive"
            )}
          >
            {row.agent_status}
          </Badge>
        )}
      </div>
    ),
  },
  { key: "last_health", label: "Last Health Check" },
];

const permissionsPresets = [
  { value: "read-only", label: "Read Only", description: "View resources across all namespaces" },
  { value: "operator", label: "Operator", description: "View, scale, restart workloads" },
  { value: "admin", label: "Admin", description: "Full cluster access" },
  { value: "custom", label: "Custom", description: "Define custom RBAC rules" },
];

export default function ClustersPage() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("kubeconfig");

  // Kubeconfig form state
  const [adding, setAdding] = useState(false);
  const [kubeconfigForm, setKubeconfigForm] = useState({
    name: "",
    api_server_url: "",
    kubeconfig: "",
  });

  // Agent form state
  const [agentForm, setAgentForm] = useState({
    name: "",
    permissions: "read-only",
  });
  const [generatingToken, setGeneratingToken] = useState(false);
  const [agentToken, setAgentToken] = useState<AgentTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);

  useEffect(() => {
    api
      .get<Cluster[]>("/api/clusters")
      .then(setClusters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function resetDialog() {
    setDialogTab("kubeconfig");
    setKubeconfigForm({ name: "", api_server_url: "", kubeconfig: "" });
    setAgentForm({ name: "", permissions: "read-only" });
    setAgentToken(null);
    setWaitingForAgent(false);
    setCopied(false);
  }

  async function handleAddKubeconfig() {
    setAdding(true);
    try {
      const created = await api.post<Cluster>("/api/clusters", kubeconfigForm);
      setClusters((prev) => [...prev, created]);
      setDialogOpen(false);
      resetDialog();
    } catch {
      // handled by api
    } finally {
      setAdding(false);
    }
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
      setWaitingForAgent(true);
    } catch {
      // handled by api
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleCopyCommand() {
    if (!agentToken) return;
    await navigator.clipboard.writeText(agentToken.install_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clusters</h1>
          <p className="text-muted-foreground">
            Manage your Kubernetes clusters.
          </p>
        </div>
        <RBACGate resource="clusters" action="write">
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Cluster
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Cluster</DialogTitle>
              </DialogHeader>
              <Tabs value={dialogTab} onValueChange={setDialogTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="kubeconfig" className="flex-1">
                    <FileKey2 className="mr-1.5 h-4 w-4" />
                    Kubeconfig
                  </TabsTrigger>
                  <TabsTrigger value="agent" className="flex-1">
                    <Bot className="mr-1.5 h-4 w-4" />
                    Deploy Agent
                  </TabsTrigger>
                </TabsList>

                {/* Kubeconfig Tab */}
                <TabsContent value="kubeconfig">
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="cluster-name">Cluster Name</Label>
                      <Input
                        id="cluster-name"
                        placeholder="production"
                        value={kubeconfigForm.name}
                        onChange={(e) =>
                          setKubeconfigForm((f) => ({
                            ...f,
                            name: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api-server">API Server URL</Label>
                      <Input
                        id="api-server"
                        placeholder="https://k8s.example.com:6443"
                        value={kubeconfigForm.api_server_url}
                        onChange={(e) =>
                          setKubeconfigForm((f) => ({
                            ...f,
                            api_server_url: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kubeconfig">Kubeconfig</Label>
                      <Textarea
                        id="kubeconfig"
                        placeholder="Paste kubeconfig YAML..."
                        className="min-h-[150px] font-mono text-xs"
                        value={kubeconfigForm.kubeconfig}
                        onChange={(e) =>
                          setKubeconfigForm((f) => ({
                            ...f,
                            kubeconfig: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddKubeconfig}
                      disabled={
                        adding ||
                        !kubeconfigForm.name ||
                        !kubeconfigForm.api_server_url
                      }
                    >
                      {adding ? "Adding..." : "Add Cluster"}
                    </Button>
                  </DialogFooter>
                </TabsContent>

                {/* Deploy Agent Tab */}
                <TabsContent value="agent">
                  {!agentToken ? (
                    <>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="agent-cluster-name">
                            Cluster Name
                          </Label>
                          <Input
                            id="agent-cluster-name"
                            placeholder="production"
                            value={agentForm.name}
                            onChange={(e) =>
                              setAgentForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
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
                                <SelectItem
                                  key={preset.value}
                                  value={preset.value}
                                >
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
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setDialogOpen(false)}
                        >
                          Cancel
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
                      </DialogFooter>
                    </>
                  ) : (
                    <div className="space-y-4 py-2">
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
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80 max-h-[200px] overflow-y-auto">
                          {agentToken.install_command}
                        </pre>
                      </div>

                      {waitingForAgent && (
                        <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
                          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              Waiting for agent to connect...
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Run the command above, then the agent will appear
                              here automatically.
                            </p>
                          </div>
                        </div>
                      )}

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDialogOpen(false);
                            resetDialog();
                          }}
                        >
                          Close
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </RBACGate>
      </div>

      <ResourceTable
        data={clusters}
        columns={columns}
        loading={loading}
        onRowClick={(row) => router.push(`/clusters/${row.id}`)}
        searchPlaceholder="Filter clusters..."
      />
    </div>
  );
}
