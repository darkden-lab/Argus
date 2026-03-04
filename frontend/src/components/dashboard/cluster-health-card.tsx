"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface ClusterInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  apiServer: string;
  lastCheck: string;
  podCount?: number;
}

const statusConfig = {
  connected: { label: "Connected", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" },
  disconnected: { label: "Disconnected", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
  error: { label: "Error", className: "bg-red-500/15 text-red-500 border-red-500/20" },
} as const;

interface ClusterHealthCardProps {
  clusters: ClusterInfo[];
}

function usePodTrend(clusterId: string, podCount: number | undefined): "up" | "down" | null {
  const [trend, setTrend] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (podCount === undefined || typeof window === "undefined") return;

    const key = `argus_pods_prev_${clusterId}`;
    const prev = sessionStorage.getItem(key);
    if (prev !== null) {
      const prevCount = parseInt(prev, 10);
      if (podCount > prevCount) setTrend("up");
      else if (podCount < prevCount) setTrend("down");
      else setTrend(null);
    }
    sessionStorage.setItem(key, String(podCount));
  }, [clusterId, podCount]);

  return trend;
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
          {clusters.map((cluster) => (
            <ClusterHealthRow key={cluster.id} cluster={cluster} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ClusterHealthRow({ cluster }: { cluster: ClusterInfo }) {
  const cfg = statusConfig[cluster.status];
  const trend = usePodTrend(cluster.id, cluster.podCount);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium leading-none">{cluster.name}</p>
          {cluster.podCount !== undefined && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              ({cluster.podCount} pods
              {trend === "up" && <TrendingUp className="h-3 w-3 text-success" />}
              {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
              )
            </span>
          )}
        </div>
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
}
