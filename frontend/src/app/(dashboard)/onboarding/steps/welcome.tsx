'use client';

import { Button } from '@/components/ui/button';
import {
  Bot,
  ArrowRight,
  LayoutGrid,
  Rocket,
  Network,
} from 'lucide-react';

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <Network className="h-10 w-10 text-primary" />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Welcome to Argus</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Your command center for all Kubernetes clusters. Monitor, deploy,
        and manage your infrastructure without the complexity.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium">Unified Dashboard</p>
          <p className="text-[11px] text-muted-foreground">See all your clusters at a glance</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Rocket className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium">Smart Monitoring</p>
          <p className="text-[11px] text-muted-foreground">Know when things go wrong before your users do</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Bot className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium">AI Copilot</p>
          <p className="text-[11px] text-muted-foreground">Get answers and troubleshoot issues in natural language</p>
        </div>
      </div>
      <Button className="mt-8" size="lg" onClick={onNext}>
        Get Started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
