"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Copy, Check, Trash2, Plus, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const expirationOptions = [
  { value: "0", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("0");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api.get<ApiKey[]>("/api/auth/api-keys");
      setKeys(data);
    } catch {
      // api client shows toast
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast("Please enter a key name", { variant: "error" });
      return;
    }
    setIsCreating(true);
    try {
      const data = await api.post<{ key: string }>("/api/auth/api-keys", {
        name: name.trim(),
        expires_in_days: parseInt(expiresInDays),
      });
      setNewKey(data.key);
      setName("");
      setExpiresInDays("0");
      fetchKeys();
      toast("API key created", { variant: "success" });
    } catch {
      // api client shows toast
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    setRevokeTarget(null);
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, is_active: false } : k))
    );
    try {
      await api.del(`/api/auth/api-keys/${id}`);
      toast("API key revoked", { variant: "success" });
    } catch {
      fetchKeys();
    }
  };

  const handleCopy = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Failed to copy to clipboard", { variant: "error" });
    }
  };

  const dismissNewKey = () => {
    setNewKey(null);
    setCopied(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to the Argus API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CI/CD Pipeline"
              />
            </div>
            <div className="space-y-2">
              <Label>Expiration</Label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expirationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Create Key
          </Button>
        </CardContent>
      </Card>

      {/* New key banner */}
      {newKey && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="flex-1 space-y-3">
                <p className="text-sm font-medium">
                  Make sure to copy your API key now. You won&apos;t be able to
                  see it again!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
                    {newKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={dismissNewKey}>
                  Dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keys table */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Key className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No API keys yet. Create one above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Key Prefix</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Last Used</th>
                    <th className="pb-2 pr-4 font-medium">Expires</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{key.name}</td>
                      <td className="py-3 pr-4">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {key.key_prefix}...
                        </code>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground" title={new Date(key.created_at).toLocaleString()}>
                        {formatTimeAgo(key.created_at)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground" title={key.last_used_at ? new Date(key.last_used_at).toLocaleString() : undefined}>
                        {key.last_used_at
                          ? formatTimeAgo(key.last_used_at)
                          : "Never"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground" title={key.expires_at ? new Date(key.expires_at).toLocaleString() : undefined}>
                        {key.expires_at
                          ? new Date(key.expires_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="py-3 pr-4">
                        {key.is_active ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Revoked</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        {key.is_active && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setRevokeTarget(key)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke API Key"
        description={`Are you sure you want to revoke "${revokeTarget?.name}"? This action cannot be undone. Any integrations using this key will stop working immediately.`}
        confirmLabel="Revoke Key"
        variant="destructive"
        onConfirm={handleRevoke}
      />
    </div>
  );
}
