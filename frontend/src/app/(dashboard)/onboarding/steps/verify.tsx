'use client';

import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VerifyResult {
  success: boolean;
  message: string;
}

export function VerifyStep({
  verifying,
  verifyResult,
  onNext,
  onBack,
  onRetry,
}: {
  verifying: boolean;
  verifyResult: VerifyResult | null;
  onNext: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      {verifying ? (
        <>
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="mt-6 text-lg font-medium">Verifying connection...</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Testing connectivity to your cluster. This usually takes a few seconds.
          </p>
        </>
      ) : verifyResult?.success ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <p className="mt-6 text-lg font-medium">Cluster Connected Successfully!</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {verifyResult.message}
          </p>
          <Button className="mt-8" onClick={onNext}>
            Continue
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </>
      ) : verifyResult ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <p className="mt-6 text-lg font-medium">Connection Failed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {verifyResult.message}
          </p>
          <div className="mt-4 rounded-md border border-dashed p-3 text-left">
            <p className="text-xs font-medium text-muted-foreground mb-2">Troubleshooting tips:</p>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
              <li>Make sure kubectl is configured correctly</li>
              <li>Check that the cluster API server is reachable</li>
              <li>For agent connections, ensure the pod is running: <code className="rounded bg-muted px-1 font-mono text-[11px]">kubectl get pods -n argus-system</code></li>
            </ul>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={onRetry}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Retry
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
