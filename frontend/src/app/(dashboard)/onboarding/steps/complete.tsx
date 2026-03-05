'use client';

import { CheckCircle2, Rocket, LayoutGrid, Upload, BarChart3, Shield, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function CompleteStep({
  onDashboard,
  onApps,
}: {
  onDashboard: () => void;
  onApps: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <CheckCircle2 className="h-10 w-10 text-primary" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Your Cluster is Ready!</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        Everything is connected and working. Start exploring your cluster resources,
        deploy applications, or set up monitoring.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={onApps}>
          <Rocket className="mr-1.5 h-4 w-4" />
          View Apps
        </Button>
        <Button variant="outline" onClick={() => router.push('/apps/deploy')}>
          <Upload className="mr-1.5 h-4 w-4" />
          Deploy an App
        </Button>
        <Button onClick={onDashboard}>
          <LayoutGrid className="mr-1.5 h-4 w-4" />
          Go to Dashboard
        </Button>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-6 max-w-md">
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          <p className="text-[11px]">Enable Prometheus plugin for real-time metrics</p>
        </div>
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <Shield className="h-4 w-4" />
          <p className="text-[11px]">Set up RBAC to control team access</p>
        </div>
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <p className="text-[11px]">Use the web terminal for quick kubectl commands</p>
        </div>
      </div>
    </div>
  );
}
