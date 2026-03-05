"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Save,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { YamlEditor } from "./yaml-editor";
import { useAiChatStore } from "@/stores/ai-chat";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";

// --- Types ---

interface KeyValue {
  key: string;
  value: string;
}

interface Event {
  type: string;
  reason: string;
  message: string;
  timestamp: string;
}

interface ResourceDetailProps {
  name: string;
  kind: string;
  namespace?: string;
  overview: KeyValue[];
  yaml: string;
  events: Event[];
  onDelete?: () => void;
  onSaveYaml?: (yaml: string) => void;
  deleting?: boolean;
}

// --- Helpers ---

function formatAge(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return timestamp;
  const diffMs = now - then;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      className="text-muted-foreground hover:text-foreground"
      aria-label={`Copy "${text}"`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span>{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {count}
          </Badge>
        )}
      </button>
      {open && <div className="border-t">{children}</div>}
    </div>
  );
}

// --- Fetch related events ---

interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  metadata?: { creationTimestamp?: string };
  lastTimestamp?: string;
  involvedObject?: { name?: string; kind?: string };
}

interface EventListResponse {
  items?: K8sEvent[];
}

function useRelatedEvents(
  clusterID: string | null,
  namespace: string | undefined,
  resourceName: string,
  kind: string
) {
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!clusterID || !namespace) return;
    setLoadingEvents(true);
    try {
      const data = await api.get<EventListResponse>(
        `/api/clusters/${clusterID}/resources/${namespace}/v1/events`
      );
      const items = data.items ?? [];
      const filtered = items
        .filter(
          (e) =>
            e.involvedObject?.name === resourceName &&
            (!e.involvedObject?.kind || e.involvedObject.kind === kind)
        )
        .map((e) => ({
          type: e.type,
          reason: e.reason,
          message: e.message,
          timestamp:
            e.lastTimestamp ??
            e.metadata?.creationTimestamp ??
            "",
        }));
      setRelatedEvents(filtered);
    } catch {
      setRelatedEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [clusterID, namespace, resourceName, kind]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { relatedEvents, loadingEvents };
}

// --- Main component ---

export function ResourceDetail({
  name,
  kind,
  namespace,
  overview,
  yaml,
  events,
  onDelete,
  onSaveYaml,
  deleting,
}: ResourceDetailProps) {
  const [editedYaml, setEditedYaml] = useState(yaml);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const yamlChanged = editedYaml !== yaml;
  const openChat = useAiChatStore((s) => s.open);
  const setPageContext = useAiChatStore((s) => s.setPageContext);
  const setInputValue = useAiChatStore((s) => s.setInputValue);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  const { relatedEvents, loadingEvents } = useRelatedEvents(
    selectedClusterId,
    namespace,
    name,
    kind
  );

  // Merge passed-in events with fetched related events (deduplicate by message+reason)
  const allEvents = [...events];
  for (const re of relatedEvents) {
    if (!allEvents.some((e) => e.reason === re.reason && e.message === re.message)) {
      allEvents.push(re);
    }
  }

  // Parse labels and annotations from overview
  const labels: KeyValue[] = [];
  const annotations: KeyValue[] = [];
  const coreOverview: KeyValue[] = [];

  for (const kv of overview) {
    if (kv.key.startsWith("label:")) {
      labels.push({ key: kv.key.replace("label:", ""), value: kv.value });
    } else if (kv.key.startsWith("annotation:")) {
      annotations.push({ key: kv.key.replace("annotation:", ""), value: kv.value });
    } else {
      coreOverview.push(kv);
    }
  }

  const handleAskAi = () => {
    setPageContext({
      resource: kind,
      name,
      namespace,
    });
    setInputValue(`Tell me about this ${kind} "${name}"${namespace ? ` in namespace "${namespace}"` : ""}`);
    openChat();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xl font-bold">{name}</h2>
            <CopyButton text={name} />
          </div>
          <Badge variant="secondary">{kind}</Badge>
          {namespace && (
            <div className="flex items-center gap-1">
              <Badge variant="outline">{namespace}</Badge>
              <CopyButton text={namespace} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAskAi}>
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Ask AI
          </Button>
          {onDelete && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete {kind}</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete <strong>{name}</strong>
                    {namespace && <> in namespace <strong>{namespace}</strong></>}?
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => {
                      onDelete();
                      setDeleteOpen(false);
                    }}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="events">
            Events ({allEvents.length})
            {loadingEvents && <span className="ml-1 text-[10px] opacity-60">...</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          {/* Core overview — always visible */}
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                {coreOverview.map((kv) => (
                  <tr key={kv.key} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium text-muted-foreground w-1/3">
                      {kv.key}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {kv.key.toLowerCase().includes("created") ||
                      kv.key.toLowerCase().includes("age") ||
                      kv.key.toLowerCase().includes("timestamp")
                        ? formatAge(kv.value)
                        : kv.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Labels & Annotations — collapsible */}
          {(labels.length > 0 || annotations.length > 0) && (
            <CollapsibleSection
              title="Labels & Annotations"
              count={labels.length + annotations.length}
            >
              <div className={cn("grid gap-0", annotations.length > 0 && labels.length > 0 ? "divide-y" : "")}>
                {labels.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Labels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((l) => (
                        <Badge key={l.key} variant="outline" className="text-[10px] font-mono">
                          {l.key}={l.value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {annotations.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Annotations</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {annotations.map((a) => (
                          <tr key={a.key} className="border-b last:border-0">
                            <td className="py-1.5 pr-3 font-mono text-muted-foreground break-all w-1/3">
                              {a.key}
                            </td>
                            <td className="py-1.5 font-mono break-all">
                              {a.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </TabsContent>

        <TabsContent value="yaml" className="mt-4 space-y-3">
          <YamlEditor value={editedYaml} onChange={setEditedYaml} />
          {onSaveYaml && yamlChanged && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onSaveYaml(editedYaml)}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save Changes
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {allEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No events.
            </p>
          ) : (
            <div className="space-y-2">
              {allEvents.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Badge
                    variant={
                      event.type === "Warning" ? "destructive" : "secondary"
                    }
                    className="mt-0.5 shrink-0"
                  >
                    {event.type}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {event.reason}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.timestamp ? formatAge(event.timestamp) : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground break-all">
                      {event.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
