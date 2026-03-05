'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Network, ArrowRight, LayoutGrid, Puzzle, Bot } from 'lucide-react';

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
          <Network className="h-8 w-8 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">Welcome to Argus</CardTitle>
        <CardDescription className="text-base">
          Your command center for Kubernetes
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-6">
        <p className="text-muted-foreground leading-relaxed">
          Argus brings all your Kubernetes clusters into a single, intuitive dashboard.
          Let&apos;s get you set up &mdash; it only takes a minute.
        </p>

        <div className="grid grid-cols-3 gap-4 text-center pt-2">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Multi-cluster Management</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Puzzle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Plugin Ecosystem</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">AI-Powered Insights</p>
          </div>
        </div>

        <Button onClick={onNext} className="w-full" size="lg">
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
