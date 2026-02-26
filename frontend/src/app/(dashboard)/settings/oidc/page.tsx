"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RBACGate } from "@/components/auth/rbac-gate";
import {
  Shield,
  Check,
  X,
  Loader2,
  ExternalLink,
  TestTube2,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OidcConfig {
  enabled: boolean;
  provider_type: string;
  provider_name: string;
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  redirect_url: string;
  groups_claim: string;
  extra_scopes?: string[];
  tenant_id?: string;
}

interface ProviderExtraField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  issuer_format: string;
  groups_claim: string;
  extra_scopes?: string[];
  extra_fields?: ProviderExtraField[];
}

interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
}

interface GroupMapping {
  id: string;
  oidc_group: string;
  role_id: string;
  role_name: string;
  cluster_id?: string;
  namespace?: string;
  created_at: string;
}

interface NewMappingForm {
  oidc_group: string;
  role_name: string;
  cluster_id: string;
  namespace: string;
}

const AVAILABLE_ROLES = ["admin", "operator", "developer", "viewer"] as const;
const DEFAULT_ROLE_OPTIONS = ["none", "viewer", "developer", "operator"] as const;

// ---------------------------------------------------------------------------
// Provider icon colors for visual distinction
// ---------------------------------------------------------------------------

const PROVIDER_STYLES: Record<string, { color: string; bg: string }> = {
  entraid: { color: "text-blue-600", bg: "bg-blue-500/10" },
  google: { color: "text-red-500", bg: "bg-red-500/10" },
  okta: { color: "text-indigo-500", bg: "bg-indigo-500/10" },
  auth0: { color: "text-orange-500", bg: "bg-orange-500/10" },
  keycloak: { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  generic: { color: "text-slate-500", bg: "bg-slate-500/10" },
};

function getProviderStyle(id: string) {
  return PROVIDER_STYLES[id] ?? PROVIDER_STYLES.generic;
}

// ---------------------------------------------------------------------------
// Empty config factory
// ---------------------------------------------------------------------------

function makeEmptyConfig(): OidcConfig {
  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/oidc/callback`
      : "";

  return {
    enabled: false,
    provider_type: "",
    provider_name: "",
    issuer_url: "",
    client_id: "",
    client_secret: undefined,
    redirect_url: redirectUrl,
    groups_claim: "",
    extra_scopes: [],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OidcSettingsPage() {
  const [config, setConfig] = useState<OidcConfig>(makeEmptyConfig);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  // Group Mappings state
  const [mappings, setMappings] = useState<GroupMapping[]>([]);
  const [defaultRole, setDefaultRole] = useState<string>("none");
  const [savingDefaultRole, setSavingDefaultRole] = useState(false);
  const [addingMapping, setAddingMapping] = useState(false);
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null);
  const [newMapping, setNewMapping] = useState<NewMappingForm>({
    oidc_group: "",
    role_name: "viewer",
    cluster_id: "",
    namespace: "",
  });

  // -----------------------------------------------------------------------
  // Load presets + current config
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      try {
        const [presetsData, configData, mappingsData, defaultRoleData] = await Promise.all([
          api.get<ProviderPreset[]>("/api/settings/oidc/providers"),
          api.get<OidcConfig>("/api/settings/oidc"),
          api.get<GroupMapping[]>("/api/settings/oidc/mappings").catch(() => [] as GroupMapping[]),
          api.get<{ default_role: string }>("/api/settings/oidc/default-role").catch(() => ({ default_role: "none" })),
        ]);

        setMappings(mappingsData);
        setDefaultRole(defaultRoleData.default_role || "none");

        setPresets(presetsData);

        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/oidc/callback`
            : "";

        const merged: OidcConfig = {
          ...makeEmptyConfig(),
          ...configData,
          redirect_url: configData.redirect_url || redirectUrl,
        };
        setConfig(merged);
        setHasExistingSecret(Boolean(configData.client_id));

        // Reconstruct extra field values from issuer_url if provider_type is set
        if (configData.provider_type && presetsData.length > 0) {
          const preset = presetsData.find((p) => p.id === configData.provider_type);
          if (preset?.extra_fields) {
            const extracted = extractExtraFieldValues(
              preset,
              configData.issuer_url,
              configData.tenant_id
            );
            setExtraFieldValues(extracted);
          }
        }
      } catch {
        toast("Error", {
          description: "Failed to load OIDC configuration",
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // -----------------------------------------------------------------------
  // Extract extra field values from an existing issuer URL
  // -----------------------------------------------------------------------

  function extractExtraFieldValues(
    preset: ProviderPreset,
    issuerUrl: string,
    tenantId?: string
  ): Record<string, string> {
    const values: Record<string, string> = {};

    if (!preset.extra_fields) return values;

    for (const field of preset.extra_fields) {
      if (field.key === "tenant_id" && tenantId) {
        values[field.key] = tenantId;
      } else {
        // Try to extract value from the issuer URL using the format template
        const escaped = preset.issuer_format
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\\{\\{[^}]+\\}\\}/g, "(.+)");
        const placeholders = [...preset.issuer_format.matchAll(/\{\{(\w+)\}\}/g)].map(
          (m) => m[1]
        );
        const regex = new RegExp(`^${escaped}$`);
        const match = issuerUrl.match(regex);

        if (match) {
          const idx = placeholders.indexOf(field.key);
          if (idx >= 0 && match[idx + 1]) {
            values[field.key] = match[idx + 1];
          }
        }
      }
    }

    return values;
  }

  // -----------------------------------------------------------------------
  // Build issuer URL from template + extra field values
  // -----------------------------------------------------------------------

  const buildIssuerUrl = useCallback(
    (preset: ProviderPreset, fieldValues: Record<string, string>): string => {
      let url = preset.issuer_format;
      for (const [key, value] of Object.entries(fieldValues)) {
        url = url.replace(`{{${key}}}`, value);
      }
      return url;
    },
    []
  );

  // -----------------------------------------------------------------------
  // Provider card selection
  // -----------------------------------------------------------------------

  function handleSelectProvider(preset: ProviderPreset) {
    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/oidc/callback`
        : "";

    const newExtraFieldValues: Record<string, string> = {};
    if (preset.extra_fields) {
      for (const field of preset.extra_fields) {
        newExtraFieldValues[field.key] = "";
      }
    }

    setExtraFieldValues(newExtraFieldValues);
    setTestResult({ status: "idle" });

    setConfig((prev) => ({
      ...prev,
      provider_type: preset.id,
      provider_name: preset.name,
      issuer_url: preset.extra_fields?.length ? "" : preset.issuer_format,
      groups_claim: preset.groups_claim,
      extra_scopes: preset.extra_scopes ?? [],
      redirect_url: prev.redirect_url || redirectUrl,
    }));
  }

  // -----------------------------------------------------------------------
  // Handle extra field change (rebuild issuer URL)
  // -----------------------------------------------------------------------

  function handleExtraFieldChange(key: string, value: string) {
    const newValues = { ...extraFieldValues, [key]: value };
    setExtraFieldValues(newValues);

    const selectedPreset = presets.find((p) => p.id === config.provider_type);
    if (selectedPreset) {
      const issuerUrl = buildIssuerUrl(selectedPreset, newValues);
      setConfig((prev) => ({
        ...prev,
        issuer_url: issuerUrl,
        ...(key === "tenant_id" ? { tenant_id: value } : {}),
      }));
    }
  }

  // -----------------------------------------------------------------------
  // Test connection
  // -----------------------------------------------------------------------

  async function handleTestConnection() {
    if (!config.issuer_url) {
      setTestResult({ status: "error", message: "Issuer URL is required" });
      return;
    }

    setTestResult({ status: "testing" });

    try {
      await api.post("/api/settings/oidc/test", {
        issuer_url: config.issuer_url,
      });
      setTestResult({ status: "success", message: "Connection successful" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection test failed";
      setTestResult({ status: "error", message });
    }
  }

  // -----------------------------------------------------------------------
  // Save configuration
  // -----------------------------------------------------------------------

  async function handleSave() {
    if (!config.provider_type) {
      toast("Validation Error", {
        description: "Please select a provider",
        variant: "error",
      });
      return;
    }

    if (!config.issuer_url || !config.client_id) {
      toast("Validation Error", {
        description: "Issuer URL and Client ID are required",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const payload: OidcConfig = { ...config };
      // Only send client_secret if it was actually changed
      if (!payload.client_secret) {
        delete payload.client_secret;
      }

      await api.put("/api/settings/oidc", payload);
      setHasExistingSecret(Boolean(payload.client_secret) || hasExistingSecret);
      toast("Configuration Saved", {
        description: "OIDC settings have been updated successfully",
        variant: "success",
      });
    } catch {
      toast("Save Failed", {
        description: "Failed to save OIDC configuration",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Group Mappings: Save default role
  // -----------------------------------------------------------------------

  async function handleSaveDefaultRole(role: string) {
    setSavingDefaultRole(true);
    try {
      await api.put("/api/settings/oidc/default-role", { default_role: role });
      setDefaultRole(role);
      toast("Default Role Updated", {
        description: `Default role set to "${role}"`,
        variant: "success",
      });
    } catch {
      toast("Save Failed", {
        description: "Failed to update default role",
        variant: "error",
      });
    } finally {
      setSavingDefaultRole(false);
    }
  }

  // -----------------------------------------------------------------------
  // Group Mappings: Add mapping
  // -----------------------------------------------------------------------

  async function handleAddMapping() {
    if (!newMapping.oidc_group.trim()) {
      toast("Validation Error", {
        description: "OIDC Group is required",
        variant: "error",
      });
      return;
    }

    setAddingMapping(true);
    try {
      const payload = {
        oidc_group: newMapping.oidc_group.trim(),
        role_name: newMapping.role_name,
        cluster_id: newMapping.cluster_id.trim() || null,
        namespace: newMapping.namespace.trim() || null,
      };

      const created = await api.post<GroupMapping>("/api/settings/oidc/mappings", payload);
      setMappings((prev) => [...prev, created]);
      setNewMapping({ oidc_group: "", role_name: "viewer", cluster_id: "", namespace: "" });
      toast("Mapping Added", {
        description: `Group "${payload.oidc_group}" mapped to role "${payload.role_name}"`,
        variant: "success",
      });
    } catch {
      toast("Failed to Add Mapping", {
        description: "Could not create the group mapping",
        variant: "error",
      });
    } finally {
      setAddingMapping(false);
    }
  }

  // -----------------------------------------------------------------------
  // Group Mappings: Delete mapping
  // -----------------------------------------------------------------------

  async function handleDeleteMapping(mapping: GroupMapping) {
    setDeletingMappingId(mapping.id);
    try {
      await api.del(`/api/settings/oidc/mappings/${mapping.id}`);
      setMappings((prev) => prev.filter((m) => m.id !== mapping.id));
      toast("Mapping Deleted", {
        description: `Removed mapping for group "${mapping.oidc_group}"`,
        variant: "success",
      });
    } catch {
      toast("Delete Failed", {
        description: "Could not delete the group mapping",
        variant: "error",
      });
    } finally {
      setDeletingMappingId(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading OIDC settings...
      </div>
    );
  }

  const selectedPreset = presets.find((p) => p.id === config.provider_type);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            OIDC / SSO Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure OpenID Connect for single sign-on authentication.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {config.enabled ? "Enabled" : "Disabled"}
          </span>
          <Switch
            id="oidc-enabled"
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig((c) => ({ ...c, enabled: checked }))
            }
          />
        </div>
      </div>

      {/* Provider selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identity Provider</CardTitle>
          <CardDescription>
            Select your identity provider to auto-fill configuration defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presets.map((preset) => {
              const style = getProviderStyle(preset.id);
              const isSelected = config.provider_type === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectProvider(preset)}
                  className={`relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute right-2 top-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${style.bg}`}
                  >
                    <Shield className={`h-5 w-5 ${style.color}`} />
                  </div>
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium">{preset.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {preset.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Configuration form — only shown when a provider is selected */}
      {selectedPreset && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedPreset.name} Configuration
            </CardTitle>
            <CardDescription>
              Fill in the details from your {selectedPreset.name} application
              registration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Provider Name */}
            <div className="space-y-2">
              <Label htmlFor="provider-name">Provider Name</Label>
              <Input
                id="provider-name"
                placeholder="e.g. Microsoft, Google"
                value={config.provider_name}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, provider_name: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Displayed on the login button as &quot;Sign in with [name]&quot;.
              </p>
            </div>

            {/* Extra fields (dynamic per provider) */}
            {selectedPreset.extra_fields?.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`extra-${field.key}`}>
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id={`extra-${field.key}`}
                  placeholder={field.placeholder}
                  value={extraFieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    handleExtraFieldChange(field.key, e.target.value)
                  }
                />
              </div>
            ))}

            {/* Issuer URL */}
            <div className="space-y-2">
              <Label htmlFor="issuer-url">Issuer URL</Label>
              <div className="flex gap-2">
                <Input
                  id="issuer-url"
                  placeholder="https://your-provider.com/.well-known/openid-configuration"
                  value={config.issuer_url}
                  readOnly={
                    Boolean(selectedPreset.extra_fields?.length) &&
                    selectedPreset.id !== "generic"
                  }
                  className={
                    selectedPreset.extra_fields?.length &&
                    selectedPreset.id !== "generic"
                      ? "bg-muted"
                      : ""
                  }
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, issuer_url: e.target.value }))
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={
                    !config.issuer_url || testResult.status === "testing"
                  }
                  className="shrink-0"
                >
                  {testResult.status === "testing" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <TestTube2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test
                </Button>
              </div>

              {/* Test result feedback */}
              {testResult.status === "success" && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  {testResult.message}
                </div>
              )}
              {testResult.status === "error" && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <X className="h-3.5 w-3.5" />
                  {testResult.message}
                </div>
              )}

              {selectedPreset.extra_fields?.length &&
                selectedPreset.id !== "generic" ? (
                <p className="text-xs text-muted-foreground">
                  Auto-generated from the fields above. Verify it matches your
                  provider&apos;s discovery URL.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The OpenID Connect issuer URL. Must support
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
                    .well-known/openid-configuration
                  </code>
                  discovery.
                </p>
              )}
            </div>

            {/* Client ID */}
            <div className="space-y-2">
              <Label htmlFor="client-id">
                Client ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-id"
                placeholder="your-client-id"
                value={config.client_id}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, client_id: e.target.value }))
                }
              />
            </div>

            {/* Client Secret */}
            <div className="space-y-2">
              <Label htmlFor="client-secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="client-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder={
                    hasExistingSecret
                      ? "Leave blank to keep current secret"
                      : "your-client-secret"
                  }
                  value={config.client_secret ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      client_secret: e.target.value || undefined,
                    }))
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showSecret ? "Hide secret" : "Show secret"}
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {hasExistingSecret && (
                <p className="text-xs text-muted-foreground">
                  A secret is already configured. Leave blank to keep it
                  unchanged.
                </p>
              )}
            </div>

            {/* Redirect URL */}
            <div className="space-y-2">
              <Label htmlFor="redirect-url">Redirect URL</Label>
              <div className="flex gap-2">
                <Input
                  id="redirect-url"
                  placeholder="https://your-dashboard.com/auth/oidc/callback"
                  value={config.redirect_url}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, redirect_url: e.target.value }))
                  }
                />
                {config.redirect_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(config.redirect_url);
                      toast("Copied", {
                        description: "Redirect URL copied to clipboard",
                        variant: "success",
                      });
                    }}
                    aria-label="Copy redirect URL"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Register this URL in your identity provider as an allowed
                callback.
              </p>
            </div>

            {/* Groups Claim */}
            <div className="space-y-2">
              <Label htmlFor="groups-claim">Groups Claim</Label>
              <Input
                id="groups-claim"
                placeholder="groups"
                value={config.groups_claim}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, groups_claim: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                The JWT claim that contains the user&apos;s group memberships for RBAC
                mapping.
              </p>
            </div>

            {/* Extra Scopes */}
            <div className="space-y-2">
              <Label htmlFor="extra-scopes">Extra Scopes</Label>
              <Input
                id="extra-scopes"
                placeholder="profile, email"
                value={(config.extra_scopes ?? []).join(", ")}
                onChange={(e) => {
                  const scopes = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setConfig((c) => ({ ...c, extra_scopes: scopes }));
                }}
              />
              <p className="text-xs text-muted-foreground">
                Additional OAuth scopes to request (comma-separated). The
                &quot;openid&quot; scope is always included.
              </p>
            </div>

            {/* Save */}
            <RBACGate resource="settings" action="write">
              <div className="flex items-center gap-3 border-t pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Configuration"
                  )}
                </Button>
              </div>
            </RBACGate>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Group Mappings Section                                             */}
      {/* ----------------------------------------------------------------- */}

      <div className="border-t border-border" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
              <Users className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-lg">OIDC Group Mappings</CardTitle>
              <CardDescription>
                Map OIDC groups to internal RBAC roles. Users logging in via OIDC
                will be automatically assigned roles based on their group
                memberships.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Role Selector */}
          <div className="space-y-2">
            <Label htmlFor="default-role">Default role for new OIDC users</Label>
            <div className="flex items-center gap-3">
              <select
                id="default-role"
                value={defaultRole}
                onChange={(e) => handleSaveDefaultRole(e.target.value)}
                disabled={savingDefaultRole}
                className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Default role for new OIDC users"
              >
                {DEFAULT_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role === "none" ? "None (no default role)" : role}
                  </option>
                ))}
              </select>
              {savingDefaultRole && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Role assigned to OIDC users whose groups don&apos;t match any mapping
              below.
            </p>
          </div>

          {/* Mappings Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Active Mappings</h3>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      OIDC Group
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      Scope
                    </th>
                    <th className="w-16 px-4 py-2.5 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No group mappings configured. Add one below.
                      </td>
                    </tr>
                  )}
                  {mappings.map((mapping) => (
                    <tr key={mapping.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {mapping.oidc_group}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {mapping.role_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {mapping.cluster_id && mapping.namespace
                          ? `${mapping.cluster_id} / ${mapping.namespace}`
                          : mapping.cluster_id
                            ? `Cluster: ${mapping.cluster_id}`
                            : mapping.namespace
                              ? `Namespace: ${mapping.namespace}`
                              : "Global"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <RBACGate resource="settings" action="write">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteMapping(mapping)}
                            disabled={deletingMappingId === mapping.id}
                            aria-label={`Delete mapping for group ${mapping.oidc_group}`}
                          >
                            {deletingMappingId === mapping.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </RBACGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Mapping Form */}
          <RBACGate resource="settings" action="write">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Add New Mapping</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-oidc-group" className="text-xs">
                    OIDC Group <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-oidc-group"
                    placeholder="e.g. K8s-Admins"
                    value={newMapping.oidc_group}
                    onChange={(e) =>
                      setNewMapping((m) => ({ ...m, oidc_group: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-role" className="text-xs">
                    Role <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="new-role"
                    value={newMapping.role_name}
                    onChange={(e) =>
                      setNewMapping((m) => ({ ...m, role_name: e.target.value }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Role for new mapping"
                  >
                    {AVAILABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-cluster" className="text-xs">
                    Cluster
                  </Label>
                  <Input
                    id="new-cluster"
                    placeholder="All clusters"
                    value={newMapping.cluster_id}
                    onChange={(e) =>
                      setNewMapping((m) => ({ ...m, cluster_id: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-namespace" className="text-xs">
                    Namespace
                  </Label>
                  <Input
                    id="new-namespace"
                    placeholder="All namespaces"
                    value={newMapping.namespace}
                    onChange={(e) =>
                      setNewMapping((m) => ({ ...m, namespace: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button
                onClick={handleAddMapping}
                disabled={addingMapping || !newMapping.oidc_group.trim()}
                size="sm"
              >
                {addingMapping ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-3.5 w-3.5" />
                )}
                Add Mapping
              </Button>
            </div>
          </RBACGate>
        </CardContent>
      </Card>
    </div>
  );
}
