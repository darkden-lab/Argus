"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Cpu, MemoryStick, AlertTriangle, Radio, Loader2 } from "lucide-react";

interface MetricsData {
  cpuUsage: number | null;
  memoryUsage: number | null;
  alertsCount: number;
  targetsUp: number;
  targetsTotal: number;
}

interface MetricsOverviewProps {
  clusterId: string;
}

export function MetricsOverview({ clusterId }: MetricsOverviewProps) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!clusterId) return;

    const fetchMetrics = () => {
      api
        .get<MetricsData>(
          `/api/plugins/prometheus/${clusterId}/metrics/overview`
        )
        .then((data) => {
          setMetrics(data);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load metrics");
        })
        .finally(() => setLoading(false));
    };

    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clusterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500 text-center py-4">{error}</p>
    );
  }

  if (!metrics) return null;

  const cards = [
    {
      label: "CPU Usage",
      value: metrics.cpuUsage != null ? `${metrics.cpuUsage.toFixed(1)}%` : "--",
      icon: Cpu,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Memory Usage",
      value: metrics.memoryUsage != null ? `${metrics.memoryUsage.toFixed(1)}%` : "--",
      icon: MemoryStick,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Active Alerts",
      value: String(metrics.alertsCount),
      icon: AlertTriangle,
      color: metrics.alertsCount > 0 ? "text-amber-500" : "text-emerald-500",
      bg: metrics.alertsCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
    },
    {
      label: "Targets",
      value: `${metrics.targetsUp}/${metrics.targetsTotal}`,
      icon: Radio,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}
              >
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-lg font-bold">{card.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
