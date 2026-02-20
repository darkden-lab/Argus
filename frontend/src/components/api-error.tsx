"use client";

import { AlertCircle, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApiErrorProps {
  error: string;
  onRetry?: () => void;
}

export function ApiError({ error, onRetry }: ApiErrorProps) {
  const isForbidden = error.includes("403") || error.toLowerCase().includes("forbidden");

  if (isForbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="rounded-full bg-destructive/10 p-3 mb-4">
          <ShieldOff className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Access Denied</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          You do not have permission to view this resource. Contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold mb-1">Failed to load data</h2>
      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
        {error}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
