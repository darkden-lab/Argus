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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface CreateConfigMapWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onCreated?: () => void;
}

interface DataEntry {
  key: string;
  value: string;
}

interface ConfigMapForm {
  name: string;
  namespace: string;
  entries: DataEntry[];
}

const defaultForm: ConfigMapForm = {
  name: "",
  namespace: "default",
  entries: [{ key: "", value: "" }],
};

export function CreateConfigMapWizard({
  open,
  onOpenChange,
  clusterId,
  onCreated,
}: CreateConfigMapWizardProps) {
  const [form, setForm] = useState<ConfigMapForm>(defaultForm);
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

  function updateForm(patch: Partial<ConfigMapForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
    const keys = Object.keys(patch);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function updateEntry(index: number, patch: Partial<DataEntry>) {
    const newEntries = [...form.entries];
    newEntries[index] = { ...newEntries[index], ...patch };
    updateForm({ entries: newEntries });
  }

  const handleImport = useCallback(() => {
    if (!importKey.trim() || !importContent.trim()) return;
    updateForm({
      entries: [
        ...form.entries.filter((e) => e.key.trim()),
        { key: importKey, value: importContent },
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
        data[entry.key] = entry.value;
      }
    }

    const manifest = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: form.name,
        namespace: ns,
      },
      data,
    };

    try {
      await api.post(
        `/api/clusters/${clusterId}/resources/_/v1/configmaps?namespace=${ns}`,
        manifest
      );
      toast("ConfigMap Created", {
        description: `${form.name} created successfully in namespace ${ns}`,
        variant: "success",
      });
      handleClose();
      onCreated?.();
    } catch {
      toast("Failed to create ConfigMap", {
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
          <DialogTitle>Create ConfigMap</DialogTitle>
          <DialogDescription>
            Store configuration data as key-value pairs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="cm-name">Name</Label>
            <Input
              id="cm-name"
              placeholder="my-config"
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
            <Label htmlFor="cm-namespace">Namespace</Label>
            <Input
              id="cm-namespace"
              placeholder="default"
              value={form.namespace}
              onChange={(e) => updateForm({ namespace: e.target.value })}
            />
            {errors.namespace && (
              <p className="text-xs text-destructive">{errors.namespace}</p>
            )}
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
                <Label htmlFor="cm-import-key" className="text-xs">File Name / Key</Label>
                <Input
                  id="cm-import-key"
                  placeholder="application.properties"
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Label htmlFor="cm-import-content" className="text-xs">Content</Label>
                <Textarea
                  id="cm-import-content"
                  placeholder="Paste file content here..."
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
                  <Textarea
                    placeholder="value"
                    value={entry.value}
                    onChange={(e) => updateEntry(i, { value: e.target.value })}
                    className="font-mono text-xs min-h-[60px]"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateForm({
                    entries: [...form.entries, { key: "", value: "" }],
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
              "Create ConfigMap"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
