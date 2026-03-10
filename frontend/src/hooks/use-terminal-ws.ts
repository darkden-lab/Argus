"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getToken } from "@/lib/sse-client";

export type TerminalMode = "smart" | "raw";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function resolveWsUrl(): string {
  if (API_URL) {
    return API_URL.replace(/^https/, "wss").replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "";
}
const WS_URL = resolveWsUrl();

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
  const intentionalCloseRef = useRef(false);

  const clusterRef = useRef(cluster);
  const namespaceRef = useRef(namespace);
  const modeRef = useRef(mode);
  clusterRef.current = cluster;
  namespaceRef.current = namespace;
  modeRef.current = mode;

  const callbackRefs = useRef({ onOutput, onError, onConnected, onModeChanged });
  callbackRefs.current = { onOutput, onError, onConnected, onModeChanged };

  const connect = useCallback(() => {
    const token = getToken();
    if (!token || !clusterRef.current) return;

    intentionalCloseRef.current = false;

    const ws = new WebSocket(
      `${WS_URL}/ws/terminal?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Set context after connecting
      ws.send(
        JSON.stringify({
          type: "set_context",
          cluster_id: clusterRef.current,
          namespace: namespaceRef.current,
        })
      );
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
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
            if (msg.mode)
              callbackRefs.current.onModeChanged?.(msg.mode as TerminalMode);
            break;
        }
      } catch {
        // Non-JSON message — treat as raw output
        callbackRefs.current.onOutput?.(e.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (!intentionalCloseRef.current) {
        // Auto-reconnect after 2s
        setTimeout(() => {
          if (!intentionalCloseRef.current) connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      callbackRefs.current.onError?.("WebSocket connection error\r\n");
    };
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // --- Line buffer state for smart mode ---
  const lineBufferRef = useRef("");
  const cursorPosRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedLineRef = useRef("");

  const sendRawInput = useCallback((data: string) => {
    wsRef.current?.send(JSON.stringify({ type: "input", data }));
  }, []);

  const sendInput = sendRawInput;

  const handleSmartInput = useCallback(
    (data: string, writeFn: (s: string) => void) => {
      // Ctrl+C — cancel current line
      if (data === "\x03") {
        writeFn("^C\r\n$ ");
        lineBufferRef.current = "";
        cursorPosRef.current = 0;
        historyIndexRef.current = -1;
        return;
      }

      // Ctrl+U — clear line before cursor
      if (data === "\x15") {
        if (cursorPosRef.current > 0) {
          const after = lineBufferRef.current.slice(cursorPosRef.current);
          writeFn(
            "\r$ " +
              after +
              " ".repeat(cursorPosRef.current) +
              "\r$ "
          );
          lineBufferRef.current = after;
          cursorPosRef.current = 0;
        }
        return;
      }

      // Enter — submit command
      if (data === "\r" || data === "\n") {
        writeFn("\r\n");
        const command = lineBufferRef.current.trim();
        if (command) {
          historyRef.current.push(command);
          sendRawInput(command);
        } else {
          writeFn("$ ");
        }
        lineBufferRef.current = "";
        cursorPosRef.current = 0;
        historyIndexRef.current = -1;
        return;
      }

      // Backspace
      if (data === "\x7f" || data === "\b") {
        if (cursorPosRef.current > 0) {
          const buf = lineBufferRef.current;
          const pos = cursorPosRef.current;
          const before = buf.slice(0, pos - 1);
          const after = buf.slice(pos);
          lineBufferRef.current = before + after;
          cursorPosRef.current = pos - 1;
          writeFn("\b" + after + " " + "\b".repeat(after.length + 1));
        }
        return;
      }

      // Arrow keys
      if (data === "\x1b[A") {
        if (historyRef.current.length === 0) return;
        if (historyIndexRef.current === -1) {
          savedLineRef.current = lineBufferRef.current;
          historyIndexRef.current = historyRef.current.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        } else {
          return;
        }
        const entry = historyRef.current[historyIndexRef.current];
        replaceLineBuffer(entry, writeFn);
        return;
      }

      if (data === "\x1b[B") {
        if (historyIndexRef.current === -1) return;
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          const entry = historyRef.current[historyIndexRef.current];
          replaceLineBuffer(entry, writeFn);
        } else {
          historyIndexRef.current = -1;
          replaceLineBuffer(savedLineRef.current, writeFn);
        }
        return;
      }

      if (data === "\x1b[C") {
        if (cursorPosRef.current < lineBufferRef.current.length) {
          cursorPosRef.current++;
          writeFn("\x1b[C");
        }
        return;
      }

      if (data === "\x1b[D") {
        if (cursorPosRef.current > 0) {
          cursorPosRef.current--;
          writeFn("\x1b[D");
        }
        return;
      }

      // Printable characters
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        if (ch.charCodeAt(0) >= 32) {
          const buf = lineBufferRef.current;
          const pos = cursorPosRef.current;
          const before = buf.slice(0, pos);
          const after = buf.slice(pos);
          lineBufferRef.current = before + ch + after;
          cursorPosRef.current = pos + 1;
          writeFn(ch + after + "\b".repeat(after.length));
        }
      }
    },
    [sendRawInput]
  );

  const replaceLineBuffer = (
    newContent: string,
    writeFn: (s: string) => void
  ) => {
    const oldLen = lineBufferRef.current.length;
    const oldPos = cursorPosRef.current;
    if (oldPos > 0) writeFn("\b".repeat(oldPos));
    writeFn(newContent);
    if (oldLen > newContent.length) {
      writeFn(" ".repeat(oldLen - newContent.length));
      writeFn("\b".repeat(oldLen - newContent.length));
    }
    lineBufferRef.current = newContent;
    cursorPosRef.current = newContent.length;
  };

  const handleInput = useCallback(
    (
      data: string,
      writeFn: (s: string) => void,
      currentMode: TerminalMode
    ) => {
      if (currentMode === "smart") {
        handleSmartInput(data, writeFn);
      } else {
        sendRawInput(data);
      }
    },
    [handleSmartInput, sendRawInput]
  );

  const resetLineBuffer = useCallback(() => {
    lineBufferRef.current = "";
    cursorPosRef.current = 0;
    historyIndexRef.current = -1;
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    wsRef.current?.send(JSON.stringify({ type: "resize", cols, rows }));
  }, []);

  const sendModeChange = useCallback((newMode: TerminalMode) => {
    wsRef.current?.send(JSON.stringify({ type: "mode", mode: newMode }));
  }, []);

  const sendContextChange = useCallback(
    (newCluster: string, newNamespace: string) => {
      wsRef.current?.send(
        JSON.stringify({
          type: "set_context",
          cluster_id: newCluster,
          namespace: newNamespace,
        })
      );
    },
    []
  );

  // Reconnect when cluster changes
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [cluster]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    sendInput,
    handleInput,
    resetLineBuffer,
    sendResize,
    sendModeChange,
    sendContextChange,
    connect,
    disconnect,
  };
}
