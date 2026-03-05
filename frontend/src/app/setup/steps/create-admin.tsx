'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, ArrowRight, ArrowLeft, Loader2, Info } from 'lucide-react';

export interface SetupForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export function CreateAdminStep({
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
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>This will be the primary administrator account. You can add more team members later from Settings.</span>
          </div>

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
            <p className="text-xs text-muted-foreground">How your name will appear across the dashboard</p>
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
            <p className="text-xs text-muted-foreground">Used for login and notifications</p>
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
