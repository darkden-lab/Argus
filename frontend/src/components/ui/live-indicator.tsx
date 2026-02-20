"use client";

import { useRelativeTime } from "@/hooks/use-k8s-websocket";

interface LiveIndicatorProps {
  isConnected: boolean;
  lastUpdated: Date | null;
}

export function LiveIndicator({ isConnected, lastUpdated }: LiveIndicatorProps) {
  const relativeTime = useRelativeTime(lastUpdated);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2.5 w-2.5">
        {isConnected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            isConnected ? "bg-emerald-500" : "bg-zinc-500"
          }`}
        />
      </span>
      <span>
        {isConnected ? "Live" : "Disconnected"}
        {lastUpdated && ` \u00B7 ${relativeTime}`}
      </span>
    </div>
  );
}
