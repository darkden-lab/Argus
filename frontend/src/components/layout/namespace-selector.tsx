"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusDot } from "@/components/ui/status-dot";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";
import { useK8sWatch, type WatchEvent } from "@/hooks/use-k8s-watch";

interface NamespaceItem {
  metadata: { name: string };
  status?: { phase?: string };
}

interface NamespaceListResponse {
  items: NamespaceItem[];
}

export function NamespaceSelector() {
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const namespaces = useClusterStore((s) => s.namespaces);
  const setSelectedNamespace = useClusterStore((s) => s.setSelectedNamespace);
  const setNamespaces = useClusterStore((s) => s.setNamespaces);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  const fetchNamespaces = useCallback(
    async (clusterId: string) => {
      setLoading(true);
      try {
        const data = await api.get<NamespaceListResponse>(
          `/api/clusters/${clusterId}/resources/_/v1/namespaces`
        );
        const items = data.items || [];
        const names = items.map((item) => item.metadata.name).sort();
        const phases: Record<string, string> = {};
        for (const item of items) {
          phases[item.metadata.name] = item.status?.phase ?? "Active";
        }
        setNamespaces(names);
        setStatusMap(phases);
      } catch {
        setNamespaces([]);
        setStatusMap({});
      } finally {
        setLoading(false);
      }
    },
    [setNamespaces]
  );

  useEffect(() => {
    if (!selectedClusterId) {
      setNamespaces([]);
      setStatusMap({});
      return;
    }
    fetchNamespaces(selectedClusterId);
  }, [selectedClusterId, fetchNamespaces, setNamespaces]);

  // Subscribe to namespace watch events for live updates
  const handleWatchEvent = useCallback(
    (event: WatchEvent) => {
      if (!selectedClusterId) return;
      const ns = (event.object as NamespaceItem)?.metadata?.name;
      if (!ns) return;

      if (event.type === "ADDED") {
        setNamespaces([...namespaces, ns].sort());
        const phase = (event.object as NamespaceItem)?.status?.phase ?? "Active";
        setStatusMap((prev) => ({ ...prev, [ns]: phase }));
      } else if (event.type === "DELETED") {
        setNamespaces(namespaces.filter((n) => n !== ns));
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[ns];
          return next;
        });
        if (selectedNamespace === ns) {
          setSelectedNamespace(null);
        }
      } else if (event.type === "MODIFIED") {
        const phase = (event.object as NamespaceItem)?.status?.phase ?? "Active";
        setStatusMap((prev) => ({ ...prev, [ns]: phase }));
      }
    },
    [selectedClusterId, namespaces, setNamespaces, selectedNamespace, setSelectedNamespace]
  );

  useK8sWatch({
    cluster: selectedClusterId ?? "",
    resource: "namespaces",
    onEvent: handleWatchEvent,
  });

  const filtered = useMemo(() => {
    if (!search) return namespaces;
    const q = search.toLowerCase();
    return namespaces.filter((ns) => ns.toLowerCase().includes(q));
  }, [namespaces, search]);

  if (!selectedClusterId) return null;

  const displayLabel = selectedNamespace ?? "All Namespaces";

  function select(ns: string | null) {
    setSelectedNamespace(ns);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className="w-[180px] justify-between font-normal"
          disabled={loading && namespaces.length === 0}
        >
          <div className="flex items-center gap-2 truncate">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </div>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2">
          <Input
            placeholder="Search namespace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto px-1 pb-1" role="listbox">
          <button
            role="option"
            aria-selected={selectedNamespace === null}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground",
              selectedNamespace === null &&
                "bg-accent text-accent-foreground font-medium"
            )}
            onClick={() => select(null)}
          >
            <Check
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                selectedNamespace === null ? "opacity-100" : "opacity-0"
              )}
            />
            <span>All Namespaces</span>
          </button>

          {filtered.length === 0 && !loading && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No namespaces found.
            </p>
          )}

          {filtered.map((ns) => {
            const phase = statusMap[ns] ?? "Active";
            const dotStatus = phase === "Active" ? "healthy" : "warning";

            return (
              <button
                key={ns}
                role="option"
                aria-selected={selectedNamespace === ns}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground",
                  selectedNamespace === ns &&
                    "bg-accent text-accent-foreground font-medium"
                )}
                onClick={() => select(ns)}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    selectedNamespace === ns ? "opacity-100" : "opacity-0"
                  )}
                />
                <StatusDot
                  status={dotStatus}
                  size="sm"
                  pulse={phase !== "Active"}
                />
                <span className="truncate">{ns}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
