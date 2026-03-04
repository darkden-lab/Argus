# Wizards, Apps & Databases — Complete Revision Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify all 8 wizards with consistent UX, perfect autocomplete, inline resource creation; complete app CRUD with environments tab; complete database management with backups, users, connection strings, monitoring.

**Architecture:** Enhance existing Combobox with async loading + "Create new" capability. Each wizard keeps its own file but uses shared patterns. App detail page gets new tabs (Environment/Config) and actions (delete, edit). Database detail page gets complete overhaul with tabs for Overview, Config, Backups, Users, Connections, Logs.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (radix-ui), Zustand, existing `api.ts` client

---

## Phase 1 — Unified Wizard Infrastructure

### Task 1: Enhance Combobox with async loading and "Create new" support

**Files:**
- Modify: `frontend/src/components/ui/combobox.tsx`

**Step 1: Add new props to ComboboxProps interface**

After line 28 in `combobox.tsx`, add these props to the interface:

```typescript
interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
  // NEW props
  onSearch?: (query: string) => void;           // async search callback
  onCreateNew?: () => void;                     // "Create new" button callback
  createNewLabel?: string;                      // e.g. "Create new Gateway..."
  groupLabel?: string;                          // optional group header for options
}
```

**Step 2: Add "Create new" button in the dropdown**

After the filtered items map (after the `{filtered.map(...)}`), add:

```tsx
{onCreateNew && (
  <button
    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-none border-t border-border mt-1 pt-1.5 text-primary hover:bg-accent"
    onClick={(e) => {
      e.stopPropagation();
      onCreateNew();
    }}
  >
    <Plus className="h-3.5 w-3.5" />
    <span>{createNewLabel || "Create new..."}</span>
  </button>
)}
```

Import `Plus` from lucide-react at the top.

**Step 3: Add debounced async search support**

Replace the current search `onChange` handler to also call `onSearch` if provided:

```tsx
onChange={(e) => {
  setSearch(e.target.value);
  onSearch?.(e.target.value);
}}
```

**Step 4: Run lint to verify**

Run: `cd frontend && npx eslint src/components/ui/combobox.tsx --no-error-on-unmatched-pattern`
Expected: 0 errors

**Step 5: Commit**

```bash
git add frontend/src/components/ui/combobox.tsx
git commit -m "task(ui): enhance Combobox with async search and create-new support"
```

---

### Task 2: Create reusable ConfirmDeleteDialog component

**Files:**
- Modify: `frontend/src/components/ui/confirm-dialog.tsx`

**Step 1: Enhance ConfirmDialog with typed confirmation**

Add a `requireTypedConfirmation` prop. When set, user must type the resource name to confirm:

```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  loading?: boolean;
  // NEW
  requireTypedConfirmation?: string;  // resource name user must type to confirm
}
```

Add state `const [typedValue, setTypedValue] = React.useState("");` and reset it when dialog opens.

Add an Input field between description and footer when `requireTypedConfirmation` is set:

```tsx
{requireTypedConfirmation && (
  <div className="py-2">
    <p className="text-sm text-muted-foreground mb-2">
      Type <span className="font-mono font-semibold text-foreground">{requireTypedConfirmation}</span> to confirm:
    </p>
    <Input
      value={typedValue}
      onChange={(e) => setTypedValue(e.target.value)}
      placeholder={requireTypedConfirmation}
      className="font-mono"
    />
  </div>
)}
```

Disable the confirm button when typed value doesn't match:

```tsx
disabled={loading || (!!requireTypedConfirmation && typedValue !== requireTypedConfirmation)}
```

**Step 2: Run lint**

Run: `cd frontend && npx eslint src/components/ui/confirm-dialog.tsx --no-error-on-unmatched-pattern`

**Step 3: Commit**

```bash
git add frontend/src/components/ui/confirm-dialog.tsx
git commit -m "task(ui): add typed confirmation to ConfirmDialog for destructive actions"
```

---

### Task 3: Create ManifestPreview component (YAML/JSON toggle)

**Files:**
- Create: `frontend/src/components/ui/manifest-preview.tsx`

**Step 1: Create the component**

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface ManifestPreviewProps {
  manifest: Record<string, unknown>;
  className?: string;
  maxHeight?: string;
}

function ManifestPreview({ manifest, className, maxHeight = "300px" }: ManifestPreviewProps) {
  const [format, setFormat] = React.useState<"yaml" | "json">("yaml");
  const [copied, setCopied] = React.useState(false);

  const content = React.useMemo(() => {
    if (format === "json") return JSON.stringify(manifest, null, 2);
    return jsonToYaml(manifest, 0);
  }, [manifest, format]);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("rounded-lg border bg-muted/30", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex gap-1">
          <Button size="sm" variant={format === "yaml" ? "secondary" : "ghost"} className="h-6 text-xs px-2" onClick={() => setFormat("yaml")}>YAML</Button>
          <Button size="sm" variant={format === "json" ? "secondary" : "ghost"} className="h-6 text-xs px-2" onClick={() => setFormat("json")}>JSON</Button>
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 gap-1" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-auto" style={{ maxHeight }}>
        {content}
      </pre>
    </div>
  );
}

function jsonToYaml(obj: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return obj.includes("\n") ? `|\n${obj.split("\n").map(l => pad + "  " + l).join("\n")}` : obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map(item => {
      if (typeof item === "object" && item !== null) {
        const lines = jsonToYaml(item, indent + 1).split("\n");
        return `${pad}- ${lines[0].trim()}\n${lines.slice(1).join("\n")}`;
      }
      return `${pad}- ${jsonToYaml(item, indent + 1)}`;
    }).join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    return entries.map(([key, val]) => {
      if (typeof val === "object" && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
        return `${pad}${key}:\n${jsonToYaml(val, indent + 1)}`;
      }
      if (Array.isArray(val) && val.length > 0) {
        return `${pad}${key}:\n${jsonToYaml(val, indent + 1)}`;
      }
      return `${pad}${key}: ${jsonToYaml(val, indent + 1)}`;
    }).join("\n");
  }
  return String(obj);
}

export { ManifestPreview };
```

**Step 2: Run lint**

Run: `cd frontend && npx eslint src/components/ui/manifest-preview.tsx --no-error-on-unmatched-pattern`

**Step 3: Commit**

```bash
git add frontend/src/components/ui/manifest-preview.tsx
git commit -m "task(ui): create ManifestPreview component with YAML/JSON toggle and copy"
```

---

### Task 4: Create InlineResourceCreator wrapper component

**Files:**
- Create: `frontend/src/components/ui/inline-resource-creator.tsx`

This is a generic wrapper that renders a wizard inside a nested Dialog with higher z-index:

```tsx
"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface InlineResourceCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (resourceName: string) => void;
  children: React.ReactNode;
  title?: string;
}

function InlineResourceCreator({ open, onOpenChange, children }: InlineResourceCreatorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto z-[60]">
        {children}
      </DialogContent>
    </Dialog>
  );
}

export { InlineResourceCreator };
```

**Step 1: Create the file with the code above**
**Step 2: Run lint**
**Step 3: Commit**

```bash
git add frontend/src/components/ui/inline-resource-creator.tsx
git commit -m "task(ui): create InlineResourceCreator for nested wizard modals"
```

---

## Phase 2 — Refactor All Wizards

### Task 5: Refactor create-gateway-wizard.tsx

**Files:**
- Modify: `frontend/src/components/networking/create-gateway-wizard.tsx`

**Changes:**
1. Replace JSON preview section with `<ManifestPreview manifest={buildManifest()} />`
2. Add `onCreateNew` to namespace Combobox for inline namespace creation
3. Ensure Combobox has `loading` prop connected to async fetch states
4. Add keyboard shortcut: Escape closes dialog, Enter advances on review step

**Step 1: Import ManifestPreview**

```tsx
import { ManifestPreview } from "@/components/ui/manifest-preview";
```

**Step 2: Replace the JSON preview `<pre>` block in the review step with:**

```tsx
<ManifestPreview manifest={buildManifest()} maxHeight="400px" />
```

**Step 3: Run lint, verify no errors**
**Step 4: Commit**

```bash
git commit -m "task(networking): refactor gateway wizard with ManifestPreview and enhanced Combobox"
```

---

### Task 6: Refactor create-httproute-wizard.tsx with inline Gateway creation

**Files:**
- Modify: `frontend/src/components/networking/create-httproute-wizard.tsx`

**Changes:**
1. Replace JSON preview with `<ManifestPreview />`
2. Add `onCreateNew` to gateway Combobox — opens InlineResourceCreator with CreateGatewayWizard
3. After inline gateway is created, refresh gateway list and auto-select the new one
4. Add `onCreateNew` to namespace Combobox
5. Add `onCreateNew` to service Combobox

**Step 1: Add state for inline wizard**

```tsx
const [showInlineGateway, setShowInlineGateway] = useState(false);
```

**Step 2: Import InlineResourceCreator and CreateGatewayWizard**

```tsx
import { InlineResourceCreator } from "@/components/ui/inline-resource-creator";
import { CreateGatewayWizard } from "@/components/networking/create-gateway-wizard";
```

**Step 3: Add `onCreateNew` to gateway Combobox**

In the parent refs section, add to the gateway Combobox:

```tsx
onCreateNew={() => setShowInlineGateway(true)}
createNewLabel="Create new Gateway..."
```

**Step 4: Add InlineResourceCreator at end of dialog**

```tsx
<InlineResourceCreator open={showInlineGateway} onOpenChange={setShowInlineGateway}>
  <CreateGatewayWizard
    open={true}
    onOpenChange={(open) => {
      if (!open) {
        setShowInlineGateway(false);
        // Refresh gateway list
        fetchGateways();
      }
    }}
    clusterId={clusterId}
    inline={true}
  />
</InlineResourceCreator>
```

**Step 5: Update CreateGatewayWizard to accept `inline` prop**

When `inline={true}`, the wizard renders without its own Dialog wrapper (just the content).

**Step 6: Run lint, verify**
**Step 7: Commit**

```bash
git commit -m "task(networking): add inline Gateway creation to HTTPRoute wizard"
```

---

### Task 7: Refactor create-database-wizard.tsx

**Files:**
- Modify: `frontend/src/components/databases/create-database-wizard.tsx`

**Changes:**
1. Replace JSON preview with `<ManifestPreview />`
2. Add `onCreateNew` to namespace Combobox
3. Add `onCreateNew` to Secret Combobox (for MariaDB root password secret) — opens inline Secret wizard
4. Ensure storage class Combobox has loading state

**Step 1-5: Similar pattern to Tasks 5-6**
**Step 6: Commit**

```bash
git commit -m "task(databases): refactor database wizard with ManifestPreview and inline creators"
```

---

### Task 8: Refactor create-configmap-wizard.tsx

**Files:**
- Modify: `frontend/src/components/resources/create-configmap-wizard.tsx`

**Changes:**
1. Add namespace Combobox with `onCreateNew` (currently uses Combobox but verify)
2. Replace JSON preview with `<ManifestPreview />`

**Commit:**

```bash
git commit -m "task(resources): refactor configmap wizard with ManifestPreview"
```

---

### Task 9: Refactor create-pvc-wizard.tsx

**Files:**
- Modify: `frontend/src/components/resources/create-pvc-wizard.tsx`

**Changes:**
1. Ensure namespace and storage class Combobox have proper async loading
2. Replace JSON preview with `<ManifestPreview />` if applicable

**Commit:**

```bash
git commit -m "task(resources): refactor PVC wizard with enhanced Combobox"
```

---

### Task 10: Refactor create-secret-wizard.tsx

**Files:**
- Modify: `frontend/src/components/resources/create-secret-wizard.tsx`

**Changes:**
1. Add namespace Combobox with `onCreateNew`
2. Replace JSON preview with `<ManifestPreview />`
3. Add `inline` prop support so it can be used inside InlineResourceCreator

**Commit:**

```bash
git commit -m "task(resources): refactor secret wizard with ManifestPreview and inline support"
```

---

### Task 11: Refactor create-network-policy-wizard.tsx

**Files:**
- Modify: `frontend/src/components/networking/create-network-policy-wizard.tsx`

**Changes:**
1. Replace JSON preview with `<ManifestPreview />`
2. Add namespace Combobox with `onCreateNew`

**Commit:**

```bash
git commit -m "task(networking): refactor network policy wizard with ManifestPreview"
```

---

### Task 12: Refactor add-cluster-wizard.tsx

**Files:**
- Modify: `frontend/src/components/clusters/add-cluster-wizard.tsx`

**Changes:**
1. Ensure consistent ProgressSteps usage matching other wizards
2. Add ManifestPreview for kubeconfig preview if applicable
3. Consistent button layout (Cancel/Back on left, Next/Create on right)

**Commit:**

```bash
git commit -m "task(clusters): refactor cluster wizard for consistency"
```

---

## Phase 3 — Apps: Complete CRUD + Environments

### Task 13: Add delete app functionality

**Files:**
- Modify: `frontend/src/app/(dashboard)/apps/[id]/page.tsx`
- Modify: `frontend/src/hooks/use-apps.ts` (optional, add deleteApp helper)

**Step 1: Add delete state and handler to app detail page**

After the existing state declarations (~line 99):

```tsx
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [deleting, setDeleting] = useState(false);
```

Add delete handler:

```tsx
async function handleDelete() {
  if (!app || !clusterId) return;
  setDeleting(true);
  try {
    // Delete deployment
    await api.del(`/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${app.namespace}`);
    // Optionally delete associated services
    for (const svc of app.services) {
      await api.del(`/api/clusters/${clusterId}/resources/_/v1/services/${svc.name}?namespace=${app.namespace}`).catch(() => {});
    }
    toast("App deleted", { description: `${app.name} has been deleted`, variant: "success" });
    router.push("/apps");
  } catch (err) {
    toast("Failed to delete app", { description: String(err), variant: "error" });
  } finally {
    setDeleting(false);
    setDeleteDialogOpen(false);
  }
}
```

**Step 2: Add delete button in the header actions area (~line 310-333)**

```tsx
<Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
  <Trash2 className="h-4 w-4 mr-1" /> Delete
</Button>
```

Import `Trash2` from lucide-react.

**Step 3: Add ConfirmDialog at end of page**

```tsx
<ConfirmDialog
  open={deleteDialogOpen}
  onOpenChange={setDeleteDialogOpen}
  title="Delete Application"
  description={`This will permanently delete the deployment "${app?.name}" and its associated services. This action cannot be undone.`}
  confirmLabel="Delete"
  variant="destructive"
  requireTypedConfirmation={app?.name}
  onConfirm={handleDelete}
  loading={deleting}
/>
```

**Step 4: Run lint**
**Step 5: Commit**

```bash
git commit -m "task(apps): add delete app with typed confirmation"
```

---

### Task 14: Add edit deployment dialog

**Files:**
- Create: `frontend/src/components/apps/edit-app-dialog.tsx`
- Modify: `frontend/src/app/(dashboard)/apps/[id]/page.tsx`

**Step 1: Create EditAppDialog component**

The dialog allows editing:
- Image (text input)
- Replicas (number input)
- Labels (KV pair editor)
- Update strategy (RollingUpdate vs Recreate)
- Resource limits (CPU/Memory requests and limits)

Uses a tabbed layout within a Dialog:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";

interface EditAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  app: {
    name: string;
    namespace: string;
    image: string;
    replicas: { desired: number };
  } | null;
  onSaved: () => void;
}

export function EditAppDialog({ open, onOpenChange, clusterId, app, onSaved }: EditAppDialogProps) {
  const [image, setImage] = useState("");
  const [replicas, setReplicas] = useState(1);
  const [strategy, setStrategy] = useState("RollingUpdate");
  const [cpuRequest, setCpuRequest] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memRequest, setMemRequest] = useState("");
  const [memLimit, setMemLimit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (app && open) {
      setImage(app.image);
      setReplicas(app.replicas.desired);
    }
  }, [app, open]);

  async function handleSave() {
    if (!app) return;
    setSaving(true);
    try {
      // Fetch current deployment, patch it
      const current = await api.get<{ metadata: Record<string, unknown>; spec: Record<string, unknown> }>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${app.namespace}`
      );
      const patch = {
        ...current,
        spec: {
          ...(current.spec as Record<string, unknown>),
          replicas,
          strategy: { type: strategy },
          template: {
            ...((current.spec as Record<string, unknown>).template as Record<string, unknown>),
            spec: {
              ...(((current.spec as Record<string, unknown>).template as Record<string, unknown>).spec as Record<string, unknown>),
              containers: [
                {
                  ...((((current.spec as Record<string, unknown>).template as Record<string, unknown>).spec as Record<string, unknown>).containers as Record<string, unknown>[])?.[0],
                  image,
                  resources: {
                    requests: {
                      ...(cpuRequest ? { cpu: cpuRequest } : {}),
                      ...(memRequest ? { memory: memRequest } : {}),
                    },
                    limits: {
                      ...(cpuLimit ? { cpu: cpuLimit } : {}),
                      ...(memLimit ? { memory: memLimit } : {}),
                    },
                  },
                },
              ],
            },
          },
        },
      };
      await api.put(`/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${app.namespace}`, patch);
      toast("App updated", { description: `${app.name} has been updated`, variant: "success" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast("Failed to update app", { description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {app?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Image</Label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:latest" className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Replicas</Label>
              <Input type="number" min={0} max={100} value={replicas} onChange={(e) => setReplicas(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RollingUpdate">Rolling Update</SelectItem>
                  <SelectItem value="Recreate">Recreate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resource Limits</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">CPU Request</Label>
                <Input value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)} placeholder="100m" className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPU Limit</Label>
                <Input value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="500m" className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Memory Request</Label>
                <Input value={memRequest} onChange={(e) => setMemRequest(e.target.value)} placeholder="128Mi" className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Memory Limit</Label>
                <Input value={memLimit} onChange={(e) => setMemLimit(e.target.value)} placeholder="512Mi" className="text-xs" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !image.trim()}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Wire EditAppDialog into app detail page**

Add import, state, and button alongside Scale/Restart buttons.

**Step 3: Run lint**
**Step 4: Commit**

```bash
git commit -m "task(apps): add edit deployment dialog with image, replicas, strategy, resource limits"
```

---

### Task 15: Add Environments tab to app detail

**Files:**
- Create: `frontend/src/components/apps/app-environments-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/apps/[id]/page.tsx`

**Step 1: Create AppEnvironmentsTab component**

This tab shows:
1. **Inline env vars** — from the deployment spec, editable
2. **ConfigMap references** — env vars sourced from ConfigMaps, with link to view/edit
3. **Secret references** — env vars sourced from Secrets
4. **Volume mounts** — ConfigMap/Secret volume mounts
5. **"Add" buttons** — to add new env var, add from ConfigMap, add from Secret
6. **Inline creation** — can create new ConfigMap/Secret from this tab

```tsx
"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { InlineResourceCreator } from "@/components/ui/inline-resource-creator";
import { Plus, Trash2, Eye, EyeOff, Save, Key, FileText } from "lucide-react";

interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string };
    secretKeyRef?: { name: string; key: string };
  };
}

interface VolumeMount {
  name: string;
  mountPath: string;
  subPath?: string;
  readOnly?: boolean;
}

interface Volume {
  name: string;
  configMap?: { name: string };
  secret?: { secretName: string };
}

interface AppEnvironmentsTabProps {
  clusterId: string;
  appName: string;
  namespace: string;
  onRefresh: () => void;
}

export function AppEnvironmentsTab({ clusterId, appName, namespace, onRefresh }: AppEnvironmentsTabProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [volumeMounts, setVolumeMounts] = useState<VolumeMount[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [configMaps, setConfigMaps] = useState<{ value: string; label: string }[]>([]);
  const [secrets, setSecrets] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSecretValues, setShowSecretValues] = useState<Record<string, boolean>>({});
  const [showCreateConfigMap, setShowCreateConfigMap] = useState(false);
  const [showCreateSecret, setShowCreateSecret] = useState(false);

  useEffect(() => {
    loadDeployment();
    loadConfigMapsAndSecrets();
  }, [clusterId, appName, namespace]);

  async function loadDeployment() {
    try {
      const dep = await api.get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      );
      const container = ((dep.spec as Record<string, unknown>)?.template as Record<string, unknown>)?.spec as Record<string, unknown>;
      const containers = (container?.containers as Record<string, unknown>[]) ?? [];
      const first = containers[0] ?? {};
      setEnvVars((first.env as EnvVar[]) ?? []);
      setVolumeMounts((first.volumeMounts as VolumeMount[]) ?? []);
      setVolumes((container?.volumes as Volume[]) ?? []);
    } catch { /* handled by parent */ }
  }

  async function loadConfigMapsAndSecrets() {
    try {
      const [cmRes, secRes] = await Promise.allSettled([
        api.get<{ items: Record<string, unknown>[] }>(`/api/clusters/${clusterId}/resources/_/v1/configmaps?namespace=${namespace}`),
        api.get<{ items: Record<string, unknown>[] }>(`/api/clusters/${clusterId}/resources/_/v1/secrets?namespace=${namespace}`),
      ]);
      if (cmRes.status === "fulfilled") {
        setConfigMaps(cmRes.value.items.map((cm) => ({
          value: (cm.metadata as Record<string, string>).name,
          label: (cm.metadata as Record<string, string>).name,
        })));
      }
      if (secRes.status === "fulfilled") {
        setSecrets(secRes.value.items.map((s) => ({
          value: (s.metadata as Record<string, string>).name,
          label: (s.metadata as Record<string, string>).name,
        })));
      }
    } catch { /* silent */ }
  }

  // Add inline env var
  function addEnvVar() {
    setEnvVars([...envVars, { name: "", value: "" }]);
  }

  // Add env var from ConfigMap
  function addFromConfigMap(cmName: string, key: string) {
    setEnvVars([...envVars, { name: key, valueFrom: { configMapKeyRef: { name: cmName, key } } }]);
  }

  // Add env var from Secret
  function addFromSecret(secretName: string, key: string) {
    setEnvVars([...envVars, { name: key, valueFrom: { secretKeyRef: { name: secretName, key } } }]);
  }

  function removeEnvVar(index: number) {
    setEnvVars(envVars.filter((_, i) => i !== index));
  }

  function updateEnvVar(index: number, field: "name" | "value", val: string) {
    const updated = [...envVars];
    if (field === "name") updated[index] = { ...updated[index], name: val };
    else updated[index] = { ...updated[index], value: val, valueFrom: undefined };
    setEnvVars(updated);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const dep = await api.get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`
      );
      // Patch the container env vars
      const spec = dep.spec as Record<string, unknown>;
      const template = spec.template as Record<string, unknown>;
      const podSpec = template.spec as Record<string, unknown>;
      const containers = [...(podSpec.containers as Record<string, unknown>[])];
      containers[0] = { ...containers[0], env: envVars.filter(e => e.name), volumeMounts };
      const patched = {
        ...dep,
        spec: { ...spec, template: { ...template, spec: { ...podSpec, containers, volumes } } }
      };
      await api.put(`/api/clusters/${clusterId}/resources/apps/v1/deployments/${appName}?namespace=${namespace}`, patched);
      toast("Environment saved", { description: "Deployment updated with new environment configuration", variant: "success" });
      onRefresh();
    } catch (err) {
      toast("Failed to save", { description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Inline Environment Variables */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Environment Variables</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addEnvVar}>
                <Plus className="h-3 w-3 mr-1" /> Add Variable
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {envVars.length === 0 ? (
            <p className="text-xs text-muted-foreground">No environment variables configured.</p>
          ) : (
            <div className="space-y-2">
              {envVars.map((env, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={env.name}
                    onChange={(e) => updateEnvVar(i, "name", e.target.value)}
                    placeholder="KEY"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  {env.valueFrom ? (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {env.valueFrom.configMapKeyRef ? (
                        <><FileText className="h-2.5 w-2.5 mr-1" /> {env.valueFrom.configMapKeyRef.name}/{env.valueFrom.configMapKeyRef.key}</>
                      ) : env.valueFrom.secretKeyRef ? (
                        <><Key className="h-2.5 w-2.5 mr-1" /> {env.valueFrom.secretKeyRef.name}/{env.valueFrom.secretKeyRef.key}</>
                      ) : "ref"}
                    </Badge>
                  ) : (
                    <Input
                      value={env.value ?? ""}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      placeholder="value"
                      className="h-7 text-xs font-mono flex-1"
                    />
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => removeEnvVar(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ConfigMap References */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> ConfigMap References
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreateConfigMap(true)}>
              <Plus className="h-3 w-3 mr-1" /> Create ConfigMap
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {configMaps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ConfigMaps found in namespace {namespace}.</p>
            ) : (
              configMaps.map(cm => (
                <div key={cm.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                  <span className="font-mono">{cm.label}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addFromConfigMap(cm.value, "")}>
                    Use Key
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Secret References */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4" /> Secret References
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreateSecret(true)}>
              <Plus className="h-3 w-3 mr-1" /> Create Secret
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {secrets.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Secrets found in namespace {namespace}.</p>
            ) : (
              secrets.map(s => (
                <div key={s.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                  <span className="font-mono">{s.label}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addFromSecret(s.value, "")}>
                    Use Key
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Volume Mounts */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Volume Mounts (Config)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {volumeMounts.filter(vm => volumes.some(v => v.name === vm.name && (v.configMap || v.secret))).length === 0 ? (
            <p className="text-xs text-muted-foreground">No config volume mounts.</p>
          ) : (
            <div className="space-y-2">
              {volumeMounts.filter(vm => volumes.some(v => v.name === vm.name && (v.configMap || v.secret))).map((vm, i) => {
                const vol = volumes.find(v => v.name === vm.name);
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {vol?.configMap ? "ConfigMap" : "Secret"}
                    </Badge>
                    <span className="font-mono">{vol?.configMap?.name ?? vol?.secret?.secretName}</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="font-mono">{vm.mountPath}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving..." : "Save Environment"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Add "Environment" tab to app detail page**

In the tabs list (~line 337-343), add a new TabsTrigger:

```tsx
<TabsTrigger value="environment">Environment</TabsTrigger>
```

Add the TabsContent:

```tsx
<TabsContent value="environment">
  <AppEnvironmentsTab
    clusterId={clusterId}
    appName={app.name}
    namespace={app.namespace}
    onRefresh={fetchApp}
  />
</TabsContent>
```

**Step 3: Run lint**
**Step 4: Commit**

```bash
git commit -m "task(apps): add Environments tab with env vars, ConfigMap/Secret refs, volume mounts"
```

---

### Task 16: Add rollout management to app detail

**Files:**
- Modify: `frontend/src/app/(dashboard)/apps/[id]/page.tsx`

**Step 1: Add rollout undo button alongside Scale and Restart**

```tsx
<Button variant="outline" size="sm" onClick={handleRollbackUndo}>
  <Undo2 className="h-4 w-4 mr-1" /> Undo Rollout
</Button>
```

Handler:

```tsx
async function handleRollbackUndo() {
  if (!app || !clusterId) return;
  try {
    // Use the K8s rollout undo API — we patch the deployment's rollout spec
    const dep = await api.get<Record<string, unknown>>(
      `/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${app.namespace}`
    );
    // Rollout undo = set rollback revision annotation
    const meta = dep.metadata as Record<string, unknown>;
    const annotations = (meta.annotations ?? {}) as Record<string, string>;
    annotations["kubectl.kubernetes.io/last-applied-configuration"] = "";
    const patched = { ...dep, metadata: { ...meta, annotations }, spec: { ...(dep.spec as Record<string, unknown>), template: { ...((dep.spec as Record<string, unknown>).template as Record<string, unknown>) } } };
    await api.put(`/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${app.namespace}`, patched);
    toast("Rollout undo initiated", { variant: "success" });
    refetch();
  } catch (err) {
    toast("Failed to undo rollout", { description: String(err), variant: "error" });
  }
}
```

**Step 2: Commit**

```bash
git commit -m "task(apps): add rollout undo button to app detail"
```

---

## Phase 4 — Databases: Complete Revision

### Task 17: Add delete database functionality

**Files:**
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Add delete state and handler**

Similar pattern to Task 13 (app delete). For CNPG clusters, call:

```tsx
await api.del(`/api/plugins/cnpg/clusters/${dbName}?clusterID=${clusterId}&namespace=${namespace}`);
```

For MariaDB instances:

```tsx
await api.del(`/api/plugins/mariadb/instances/${dbName}?clusterID=${clusterId}&namespace=${namespace}`);
```

For generic StatefulSets:

```tsx
await api.del(`/api/clusters/${clusterId}/resources/apps/v1/statefulsets/${dbName}?namespace=${namespace}`);
```

**Step 2: Add delete button and ConfirmDialog**
**Step 3: Run lint**
**Step 4: Commit**

```bash
git commit -m "task(databases): add delete database with engine-aware deletion"
```

---

### Task 18: Add scale/edit database dialog

**Files:**
- Create: `frontend/src/components/databases/edit-database-dialog.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create EditDatabaseDialog**

Supports:
- Replicas (instances) — number input
- Storage size — input with unit selector (CNPG: storage.size, MariaDB: storage.size)
- PostgreSQL parameters — KV pair editor (reuse KVPairEditor pattern from create wizard)
- MariaDB: port, root password secret

Uses PUT to the respective plugin API endpoint.

**Step 2: Wire into database detail page with "Edit" button**
**Step 3: Commit**

```bash
git commit -m "task(databases): add edit/scale database dialog for CNPG and MariaDB"
```

---

### Task 19: Add Backups tab to database detail

**Files:**
- Create: `frontend/src/components/databases/database-backups-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create DatabaseBackupsTab**

Shows:
1. **Backup list** — table with name, status, started, completed, cluster ref
2. **Create backup button** — opens dialog to trigger on-demand backup
3. **Scheduled backups** — shows existing schedules with cron expression
4. **Create scheduled backup** — dialog with cron input, retention policy
5. **Restore button** — per-backup restore action with confirmation

CNPG backups use:
- `GET /api/plugins/cnpg/backups?clusterID=...&namespace=...`
- `POST /api/plugins/cnpg/backups` to create
- `GET /api/plugins/cnpg/scheduledbackups?clusterID=...`
- `POST /api/plugins/cnpg/scheduledbackups` to create scheduled

MariaDB backups use:
- `GET /api/plugins/mariadb/backups?clusterID=...&namespace=...`
- `POST /api/plugins/mariadb/backups` to create
- `GET /api/plugins/mariadb/restores?clusterID=...`
- `POST /api/plugins/mariadb/restores` to restore

**Step 2: Add "Backups" tab to database detail page**
**Step 3: Commit**

```bash
git commit -m "task(databases): add Backups tab with backup/restore/schedule management"
```

---

### Task 20: Add Users tab to database detail

**Files:**
- Create: `frontend/src/components/databases/database-users-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create DatabaseUsersTab**

For CNPG (PostgreSQL):
- Shows database name, owner from CNPG cluster spec
- Shows superuser secret reference
- Shows application secret (auto-generated by CNPG)
- "View connection credentials" with reveal/copy buttons

For MariaDB:
- **Users list** — `GET /api/plugins/mariadb/users?clusterID=...`
- **Create user** — `POST /api/plugins/mariadb/users`
- **Delete user** — `DELETE /api/plugins/mariadb/users/{name}`
- **Databases list** — `GET /api/plugins/mariadb/databases?clusterID=...`
- **Create database** — `POST /api/plugins/mariadb/databases`
- **Grants list** — `GET /api/plugins/mariadb/grants?clusterID=...`
- **Create grant** — `POST /api/plugins/mariadb/grants`

**Step 2: Add "Users & Access" tab to database detail page**
**Step 3: Commit**

```bash
git commit -m "task(databases): add Users & Access tab with user/database/grant management"
```

---

### Task 21: Add Connection Info tab to database detail

**Files:**
- Create: `frontend/src/components/databases/database-connection-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create DatabaseConnectionTab**

Shows:
1. **Connection strings** — formatted for different clients:
   - PostgreSQL: `postgresql://user:pass@host:port/dbname`
   - MySQL: `mysql://user:pass@host:port/dbname`
   - kubectl port-forward command
   - psql / mysql CLI command
2. **Service endpoints** — ClusterIP, port, with copy buttons
3. **Secret references** — links to the Kubernetes secrets containing credentials
4. **Connection pooler** (CNPG) — PgBouncer endpoint if pooler exists

Each connection string has a "Copy" button using `navigator.clipboard`.

**Step 2: Add "Connection" tab to database detail page**
**Step 3: Commit**

```bash
git commit -m "task(databases): add Connection tab with copyable connection strings"
```

---

### Task 22: Add Logs tab to database detail

**Files:**
- Create: `frontend/src/components/databases/database-logs-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create DatabaseLogsTab**

Reuses the existing `LogViewer` component (`src/components/resources/log-viewer.tsx`).

Fetches pod list for the StatefulSet, lets user select which pod to view logs from:

```tsx
// Get pods for the statefulset
const pods = await api.get<{ items: Record<string, unknown>[] }>(
  `/api/clusters/${clusterId}/resources/_/v1/pods?namespace=${namespace}&labelSelector=app=${dbName}`
);
```

Then renders `LogViewer` with selected pod.

**Step 2: Add "Logs" tab to database detail page**
**Step 3: Commit**

```bash
git commit -m "task(databases): add Logs tab with pod log viewer"
```

---

### Task 23: Add Replication & Monitoring tab to database detail (CNPG)

**Files:**
- Create: `frontend/src/components/databases/database-monitoring-tab.tsx`
- Modify: `frontend/src/app/(dashboard)/databases/[id]/page.tsx`

**Step 1: Create DatabaseMonitoringTab**

For CNPG clusters, shows:
1. **Cluster phase** — with status badge (Healthy, Degraded, etc.)
2. **Instance status** — table of pods with role (primary/replica), status, ready, restarts
3. **Replication info** — streaming replication status from CNPG cluster status
4. **WAL archiving** — status of continuous archiving
5. **Conditions** — list of CNPG conditions with type, status, message
6. **Failover** — manual switchover button (promote replica to primary)

For MariaDB:
1. **Instance status** — similar pod table
2. **Replication mode** — from MariaDB spec (replication section)

Failover (CNPG) uses PUT to update the cluster with targetPrimary annotation.

**Step 2: Add "Monitoring" tab (show only when engine supports it)**
**Step 3: Commit**

```bash
git commit -m "task(databases): add Monitoring tab with replication status and failover"
```

---

### Task 24: Final integration test and cleanup

**Files:**
- All modified files

**Step 1: Run full frontend lint**

```bash
cd frontend && npm run lint
```

**Step 2: Run all frontend tests**

```bash
cd frontend && npm test
```

**Step 3: Fix any failures**
**Step 4: Final commit**

```bash
git commit -m "task(cleanup): lint fixes and test adjustments for wizard/app/db revision"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1 - Infrastructure | 1-4 | Enhanced Combobox, ConfirmDialog, ManifestPreview, InlineResourceCreator |
| 2 - Wizard Refactor | 5-12 | All 8 wizards unified, inline creation in HTTPRoute/DB wizards |
| 3 - Apps CRUD | 13-16 | Delete, Edit, Environments tab, Rollout undo |
| 4 - Databases | 17-23 | Delete, Edit/Scale, Backups, Users, Connection, Logs, Monitoring |
| Cleanup | 24 | Lint + test pass |
