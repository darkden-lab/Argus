'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { WelcomeStep } from './steps/welcome';
import { CreateAdminStep, type SetupForm } from './steps/create-admin';
import { OidcStep } from './steps/oidc';
import { CompleteStep } from './steps/complete';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const STEPS = [
  { label: 'Welcome' },
  { label: 'Create Admin' },
  { label: 'OIDC' },
  { label: 'Complete' },
];

async function setupFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed (HTTP ${res.status})`);
  }
  return res.json();
}

interface SetupResponse {
  access_token: string;
  refresh_token?: string;
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
      const data = await setupFetch<SetupResponse>('/api/setup/init', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          display_name: form.displayName,
        }),
      });

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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight">Argus</h1>
          <p className="mt-1 text-sm text-muted-foreground">Initial Setup</p>
        </div>

        <ProgressSteps steps={STEPS} currentStep={currentStep} className="mb-8" />

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

        {currentStep === 3 && (
          <CompleteStep onFinish={() => router.push('/dashboard')} />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          Argus &mdash; Kubernetes Infrastructure Management
        </p>
      </div>
    </div>
  );
}
