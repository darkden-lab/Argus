"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface AssignNamespacesDialogProps {
  projectName: string;
  currentNamespaces: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void;
}

export function AssignNamespacesDialog({
  projectName,
  currentNamespaces,
  open,
  onOpenChange,
  onAssigned,
}: AssignNamespacesDialogProps) {
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const [allNamespaces, setAllNamespaces] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !selectedClusterId) return;
    setFetching(true);
    api
      .get<{ name: string }[]>(`/api/clusters/${selectedClusterId}/namespaces`)
      .then((data) => {
        const names = data.map((ns) => ns.name);
        setAllNamespaces(names);
        setSelected(new Set());
      })
      .catch(() => setAllNamespaces([]))
      .finally(() => setFetching(false));
  }, [open, selectedClusterId]);

  const available = allNamespaces.filter(
    (ns) => !currentNamespaces.includes(ns)
  );

  function toggleNamespace(ns: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) {
        next.delete(ns);
      } else {
        next.add(ns);
      }
      return next;
    });
  }

  async function handleAssign() {
    if (selected.size === 0 || !selectedClusterId) return;
    setLoading(true);
    setError(null);
    try {
      await api.post(
        `/api/clusters/${selectedClusterId}/projects/${projectName}/namespaces`,
        { namespaces: Array.from(selected) }
      );
      onAssigned?.();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to assign namespaces"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Namespaces</DialogTitle>
          <DialogDescription>
            Select namespaces to assign to &quot;{projectName}&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fetching ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : available.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No available namespaces to assign.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-md border p-2">
              <div className="flex flex-wrap gap-2">
                {available.map((ns) => (
                  <Badge
                    key={ns}
                    variant={selected.has(ns) ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleNamespace(ns)}
                  >
                    {ns}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || selected.size === 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign (${selected.size})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
