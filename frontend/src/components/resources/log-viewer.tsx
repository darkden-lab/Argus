"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X, Play, Pause, AlertCircle } from "lucide-react";

interface LogViewerProps {
  clusterID: string;
  namespace: string;
  podName: string;
  containers?: string[];
  onClose?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const POLL_INTERVAL_MS = 3000;

// --- Structured log parsing and rendering utilities ---

interface ParsedLogLine {
  raw: string;
  timestamp?: string;
  level?: string;
  message?: string;
  isJson: boolean;
}

function normalizeLevel(level: string | undefined): string | undefined {
  if (!level) return undefined;
  const l = level.toLowerCase().trim();
  if (l === "err" || l === "error" || l === "fatal" || l === "critical" || l === "panic") return "error";
  if (l === "warn" || l === "warning") return "warn";
  if (l === "info" || l === "information" || l === "notice") return "info";
  if (l === "debug" || l === "trace") return "debug";
  return l;
}

function getLevelColorClass(level: string | undefined): string {
  switch (normalizeLevel(level)) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-yellow-400";
    case "debug":
      return "text-gray-500";
    case "info":
    default:
      return "";
  }
}

function getLevelBadgeClass(level: string | undefined): string {
  switch (normalizeLevel(level)) {
    case "error":
      return "bg-red-900/40 text-red-400 border-red-800/50";
    case "warn":
      return "bg-yellow-900/40 text-yellow-400 border-yellow-800/50";
    case "debug":
      return "bg-gray-800/40 text-gray-500 border-gray-700/50";
    case "info":
      return "bg-blue-900/40 text-blue-400 border-blue-800/50";
    default:
      return "bg-zinc-800/40 text-zinc-400 border-zinc-700/50";
  }
}

function parseLine(line: string): ParsedLogLine {
  const trimmed = line.trim();
  if (!trimmed) return { raw: line, isJson: false };

  // Try parsing as JSON
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === "object" && obj !== null) {
        const timestamp = obj.timestamp || obj.time || obj.ts || obj["@timestamp"] || obj.date;
        const level = obj.level || obj.severity || obj.lvl || obj.loglevel;
        const message = obj.msg || obj.message || obj.text || obj.log;

        // Only treat as structured log if it has at least a message or level
        if (message || level) {
          return {
            raw: trimmed,
            timestamp: timestamp ? String(timestamp) : undefined,
            level: level ? String(level) : undefined,
            message: message ? String(message) : undefined,
            isJson: true,
          };
        }
      }
    } catch {
      // Not valid JSON, treat as plain text
    }
  }

  return { raw: line, isJson: false };
}

function normalizeLogData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  // Handle arrays (e.g., array of log objects)
  if (Array.isArray(data)) {
    return data
      .map((entry) => {
        if (typeof entry === "string") return entry;
        return JSON.stringify(entry);
      })
      .join("\n");
  }

  // Handle objects with a logs/data/items field
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    // Common wrapper fields for log responses
    const logField = obj.logs || obj.data || obj.items || obj.lines;
    if (typeof logField === "string") return logField;
    if (Array.isArray(logField)) {
      return logField
        .map((entry: unknown) => {
          if (typeof entry === "string") return entry;
          return JSON.stringify(entry);
        })
        .join("\n");
    }
    // Fallback: one JSON line per top-level entry
    return JSON.stringify(data);
  }

  return String(data);
}

function LogLine({ parsed }: { parsed: ParsedLogLine }) {
  if (!parsed.isJson) {
    return <span>{parsed.raw}</span>;
  }

  const colorClass = getLevelColorClass(parsed.level);
  const badgeClass = getLevelBadgeClass(parsed.level);

  return (
    <span className={colorClass}>
      {parsed.timestamp && (
        <span className="text-zinc-500 select-all">{parsed.timestamp} </span>
      )}
      {parsed.level && (
        <span
          className={`inline-block px-1.5 py-0 rounded text-[10px] font-semibold uppercase border mr-1.5 leading-4 align-middle ${badgeClass}`}
        >
          {parsed.level}
        </span>
      )}
      {parsed.message ?? parsed.raw}
    </span>
  );
}

function LogOutput({ logs }: { logs: string }) {
  const parsedLines = useMemo(() => {
    if (!logs) return [];
    return logs.split("\n").map((line) => parseLine(line));
  }, [logs]);

  if (parsedLines.length === 0) {
    return <span className="text-zinc-500">No logs available.</span>;
  }

  return (
    <>
      {parsedLines.map((parsed, i) => (
        <div key={i} className="hover:bg-zinc-900/50 px-1 -mx-1 rounded">
          <LogLine parsed={parsed} />
        </div>
      ))}
    </>
  );
}

// --- Main component ---

export function LogViewer({
  clusterID,
  namespace,
  podName,
  containers,
  onClose,
}: LogViewerProps) {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(
    containers?.[0] ?? ""
  );
  const [tailLines, setTailLines] = useState(100);
  const [previous, setPrevious] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState<"sse" | "polling" | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoScrollingRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    });
  }, []);

  // Track whether user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!logRef.current) return;
    const el = logRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isAutoScrollingRef.current = atBottom;
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedContainer) params.set("container", selectedContainer);
    params.set("tailLines", String(tailLines));
    if (previous) params.set("previous", "true");
    return params;
  }, [selectedContainer, tailLines, previous]);

  const logPath = useMemo(
    () =>
      `/api/clusters/${clusterID}/namespaces/${namespace}/pods/${podName}/logs`,
    [clusterID, namespace, podName]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const data = await api.get<unknown>(`${logPath}?${params.toString()}`);
      const normalized = normalizeLogData(data);
      setLogs(normalized);
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      setLogs(
        `Error fetching logs: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [logPath, buildParams, scrollToBottom]);

  // Polling fallback for follow mode
  const startPolling = useCallback(() => {
    setFollowMode("polling");
    setFollowError("Live streaming unavailable. Using polling fallback (every 3s).");

    // Do an initial fetch
    const doFetch = async () => {
      try {
        const params = buildParams();
        const data = await api.get<unknown>(`${logPath}?${params.toString()}`);
        const normalized = normalizeLogData(data);
        setLogs(normalized);
        if (isAutoScrollingRef.current) {
          scrollToBottom();
        }
      } catch {
        // Silently ignore polling errors to avoid spam
      }
    };

    doFetch();
    pollIntervalRef.current = setInterval(doFetch, POLL_INTERVAL_MS);
  }, [logPath, buildParams, scrollToBottom]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const stopFollowing = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    stopPolling();
    setFollowMode(null);
    setFollowError(null);
  }, [stopPolling]);

  // Fetch logs on initial render and when params change (but not while following)
  useEffect(() => {
    if (!following) {
      fetchLogs();
    }
  }, [fetchLogs, following]);

  // Follow mode: SSE with polling fallback
  useEffect(() => {
    if (!following) {
      stopFollowing();
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    const params = buildParams();
    params.set("follow", "true");
    if (token) params.set("token", token);

    const url = `${API_URL}${logPath}?${params.toString()}`;

    // Try EventSource first
    let receivedMessage = false;
    let sseErrorTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      setLogs("");
      setFollowMode("sse");
      setFollowError(null);
      isAutoScrollingRef.current = true;

      es.onmessage = (event) => {
        receivedMessage = true;
        if (sseErrorTimeout) {
          clearTimeout(sseErrorTimeout);
          sseErrorTimeout = null;
        }
        setLogs((prev) => prev + event.data + "\n");
        if (isAutoScrollingRef.current) {
          scrollToBottom();
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        // If we never received a message, SSE is not supported - fall back to polling
        if (!receivedMessage) {
          startPolling();
        } else {
          // SSE was working but disconnected - try to reconnect via polling
          startPolling();
        }
      };

      // If no message received within 5 seconds, assume SSE is not working
      sseErrorTimeout = setTimeout(() => {
        if (!receivedMessage && eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
          startPolling();
        }
      }, 5000);
    } catch {
      // EventSource constructor failed
      startPolling();
    }

    return () => {
      if (sseErrorTimeout) clearTimeout(sseErrorTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
    };
    // We intentionally exclude startPolling/stopPolling/stopFollowing from deps
    // to avoid re-triggering the effect when those callbacks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, clusterID, namespace, podName, selectedContainer, tailLines, scrollToBottom, logPath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFollowing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {containers && containers.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Container</Label>
            <Select
              value={selectedContainer}
              onValueChange={setSelectedContainer}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {containers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Tail lines</Label>
          <Input
            type="number"
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value) || 100)}
            className="w-20 h-8 text-xs"
            min={1}
            max={10000}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="previous"
            checked={previous}
            onCheckedChange={setPrevious}
            size="sm"
          />
          <Label htmlFor="previous" className="text-xs">
            Previous
          </Label>
        </div>

        <Button
          variant={following ? "default" : "outline"}
          size="sm"
          className={`h-8 text-xs transition-all ${
            following
              ? "bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-900/30"
              : ""
          }`}
          onClick={() => setFollowing(!following)}
          aria-label={following ? "Stop following logs" : "Start following logs"}
          aria-pressed={following}
        >
          {following ? (
            <>
              <Pause className="mr-1 h-3 w-3" /> Following
              {followMode === "polling" && (
                <span className="ml-1 text-[10px] opacity-75">(polling)</span>
              )}
            </>
          ) : (
            <>
              <Play className="mr-1 h-3 w-3" /> Follow
            </>
          )}
        </Button>

        {following && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
        )}

        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Follow status message */}
      {followError && following && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/30 rounded-md px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{followError}</span>
        </div>
      )}

      {/* Log output */}
      <pre
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 min-h-[300px] max-h-[500px] overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-5 whitespace-pre-wrap break-all"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading logs...
          </span>
        ) : logs ? (
          <LogOutput logs={logs} />
        ) : (
          <span className="text-zinc-500">No logs available.</span>
        )}
      </pre>
    </div>
  );
}
