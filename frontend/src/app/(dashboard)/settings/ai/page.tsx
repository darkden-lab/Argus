"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, RefreshCw, CheckCircle2, XCircle, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
  custom_headers: Record<string, string>;
}

interface RagStatus {
  indexed_documents: number;
  last_indexed_at: string;
  is_indexing: boolean;
}

interface HeaderEntry {
  key: string;
  value: string;
}

const providerOptions = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama (Local)" },
];

const modelsByProvider: Record<string, ComboboxOption[]> = {
  claude: [
    { value: "claude-opus-4-6", label: "claude-opus-4-6" },
    { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
    { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
  ],
  openai: [
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4-turbo", label: "gpt-4-turbo" },
  ],
  ollama: [
    { value: "llama3", label: "llama3" },
    { value: "mistral", label: "mistral" },
    { value: "codellama", label: "codellama" },
    { value: "mixtral", label: "mixtral" },
  ],
};

const baseUrlPlaceholders: Record<string, string> = {
  claude: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434",
};

function headersToEntries(headers: Record<string, string>): HeaderEntry[] {
  const entries = Object.entries(headers).map(([key, value]) => ({ key, value }));
  return entries.length > 0 ? entries : [];
}

function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) {
      result[key.trim()] = value;
    }
  }
  return result;
}

export default function AiSettingsPage() {
  const [config, setConfig] = useState<AiConfig>({
    provider: "claude",
    model: "claude-sonnet-4-6",
    api_key: "",
    base_url: "",
    tools_enabled: true,
    max_tokens: 4096,
    custom_headers: {},
  });
  const [headerEntries, setHeaderEntries] = useState<HeaderEntry[]>([]);
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
      .then((data) => {
        setConfig(data);
        setHeaderEntries(headersToEntries(data.custom_headers || {}));
      })
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

  const updateHeaderEntry = useCallback((index: number, field: "key" | "value", val: string) => {
    setHeaderEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  }, []);

  const addHeaderEntry = useCallback(() => {
    setHeaderEntries((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const removeHeaderEntry = useCallback((index: number) => {
    setHeaderEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put("/api/ai/config", {
        ...config,
        custom_headers: entriesToHeaders(headerEntries),
      });
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
        custom_headers: entriesToHeaders(headerEntries),
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
                    model: modelsByProvider[value]?.[0]?.value || "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Combobox
                options={availableModels}
                value={config.model}
                onValueChange={(value) =>
                  setConfig({ ...config, model: value })
                }
                placeholder="Select or type a model..."
                searchPlaceholder="Search or type custom model..."
                emptyMessage="No matching models."
                allowCustomValue
              />
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

          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={config.base_url}
              onChange={(e) =>
                setConfig({ ...config, base_url: e.target.value })
              }
              placeholder={baseUrlPlaceholders[config.provider] || ""}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for default. For Azure AI Foundry, enter your deployment URL.
            </p>
          </div>

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

          {/* Custom Headers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Custom Headers</Label>
                <p className="text-xs text-muted-foreground">
                  Add custom HTTP headers for authentication (e.g. api-key, Ocp-Apim-Subscription-Key).
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addHeaderEntry}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Header
              </Button>
            </div>
            {headerEntries.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="Header name"
                  value={entry.key}
                  onChange={(e) => updateHeaderEntry(index, "key", e.target.value)}
                />
                <Input
                  className="flex-1"
                  type="password"
                  placeholder="Header value"
                  value={entry.value}
                  onChange={(e) => updateHeaderEntry(index, "value", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeHeaderEntry(index)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
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
