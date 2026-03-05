'use client';

import { useState, useCallback } from 'react';
import {
  FileKey2,
  Bot,
  Check,
  Copy,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { api } from '@/lib/api';

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
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

const permissionsPresets = [
  { value: 'read-only', label: 'Read Only', description: 'Best for monitoring dashboards. Cannot modify any resources.' },
  { value: 'operator', label: 'Operator', description: 'Day-to-day operations: scale deployments, restart pods, view logs.' },
  { value: 'admin', label: 'Admin', description: 'Full control. Required for deploying new applications and managing RBAC.' },
];

export function ConnectStep({
  onNext,
  onBack,
}: {
  onNext: (result: { success: boolean; message: string; cluster?: Cluster }, connectionType: 'kubeconfig' | 'agent') => void;
  onBack: () => void;
}) {
  const [connectionType, setConnectionType] = useState<'kubeconfig' | 'agent' | null>(null);

  // Kubeconfig state
  const [kubeconfigForm, setKubeconfigForm] = useState({
    name: '',
    api_server_url: '',
    kubeconfig: '',
  });

  // Agent state
  const [agentForm, setAgentForm] = useState({
    name: '',
    permissions: 'read-only',
  });
  const [agentToken, setAgentToken] = useState<AgentTokenResponse | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);

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
        '/api/clusters/agent-token',
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
    try {
      const created = await api.post<Cluster>('/api/clusters', kubeconfigForm);
      onNext(
        { success: true, message: `Connected to cluster "${created.name}" successfully.`, cluster: created },
        'kubeconfig'
      );
    } catch {
      onNext(
        { success: false, message: 'Failed to connect. Check your kubeconfig and try again.' },
        'kubeconfig'
      );
    }
  }

  async function handleVerifyAgent() {
    try {
      const clusters = await api.get<Cluster[]>('/api/clusters');
      const found = clusters.find((c) => c.name === agentForm.name);
      if (found) {
        onNext(
          { success: true, message: `Agent connected for cluster "${found.name}".`, cluster: found },
          'agent'
        );
      } else {
        onNext(
          { success: false, message: 'Agent not yet connected. Run the install command first.' },
          'agent'
        );
      }
    } catch {
      onNext(
        { success: false, message: 'Failed to verify connection.' },
        'agent'
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Connect Your Cluster</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how you want to connect your first Kubernetes cluster.
        </p>
      </div>

      {!connectionType && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-8 transition-all hover:border-primary/30"
              onClick={() => setConnectionType('kubeconfig')}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <FileKey2 className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Kubeconfig</p>
                <p className="mt-1 text-xs text-muted-foreground">Quick setup — upload your cluster credentials file</p>
              </div>
            </button>
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-8 transition-all hover:border-primary/30"
              onClick={() => setConnectionType('agent')}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Bot className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Deploy Agent</p>
                <p className="mt-1 text-xs text-muted-foreground">Recommended for production — secure, outbound-only connection</p>
              </div>
            </button>
          </div>
          <div className="flex justify-start">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          </div>
        </>
      )}

      {connectionType === 'kubeconfig' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-cluster-name">Cluster Name</Label>
            <Input
              id="ob-cluster-name"
              placeholder="production"
              value={kubeconfigForm.name}
              onChange={(e) => setKubeconfigForm((f) => ({ ...f, name: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">A friendly name to identify this cluster in your dashboard</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-api-server">API Server URL</Label>
            <Input
              id="ob-api-server"
              placeholder="https://k8s.example.com:6443"
              value={kubeconfigForm.api_server_url}
              onChange={(e) => setKubeconfigForm((f) => ({ ...f, api_server_url: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Usually looks like https://your-cluster:6443. Found in your kubeconfig file.</p>
          </div>
          <div className="space-y-2">
            <Label>Kubeconfig File</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">Your cluster credentials file, typically found at ~/.kube/config</p>
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
              onChange={(e) => setKubeconfigForm((f) => ({ ...f, kubeconfig: e.target.value }))}
            />
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setConnectionType(null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleVerifyKubeconfig}
              disabled={!kubeconfigForm.name || !kubeconfigForm.api_server_url || !kubeconfigForm.kubeconfig}
            >
              Verify
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {connectionType === 'agent' && (
        <div className="space-y-4">
          {!agentToken ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="ob-agent-name">Cluster Name</Label>
                <Input
                  id="ob-agent-name"
                  placeholder="production"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">A friendly name to identify this cluster in your dashboard</p>
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <Select
                  value={agentForm.permissions}
                  onValueChange={(v) => setAgentForm((f) => ({ ...f, permissions: v }))}
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
                    'Generate Command'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                  <p className="text-sm text-muted-foreground">Copy the command below</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">
                      Install command:
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
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                  <p className="text-sm text-muted-foreground">Run it in a terminal connected to your cluster (kubectl must be configured)</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  <p className="text-sm text-muted-foreground">Click Verify to confirm the agent connected</p>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setAgentToken(null)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleVerifyAgent}>
                  Verify
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
