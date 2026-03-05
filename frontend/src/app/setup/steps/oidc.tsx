'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

interface OidcForm {
  issuer_url: string;
  client_id: string;
  client_secret: string;
  redirect_url: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function OidcStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [skipOidc, setSkipOidc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [oidcForm, setOidcForm] = useState<OidcForm>({
    issuer_url: '',
    client_id: '',
    client_secret: '',
    redirect_url: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
  });

  const updateField = (field: keyof OidcForm, value: string) => {
    setOidcForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const isValid = oidcForm.issuer_url && oidcForm.client_id && oidcForm.client_secret;

  async function handleSaveOidc() {
    if (!isValid) return;
    setSaving(true);
    setError('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${API_URL}/api/settings/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(oidcForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to save OIDC settings (HTTP ${res.status})`);
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OIDC settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">SSO / OIDC Configuration</CardTitle>
        <CardDescription>
          Configure Single Sign-On for your organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipOidc}
            onChange={(e) => setSkipOidc(e.target.checked)}
            className="h-4 w-4 rounded border-muted-foreground/30 accent-primary"
          />
          <span className="text-sm text-muted-foreground">
            I&apos;ll set this up later in Settings &gt; Authentication
          </span>
        </label>

        {!skipOidc && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect Argus to your identity provider (Google Workspace, Azure AD, Okta, Keycloak, etc.) so your team can sign in with their existing accounts.
            </p>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="oidc-issuer">Issuer URL</Label>
              <Input
                id="oidc-issuer"
                placeholder="https://accounts.google.com"
                value={oidcForm.issuer_url}
                onChange={(e) => updateField('issuer_url', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">The OpenID Connect discovery URL of your identity provider</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oidc-client-id">Client ID</Label>
              <Input
                id="oidc-client-id"
                placeholder="your-client-id"
                value={oidcForm.client_id}
                onChange={(e) => updateField('client_id', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">The application/client ID from your identity provider</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oidc-client-secret">Client Secret</Label>
              <Input
                id="oidc-client-secret"
                type="password"
                placeholder="your-client-secret"
                value={oidcForm.client_secret}
                onChange={(e) => updateField('client_secret', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">The secret associated with your application registration</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oidc-redirect">Redirect URL</Label>
              <Input
                id="oidc-redirect"
                placeholder="https://argus.example.com/auth/callback"
                value={oidcForm.redirect_url}
                onChange={(e) => updateField('redirect_url', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">This URL must be registered in your identity provider&apos;s allowed redirect URIs</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {skipOidc ? (
            <Button onClick={onNext} className="w-full">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSaveOidc}
              disabled={!isValid || saving}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
