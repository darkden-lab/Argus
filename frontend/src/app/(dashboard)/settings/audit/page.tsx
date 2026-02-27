"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  FilterX,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { TableSkeleton } from "@/components/skeletons";
import { ApiError as ApiErrorDisplay } from "@/components/api-error";
import { EmptyState } from "@/components/empty-state";

interface AuditEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  cluster_id: string | null;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  timestamp: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

const ACTION_OPTIONS = [
  "create",
  "update",
  "delete",
  "get",
  "list",
  "login",
  "logout",
];

const PAGE_SIZE = 20;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" {
  const a = action.toLowerCase();
  if (a === "delete") return "destructive";
  if (a === "create" || a === "update") return "default";
  return "secondary";
}

function buildCsvContent(entries: AuditEntry[]): string {
  const header = "Timestamp,User,User ID,Cluster ID,Action,Resource,Details\n";
  const rows = entries.map((e) => {
    const details = JSON.stringify(e.details).replace(/"/g, '""');
    return `"${e.timestamp}","${e.username ?? ""}","${e.user_id ?? ""}","${e.cluster_id ?? ""}","${e.action}","${e.resource}","${details}"`;
  });
  return header + rows.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [userId, setUserId] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [action, setAction] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchEntries = useCallback(
    async (newOffset = 0) => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(newOffset));
      if (userId) params.set("user_id", userId);
      if (clusterId) params.set("cluster_id", clusterId);
      if (action) params.set("action", action);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);

      try {
        const data = await api.get<AuditResponse>(`/api/audit-log?${params.toString()}`);
        setEntries(data.entries);
        setTotal(data.total);
        setOffset(newOffset);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [userId, clusterId, action, fromDate, toDate]
  );

  useEffect(() => {
    fetchEntries(0);
  }, [fetchEntries]);

  function handleClearFilters() {
    setUserId("");
    setClusterId("");
    setAction("");
    setFromDate("");
    setToDate("");
    setSearchInput("");
  }

  function handleExport() {
    const csv = buildCsvContent(entries);
    downloadCsv(csv, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters = userId || clusterId || action || fromDate || toDate;

  // Client-side search across displayed entries
  const displayed = searchInput
    ? entries.filter((e) => {
        const q = searchInput.toLowerCase();
        return (
          e.action.toLowerCase().includes(q) ||
          e.resource.toLowerCase().includes(q) ||
          (e.username ?? "").toLowerCase().includes(q) ||
          (e.user_id ?? "").toLowerCase().includes(q) ||
          (e.cluster_id ?? "").toLowerCase().includes(q)
        );
      })
    : entries;

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <ApiErrorDisplay error={error} onRetry={() => fetchEntries(offset)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={entries.length === 0}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={action} onValueChange={(v) => setAction(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[130px]" size="sm">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All actions</SelectItem>
              {ACTION_OPTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">User ID</label>
          <Input
            placeholder="Filter by user..."
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 w-[150px] text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Cluster ID</label>
          <Input
            placeholder="Filter by cluster..."
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            className="h-8 w-[150px] text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 w-[150px] text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 w-[150px] text-sm"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8">
            <FilterX className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Search within results */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search results..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : displayed.length === 0 ? (
        <EmptyState
          title="No audit entries found"
          description={
            hasFilters
              ? "Try adjusting your filters to see more results."
              : "Audit log entries will appear here as actions are performed."
          }
          action={hasFilters ? { label: "Clear filters", onClick: handleClearFilters } : undefined}
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Cluster</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(entry.timestamp)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.username ?? entry.user_id ?? <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionBadgeVariant(entry.action)} className="text-[10px]">
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.resource}</TableCell>
                        <TableCell className="text-sm">
                          {entry.cluster_id ?? <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${entry.id}-details`}>
                          <TableCell colSpan={6} className="bg-muted/50 p-4">
                            <div className="text-xs">
                              <p className="mb-2 font-medium text-muted-foreground">Details</p>
                              <pre className="overflow-auto rounded-md bg-background p-3 text-xs">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}--{Math.min(offset + PAGE_SIZE, total)} of {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => fetchEntries(offset - PAGE_SIZE)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => fetchEntries(offset + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
