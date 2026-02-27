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

  // --- Line buffer state for smart mode ---
  const lineBufferRef = useRef("");
  const cursorPosRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedLineRef = useRef("");

  const sendRawInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = { type: "input", data };
      wsRef.current.send(JSON.stringify(msg));
    }
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
          // Move cursor to start, clear line, rewrite remaining
          writeFn("\r$ " + after + " ".repeat(cursorPosRef.current) + "\r$ ");
          if (after.length > 0) {
            // Move cursor back to right after "$ "
            // cursor is already at "$ ", need to stay there
          }
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
          // Empty enter — just show new prompt
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
          // Move back, rewrite rest of line, clear trailing char, reposition cursor
          writeFn("\b" + after + " " + "\b".repeat(after.length + 1));
        }
        return;
      }

      // Arrow keys (escape sequences)
      if (data === "\x1b[A") {
        // Up — previous history
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
        // Down — next history
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
        // Right arrow
        if (cursorPosRef.current < lineBufferRef.current.length) {
          cursorPosRef.current++;
          writeFn("\x1b[C");
        }
        return;
      }

      if (data === "\x1b[D") {
        // Left arrow
        if (cursorPosRef.current > 0) {
          cursorPosRef.current--;
          writeFn("\x1b[D");
        }
        return;
      }

      // Printable characters (code >= 32)
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        if (ch.charCodeAt(0) >= 32) {
          const buf = lineBufferRef.current;
          const pos = cursorPosRef.current;
          const before = buf.slice(0, pos);
          const after = buf.slice(pos);
          lineBufferRef.current = before + ch + after;
          cursorPosRef.current = pos + 1;
          // Write char + rest of line, then move cursor back
          writeFn(ch + after + "\b".repeat(after.length));
        }
      }
    },
    [sendRawInput]
  );

  /** Replace the visible line buffer content on the terminal. */
  const replaceLineBuffer = (newContent: string, writeFn: (s: string) => void) => {
    const oldLen = lineBufferRef.current.length;
    const oldPos = cursorPosRef.current;
    // Move cursor to start of input (after "$ ")
    if (oldPos > 0) writeFn("\b".repeat(oldPos));
    // Write new content + clear any leftover chars
    writeFn(newContent);
    if (oldLen > newContent.length) {
      writeFn(" ".repeat(oldLen - newContent.length));
      writeFn("\b".repeat(oldLen - newContent.length));
    }
    lineBufferRef.current = newContent;
    cursorPosRef.current = newContent.length;
  };

  const handleInput = useCallback(
    (data: string, writeFn: (s: string) => void, currentMode: TerminalMode) => {
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
    handleInput,
    resetLineBuffer,
    sendResize,
    sendModeChange,
    sendContextChange,
    connect,
    disconnect,
  };
}
