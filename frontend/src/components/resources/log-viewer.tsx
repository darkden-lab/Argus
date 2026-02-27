"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { Loader2, X, Play, Pause } from "lucide-react";

interface LogViewerProps {
  clusterID: string;
  namespace: string;
  podName: string;
  containers?: string[];
  onClose?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  const logRef = useRef<HTMLPreElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedContainer) params.set("container", selectedContainer);
      params.set("tailLines", String(tailLines));
      if (previous) params.set("previous", "true");

      const data = await api.get<string>(
        `/api/clusters/${clusterID}/namespaces/${namespace}/pods/${podName}/logs?${params.toString()}`
      );
      setLogs(typeof data === "string" ? data : JSON.stringify(data, null, 2));
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      setLogs(
        `Error fetching logs: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [clusterID, namespace, podName, selectedContainer, tailLines, previous, scrollToBottom]);

  useEffect(() => {
    if (!following) {
      fetchLogs();
    }
  }, [fetchLogs, following]);

  useEffect(() => {
    if (!following) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    const params = new URLSearchParams();
    if (selectedContainer) params.set("container", selectedContainer);
    params.set("tailLines", String(tailLines));
    params.set("follow", "true");
    if (token) params.set("token", token);

    const url = `${API_URL}/api/clusters/${clusterID}/namespaces/${namespace}/pods/${podName}/logs?${params.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    setLogs("");

    es.onmessage = (event) => {
      setLogs((prev) => prev + event.data + "\n");
      setTimeout(scrollToBottom, 10);
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setFollowing(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [following, clusterID, namespace, podName, selectedContainer, tailLines, scrollToBottom]);

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
          className="h-8 text-xs"
          onClick={() => setFollowing(!following)}
        >
          {following ? (
            <>
              <Pause className="mr-1 h-3 w-3" /> Stop
            </>
          ) : (
            <>
              <Play className="mr-1 h-3 w-3" /> Follow
            </>
          )}
        </Button>

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

      {/* Log output */}
      <pre
        ref={logRef}
        className="flex-1 min-h-[300px] max-h-[500px] overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-5 whitespace-pre-wrap break-all"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading logs...
          </span>
        ) : logs ? (
          logs
        ) : (
          <span className="text-zinc-500">No logs available.</span>
        )}
      </pre>
    </div>
  );
}
