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

interface Target {
  target: string;
  scrapePool: string;
  health: string;
  lastScrape: string;
  lastError: string;
}

interface TargetsResponse {
  targets: Target[];
}

interface TargetsTableProps {
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

export function TargetsTable({ clusterId }: TargetsTableProps) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    api
      .get<TargetsResponse>(`/api/plugins/prometheus/${clusterId}/targets`)
      .then((data) => {
        setTargets(data.targets ?? []);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load targets")
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

  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No scrape targets found.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Target</TableHead>
          <TableHead>Scrape Pool</TableHead>
          <TableHead>Health</TableHead>
          <TableHead>Last Scrape</TableHead>
          <TableHead>Last Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {targets.map((t, i) => (
          <TableRow key={`${t.target}-${i}`}>
            <TableCell className="font-mono text-xs">{t.target}</TableCell>
            <TableCell className="text-xs">{t.scrapePool}</TableCell>
            <TableCell>
              <Badge
                variant={t.health === "up" ? "outline" : "destructive"}
                className={`text-[10px] ${t.health === "up" ? "border-emerald-500/30 text-emerald-500" : ""}`}
              >
                {t.health}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {t.lastScrape ? formatRelativeTime(t.lastScrape) : "-"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
              {t.lastError || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
