"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export type TerminalMode = "smart" | "raw";

interface TerminalMessage {
  type: "input" | "resize" | "mode" | "set_context";
  data?: string;
  cols?: number;
  rows?: number;
  mode?: TerminalMode;
  cluster_id?: string;
  namespace?: string;
}

interface TerminalServerMessage {
  type: "output" | "error" | "connected" | "mode_changed";
  data?: string;
  mode?: TerminalMode;
}

interface UseTerminalOptions {
  cluster: string;
  namespace: string;
  mode: TerminalMode;
  onOutput?: (data: string) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onModeChanged?: (mode: TerminalMode) => void;
}

export function useTerminal({
  cluster,
  namespace,
  mode,
  onOutput,
  onError,
  onConnected,
  onModeChanged,
}: UseTerminalOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  const callbackRefs = useRef({ onOutput, onError, onConnected, onModeChanged });
  callbackRefs.current = { onOutput, onError, onConnected, onModeChanged };

  const connect = useCallback(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token || !cluster) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const params = new URLSearchParams({
      token,
      cluster,
      namespace,
      mode,
    });

    const ws = new WebSocket(`${WS_URL}/ws/terminal?${params}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const msg: TerminalServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "output":
            if (msg.data) callbackRefs.current.onOutput?.(msg.data);
            break;
          case "error":
            if (msg.data) callbackRefs.current.onError?.(msg.data);
            break;
          case "connected":
            callbackRefs.current.onConnected?.();
            break;
          case "mode_changed":
            if (msg.mode) callbackRefs.current.onModeChanged?.(msg.mode);
            break;
        }
      } catch {
        // Raw output fallback
        callbackRefs.current.onOutput?.(event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Auto-reconnect with backoff
      reconnectTimerRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          30000
        );
        connect();
      }, reconnectDelayRef.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [cluster, namespace, mode]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: "input", data };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: "resize", cols, rows };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendModeChange = useCallback((newMode: TerminalMode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: "mode", mode: newMode };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendContextChange = useCallback(
    (newCluster: string, newNamespace: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: TerminalMessage = {
          type: "set_context",
          cluster_id: newCluster,
          namespace: newNamespace,
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    },
    []
  );

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    sendInput,
    sendResize,
    sendModeChange,
    sendContextChange,
    connect,
    disconnect,
  };
}
