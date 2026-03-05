'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Check, ArrowRight, Network, Settings, BookOpen } from 'lucide-react';

export function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-2 ring-green-500/20">
          <Check className="h-8 w-8 text-green-500" />
        </div>
        <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
        <CardDescription className="text-base">
          Your admin account is ready and you&apos;re logged in. Here&apos;s what to do next.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <button
            onClick={onFinish}
            className="w-full flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-left transition-colors hover:bg-primary/10"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Network className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect your first cluster</p>
              <p className="text-xs text-muted-foreground">Add a Kubernetes cluster to start monitoring workloads</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          <button
            onClick={onFinish}
            className="w-full flex items-center gap-3 rounded-lg border border-border/50 p-3.5 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Settings className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Explore settings</p>
              <p className="text-xs text-muted-foreground">Configure team access, plugins, and notifications</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          <a
            href="https://github.com/k8s-argus/argus#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 rounded-lg border border-border/50 p-3.5 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">View documentation</p>
              <p className="text-xs text-muted-foreground">Learn about features, plugins, and best practices</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        </div>

        <Button onClick={onFinish} className="w-full" size="lg">
          Go to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
