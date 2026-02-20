"use client";

import { useState, useEffect } from "react";
import { Bot, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface AiConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  tools_enabled: boolean;
  max_tokens: number;
}

interface RagStatus {
  indexed_documents: number;
  last_indexed_at: string;
  is_indexing: boolean;
}

const providers = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama (Local)" },
];

const modelsByProvider: Record<string, string[]> = {
  claude: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  ollama: ["llama3", "mistral", "codellama", "mixtral"],
};

export default function AiSettingsPage() {
  const [config, setConfig] = useState<AiConfig>({
    provider: "claude",
    model: "claude-sonnet-4-6",
    api_key: "",
    base_url: "",
    tools_enabled: true,
    max_tokens: 4096,
  });
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(
    null
  );
  const [isReindexing, setIsReindexing] = useState(false);

  useEffect(() => {
    api
      .get<AiConfig>("/api/ai/config")
      .then(setConfig)
      .catch(() => {
        // Use defaults
      });

    api
      .get<RagStatus>("/api/ai/rag/status")
      .then(setRagStatus)
      .catch(() => {
        // RAG not available
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put("/api/ai/config", config);
      toast("Settings saved", { variant: "success" });
    } catch {
      // api.put already shows toast on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await api.post("/api/ai/config/test", {
        provider: config.provider,
        model: config.model,
        api_key: config.api_key,
        base_url: config.base_url,
      });
      setTestResult("success");
    } catch {
      setTestResult("error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      await api.post("/api/ai/rag/reindex");
      toast("Re-indexing started", { variant: "success" });
      // Refresh status after a delay
      setTimeout(() => {
        api
          .get<RagStatus>("/api/ai/rag/status")
          .then(setRagStatus)
          .catch(() => {});
        setIsReindexing(false);
      }, 2000);
    } catch {
      setIsReindexing(false);
    }
  };

  const availableModels = modelsByProvider[config.provider] || [];

  return (
    <div className="space-y-6">
      {/* Provider Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            LLM Provider
          </CardTitle>
          <CardDescription>
            Configure the AI model provider for the chat assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={config.provider}
                onValueChange={(value) =>
                  setConfig({
                    ...config,
                    provider: value,
                    model: modelsByProvider[value]?.[0] || "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={config.model}
                onValueChange={(value) =>
                  setConfig({ ...config, model: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={config.api_key}
              onChange={(e) =>
                setConfig({ ...config, api_key: e.target.value })
              }
              placeholder={
                config.provider === "ollama"
                  ? "Not required for Ollama"
                  : "Enter your API key"
              }
            />
          </div>

          {config.provider === "ollama" && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={config.base_url}
                onChange={(e) =>
                  setConfig({ ...config, base_url: e.target.value })
                }
                placeholder="http://localhost:11434"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              value={config.max_tokens}
              onChange={(e) =>
                setConfig({
                  ...config,
                  max_tokens: parseInt(e.target.value) || 4096,
                })
              }
              min={256}
              max={128000}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Tool Use</Label>
              <p className="text-xs text-muted-foreground">
                Allow AI to read and modify Kubernetes resources
              </p>
            </div>
            <Switch
              checked={config.tools_enabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, tools_enabled: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Configuration
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : testResult === "success" ? (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-500" />
              ) : testResult === "error" ? (
                <XCircle className="mr-1.5 h-3.5 w-3.5 text-red-500" />
              ) : null}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RAG Status */}
      <Card>
        <CardHeader>
          <CardTitle>RAG Knowledge Base</CardTitle>
          <CardDescription>
            Indexed documentation used for context-aware responses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ragStatus ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Indexed Documents
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {ragStatus.indexed_documents}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Last Indexed</p>
                  <p className="mt-1 text-sm font-medium">
                    {ragStatus.last_indexed_at
                      ? new Date(ragStatus.last_indexed_at).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    className="mt-1"
                    variant={ragStatus.is_indexing ? "default" : "secondary"}
                  >
                    {ragStatus.is_indexing ? "Indexing..." : "Ready"}
                  </Badge>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleReindex}
                disabled={isReindexing || ragStatus.is_indexing}
              >
                <RefreshCw
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    (isReindexing || ragStatus.is_indexing) && "animate-spin"
                  )}
                />
                Re-index Now
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              RAG status unavailable. Configure a provider first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

