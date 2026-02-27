"use client";

import { useState, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateSecretWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface SecretEntry {
  key: string;
  value: string;
  visible: boolean;
}

interface SecretForm {
  name: string;
  namespace: string;
  type: string;
  encodeBase64: boolean;
  entries: SecretEntry[];
}

const SECRET_TYPES = [
  { value: "Opaque", label: "Opaque (generic)" },
  { value: "kubernetes.io/tls", label: "TLS" },
  { value: "kubernetes.io/dockerconfigjson", label: "Docker Registry" },
  { value: "kubernetes.io/basic-auth", label: "Basic Auth" },
  { value: "kubernetes.io/ssh-auth", label: "SSH Auth" },
  { value: "kubernetes.io/service-account-token", label: "Service Account Token" },
];

const defaultForm: SecretForm = {
  name: "",
  namespace: "default",
  type: "Opaque",
  encodeBase64: true,
  entries: [{ key: "", value: "", visible: false }],
};

function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

export function CreateSecretWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateSecretWizardProps) {
  const [form, setForm] = useState<SecretForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [importContent, setImportContent] = useState("");

  function reset() {
    setForm(defaultForm);
    setErrors({});
    setSubmitting(false);
    setImportMode(false);
    setImportKey("");
    setImportContent("");
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  function updateForm(patch: Partial<SecretForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
    const keys = Object.keys(patch);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function updateEntry(index: number, patch: Partial<SecretEntry>) {
    const newEntries = [...form.entries];
    newEntries[index] = { ...newEntries[index], ...patch };
    updateForm({ entries: newEntries });
  }

  const handleImport = useCallback(() => {
    if (!importKey.trim() || !importContent.trim()) return;
    updateForm({
      entries: [
        ...form.entries.filter((e) => e.key.trim()),
        { key: importKey, value: importContent, visible: false },
      ],
    });
    setImportKey("");
    setImportContent("");
    setImportMode(false);
  }, [importKey, importContent, form.entries]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(form.name)) {
      newErrors.name = "Must be a valid DNS name (lowercase, alphanumeric, hyphens)";
    }

    if (!form.namespace.trim()) {
      newErrors.namespace = "Namespace is required";
    }

    const validEntries = form.entries.filter((e) => e.key.trim());
    if (validEntries.length === 0) {
      newErrors.entries = "At least one key-value pair is required";
    }

    // Check for duplicate keys
    const keys = validEntries.map((e) => e.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      newErrors.entries = `Duplicate key: ${dupes[0]}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSubmitting(true);
    const ns = form.namespace || "default";

    const data: Record<string, string> = {};
    for (const entry of form.entries) {
      if (entry.key.trim()) {
        data[entry.key] = form.encodeBase64 ? toBase64(entry.value) : entry.value;
      }
    }

    const manifest = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: form.name,
        namespace: ns,
      },
      type: form.type,
      data,
    };

    try {
      await api.post(
        `/api/clusters/${clusterId}/resources/_/v1/secrets?namespace=${ns}`,
        manifest
      );
      toast("Secret Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create Secret", {
        description: "Check cluster connectivity and permissions.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Secret</DialogTitle>
          <DialogDescription>
            Store sensitive data such as passwords, tokens, and keys.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="secret-name">Name</Label>
            <Input
              id="secret-name"
              placeholder="my-secret"
              value={form.name}
              onChange={(e) =>
                updateForm({
                  name: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "-"),
                })
              }
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Namespace */}
          <div className="space-y-2">
            <Label htmlFor="secret-namespace">Namespace</Label>
            <Input
              id="secret-namespace"
              placeholder="default"
              value={form.namespace}
              onChange={(e) => updateForm({ namespace: e.target.value })}
            />
            {errors.namespace && (
              <p className="text-xs text-destructive">{errors.namespace}</p>
            )}
          </div>

          {/* Secret Type */}
          <div className="space-y-2">
            <Label>Secret Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => updateForm({ type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECRET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base64 Encoding Toggle */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Auto Base64 Encode</Label>
              <p className="text-xs text-muted-foreground">
                {form.encodeBase64
                  ? "Values will be base64-encoded before submission."
                  : "Values are assumed to already be base64-encoded."}
              </p>
            </div>
            <Switch
              checked={form.encodeBase64}
              onCheckedChange={(checked) => updateForm({ encodeBase64: checked })}
            />
          </div>

          {/* Key-Value Entries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Data Entries</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportMode(!importMode)}
              >
                {importMode ? "Cancel Import" : "Import from Content"}
              </Button>
            </div>

            {errors.entries && (
              <p className="text-xs text-destructive">{errors.entries}</p>
            )}

            {/* Import Mode */}
            {importMode && (
              <div className="rounded-md border p-3 space-y-2">
                <Label htmlFor="secret-import-key" className="text-xs">Key Name</Label>
                <Input
                  id="secret-import-key"
                  placeholder="tls.crt"
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Label htmlFor="secret-import-content" className="text-xs">Content</Label>
                <Textarea
                  id="secret-import-content"
                  placeholder="Paste secret content here..."
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                />
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={!importKey.trim() || !importContent.trim()}
                >
                  Add Entry
                </Button>
              </div>
            )}

            {/* Key-Value Editor */}
            <div className="space-y-2">
              {form.entries.map((entry, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="key"
                      value={entry.key}
                      onChange={(e) => updateEntry(i, { key: e.target.value })}
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => updateEntry(i, { visible: !entry.visible })}
                      title={entry.visible ? "Hide value" : "Show value"}
                    >
                      {entry.visible ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        updateForm({
                          entries: form.entries.filter((_, j) => j !== i),
                        })
                      }
                      disabled={form.entries.length <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {entry.visible ? (
                    <Textarea
                      placeholder="secret value"
                      value={entry.value}
                      onChange={(e) => updateEntry(i, { value: e.target.value })}
                      className="font-mono text-xs min-h-[60px]"
                    />
                  ) : (
                    <Input
                      type="password"
                      placeholder="secret value"
                      value={entry.value}
                      onChange={(e) => updateEntry(i, { value: e.target.value })}
                      className="font-mono text-xs"
                    />
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateForm({
                    entries: [
                      ...form.entries,
                      { key: "", value: "", visible: false },
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Entry
              </Button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.name}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Secret"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
