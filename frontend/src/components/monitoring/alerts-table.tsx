"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface Alert {
  name: string;
  state: string;
  severity: string;
  activeAt: string;
}

interface AlertsResponse {
  alerts: Alert[];
}

interface AlertsTableProps {
  clusterId: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertsTable({ clusterId }: AlertsTableProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    api
      .get<AlertsResponse>(`/api/plugins/prometheus/${clusterId}/alerts`)
      .then((data) => {
        setAlerts(data.alerts ?? []);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load alerts")
      )
      .finally(() => setLoading(false));
  }, [clusterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 text-center py-4">{error}</p>;
  }

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No active alerts.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Alert Name</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Active Since</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert, i) => (
          <TableRow key={`${alert.name}-${i}`}>
            <TableCell className="font-medium text-xs">
              {alert.name}
            </TableCell>
            <TableCell>
              <Badge
                variant={alert.state === "firing" ? "destructive" : "outline"}
                className="text-[10px]"
              >
                {alert.state}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  alert.severity === "critical"
                    ? "destructive"
                    : alert.severity === "warning"
                      ? "outline"
                      : "secondary"
                }
                className="text-[10px]"
              >
                {alert.severity}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {alert.activeAt ? formatRelativeTime(alert.activeAt) : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
