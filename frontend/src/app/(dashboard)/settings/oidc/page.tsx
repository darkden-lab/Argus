"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
import { Badge } from "@/components/ui/badge";
import { RBACGate } from "@/components/auth/rbac-gate";

interface OidcConfig {
  enabled: boolean;
  issuer_url: string;
  client_id: string;
  provider_name: string;
  redirect_url: string;
}

const emptyConfig: OidcConfig = {
  enabled: false,
  issuer_url: "",
  client_id: "",
  provider_name: "",
  redirect_url: "",
};

export default function OidcSettingsPage() {
  const [config, setConfig] = useState<OidcConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<OidcConfig>("/api/settings/oidc")
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/api/settings/oidc", config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Error handling can be extended later
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading OIDC settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>OIDC / SSO Configuration</CardTitle>
              <CardDescription>
                Configure OpenID Connect for single sign-on authentication.
              </CardDescription>
            </div>
            <Badge variant={config.enabled ? "default" : "secondary"}>
              {config.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-name">Provider Name</Label>
            <Input
              id="provider-name"
              placeholder="e.g. Okta, Auth0, Keycloak"
              value={config.provider_name}
              onChange={(e) =>
                setConfig((c) => ({ ...c, provider_name: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Displayed on the login button as &quot;Sign in with [name]&quot;.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuer-url">Issuer URL</Label>
            <Input
              id="issuer-url"
              placeholder="https://your-provider.com/realms/your-realm"
              value={config.issuer_url}
              onChange={(e) =>
                setConfig((c) => ({ ...c, issuer_url: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID</Label>
            <Input
              id="client-id"
              placeholder="your-client-id"
              value={config.client_id}
              onChange={(e) =>
                setConfig((c) => ({ ...c, client_id: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="redirect-url">Redirect URL</Label>
            <Input
              id="redirect-url"
              placeholder="https://your-dashboard.com/auth/oidc/callback"
              value={config.redirect_url}
              onChange={(e) =>
                setConfig((c) => ({ ...c, redirect_url: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              The callback URL configured in your OIDC provider.
            </p>
          </div>

          <RBACGate resource="settings" action="write">
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Configuration"}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-500">
                  Configuration saved.
                </span>
              )}
            </div>
          </RBACGate>
        </CardContent>
      </Card>
    </div>
  );
}
