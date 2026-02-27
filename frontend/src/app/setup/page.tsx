'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Network,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Shield,
  KeyRound,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const STEPS = ['Welcome', 'Create Admin', 'OIDC', 'Complete'] as const;

interface SetupForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

interface SetupResponse {
  access_token: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    display_name: string;
  };
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, index) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300 ${
                index < currentStep
                  ? 'border-primary bg-primary text-primary-foreground'
                  : index === currentStep
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground/50'
              }`}
            >
              {index < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`mt-1.5 text-[10px] font-medium transition-colors duration-300 ${
                index <= currentStep
                  ? 'text-foreground'
                  : 'text-muted-foreground/50'
              }`}
            >
              {label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`mx-1 h-0.5 w-10 rounded-full transition-colors duration-300 mb-5 ${
                index < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
          <Network className="h-8 w-8 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">Welcome to Argus</CardTitle>
        <CardDescription className="text-base">
          Multi-cluster Kubernetes Dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-6">
        <p className="text-muted-foreground leading-relaxed">
          Let&apos;s set up your first admin account. This will only take a
          moment. You&apos;ll be able to manage clusters, configure plugins, and
          monitor your infrastructure right away.
        </p>
        <Button onClick={onNext} className="w-full">
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function CreateAdminStep({
  form,
  onChange,
  onNext,
  onBack,
  error,
  isSubmitting,
}: {
  form: SetupForm;
  onChange: (field: keyof SetupForm, value: string) => void;
  onNext: () => void;
  onBack: () => void;
  error: string;
  isSubmitting: boolean;
}) {
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;
  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const isValid =
    form.email.length > 0 &&
    form.password.length >= 8 &&
    form.password === form.confirmPassword &&
    form.displayName.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !isSubmitting) {
      onNext();
    }
  };

  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">Create Admin Account</CardTitle>
        <CardDescription>
          Set up the first administrator for your Argus instance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="Admin"
              value={form.displayName}
              onChange={(e) => onChange('displayName', e.target.value)}
              required
              autoComplete="name"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={form.email}
              onChange={(e) => onChange('email', e.target.value)}
              required
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={(e) => onChange('password', e.target.value)}
              required
              autoComplete="new-password"
              disabled={isSubmitting}
            />
            {passwordTooShort && (
              <p className="text-xs text-destructive">
                Password must be at least 8 characters
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              value={form.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              required
              autoComplete="new-password"
              disabled={isSubmitting}
            />
            {passwordMismatch && (
              <p className="text-xs text-destructive">
                Passwords do not match
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function OidcStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
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
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can configure SSO/OIDC authentication later in{' '}
            <span className="font-medium text-foreground">
              Settings &gt; OIDC
            </span>{' '}
            after logging in. This supports providers like Google, Azure AD,
            Okta, Keycloak, and any OpenID Connect compatible identity provider.
          </p>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-muted-foreground/30 accent-primary"
            />
            <span className="text-sm text-muted-foreground">
              I&apos;ll configure this later
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onNext} className="w-full">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-2 ring-green-500/20">
          <Check className="h-8 w-8 text-green-500" />
        </div>
        <CardTitle className="text-2xl">Setup Complete</CardTitle>
        <CardDescription className="text-base">
          Your admin account has been created. You&apos;re now logged in.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can now add Kubernetes clusters, configure plugins, set up team
          members, and start monitoring your infrastructure.
        </p>
        <Button onClick={onFinish} className="w-full" size="lg">
          Go to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<SetupForm>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  useEffect(() => {
    fetch(`${API_URL}/api/setup/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.setup_required === false) {
          router.push('/dashboard');
        }
      })
      .catch(() => {});
  }, [router]);

  const updateField = (field: keyof SetupForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleCreateAdmin = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/setup/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          display_name: form.displayName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Setup failed (HTTP ${res.status})`);
      }

      const data: SetupResponse = await res.json();

      localStorage.setItem('access_token', data.access_token);
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }

      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    router.push('/dashboard');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Gradient glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight">Argus</h1>
          <p className="mt-1 text-sm text-muted-foreground">Initial Setup</p>
        </div>

        <StepIndicator currentStep={currentStep} />

        {currentStep === 0 && (
          <WelcomeStep onNext={() => setCurrentStep(1)} />
        )}

        {currentStep === 1 && (
          <CreateAdminStep
            form={form}
            onChange={updateField}
            onNext={handleCreateAdmin}
            onBack={() => setCurrentStep(0)}
            error={error}
            isSubmitting={isSubmitting}
          />
        )}

        {currentStep === 2 && (
          <OidcStep
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && <CompleteStep onFinish={handleFinish} />}

        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          Argus &mdash; Kubernetes Infrastructure Management
        </p>
      </div>
    </div>
  );
}
