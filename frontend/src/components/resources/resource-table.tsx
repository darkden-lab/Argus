"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface ResourceTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  searchPlaceholder?: string;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const variant =
    s === "running" || s === "active" || s === "ready" || s === "connected"
      ? "default"
      : s === "pending" || s === "waiting"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

export function ResourceTable<T extends object>({
  data,
  columns,
  onRowClick,
  loading,
  searchPlaceholder = "Filter resources...",
}: ResourceTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = getNestedValue(row, col.key);
        return val !== undefined && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = String(getNestedValue(a, sortKey) ?? "");
      const bVal = String(getNestedValue(b, sortKey) ?? "");
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading resources...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>
                  {col.sortable !== false ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  No resources found.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row, i) => (
                <TableRow
                  key={i}
                  className={onRowClick ? "cursor-pointer" : ""}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.render
                        ? col.render(row)
                        : String(getNestedValue(row, col.key) ?? "-")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {sorted.length} of {data.length} resource(s)
      </p>
    </div>
  );
}
