"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ClusterInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  apiServer: string;
  lastCheck: string;
}

const statusConfig = {
  connected: { label: "Connected", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" },
  disconnected: { label: "Disconnected", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
  error: { label: "Error", className: "bg-red-500/15 text-red-500 border-red-500/20" },
} as const;

interface ClusterHealthCardProps {
  clusters: ClusterInfo[];
}

export function ClusterHealthCard({ clusters }: ClusterHealthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Cluster Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {clusters.length === 0 && (
            <p className="text-sm text-muted-foreground">No clusters configured.</p>
          )}
          {clusters.map((cluster) => {
            const cfg = statusConfig[cluster.status];
            return (
              <div
                key={cluster.id}
                className="flex items-center justify-between rounded-lg border border-border/50 p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{cluster.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {cluster.apiServer}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className={cfg.className}>
                    {cfg.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {cluster.lastCheck}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
