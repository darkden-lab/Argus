"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore } from "@/stores/ai-chat";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { classifyAiError } from "@/lib/ai-errors";
import { api } from "@/lib/api";
import type { Socket } from "socket.io-client";
import type { AiStatus, Agent, Conversation } from "@/stores/ai-chat";

/** Maximum polling interval in milliseconds for status checks. */
const MAX_POLL_INTERVAL_MS = 60_000;
/** Base polling interval in milliseconds (doubles each retry). */
const BASE_POLL_INTERVAL_MS = 10_000;

/**
 * Hook that manages the Socket.IO connection lifecycle for the AI chat.
 * Handles connect/disconnect, connection errors with classification,
 * auto-connect when the panel opens, and status polling with exponential
 * backoff when the connection is in an error or disconnected state.
 */
export function useAiConnection() {
  const socketRef = useRef<Socket | null>(null);

  const {
    isOpen,
    isFullPage,
    connectionState,
    configVersion,
    setConnectionState,
    setConnectionError,
    setConnectionRetryCount,
    incrementConnectionRetryCount,
    setAiStatus,
    setConversations,
    setAgents,
    incrementConfigVersion,
  } = useAiChatStore();

  // Keep store actions in a ref so socket callbacks never go stale
  const storeRef = useRef({
    setConnectionState,
    setConnectionError,
    setConnectionRetryCount,
    incrementConnectionRetryCount,
    setAiStatus,
    setConversations,
    setAgents,
    incrementConfigVersion,
  });
  storeRef.current = {
    setConnectionState,
    setConnectionError,
    setConnectionRetryCount,
    incrementConnectionRetryCount,
    setAiStatus,
    setConversations,
    setAgents,
    incrementConfigVersion,
  };

  // Fetch conversations via REST
  const fetchConversations = useCallback(() => {
    api
      .get<Conversation[]>("/api/ai/conversations")
      .then((conversations) => {
        storeRef.current.setConversations(conversations || []);
      })
      .catch(() => {
        // Endpoint may not be available yet
      });
  }, []);

  // Fetch agents via REST
  const fetchAgents = useCallback(() => {
    api
      .get<Agent[]>("/api/ai/agents")
      .then((agents) => {
        storeRef.current.setAgents(agents);
      })
      .catch(() => {
        // Agents endpoint may not exist yet
      });
  }, []);

  // Fetch AI status — used for polling and initial check
  const fetchAiStatus = useCallback(() => {
    api
      .get<AiStatus>("/api/ai/status")
      .then((status) => {
        const prev = useAiChatStore.getState().aiStatus;
        storeRef.current.setAiStatus(status);
        // If config changed from unconfigured to configured, trigger reconnect
        if (
          status?.enabled &&
          status?.configured &&
          (!prev?.configured || !prev?.enabled)
        ) {
          storeRef.current.incrementConfigVersion();
        }
      })
      .catch(() => {
        storeRef.current.setAiStatus(null);
      });
  }, []);

  // Create Socket.IO connection to /ai namespace
  const connect = useCallback(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError(
        "Not authenticated. Please log in."
      );
      return;
    }

    storeRef.current.setConnectionState("connecting");
    storeRef.current.setConnectionError(null);

    const socket = getSocket("/ai");
    socketRef.current = socket;

    // Remove only the handlers we manage, to avoid clobbering other listeners
    socket.off("connect");
    socket.off("disconnect");
    socket.off("connect_error");

    socket.on("connect", () => {
      storeRef.current.setConnectionState("connected");
      storeRef.current.setConnectionError(null);
      storeRef.current.setConnectionRetryCount(0);
      // Fetch conversation list and agents on connect/reconnect
      fetchConversations();
      fetchAgents();
    });

    socket.on("disconnect", (reason: string) => {
      const currentState = useAiChatStore.getState().connectionState;
      // Don't overwrite an existing error state
      if (currentState !== "error") {
        storeRef.current.setConnectionState("disconnected");
      }
      // Log server-initiated disconnects for diagnostics
      if (
        reason === "io server disconnect" ||
        reason === "transport close"
      ) {
        // Server-initiated disconnect — connection state already set above
      }
    });

    socket.on("connect_error", (err: Error) => {
      const classified = classifyAiError(err.message);
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError(classified.message);
    });
  }, [fetchConversations, fetchAgents]);

  // Disconnect and clean up socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.off("connect");
      socketRef.current.off("disconnect");
      socketRef.current.off("connect_error");
    }
    disconnectSocket("/ai");
    socketRef.current = null;
  }, []);

  // Poll AI status with exponential backoff when in error/disconnected state
  useEffect(() => {
    if (!(isOpen || isFullPage)) return;
    if (
      connectionState !== "error" &&
      connectionState !== "disconnected"
    )
      return;

    const retryCount = useAiChatStore.getState().connectionRetryCount;
    const interval = Math.min(
      BASE_POLL_INTERVAL_MS * Math.pow(2, retryCount),
      MAX_POLL_INTERVAL_MS
    );

    const timerId = setInterval(() => {
      storeRef.current.incrementConnectionRetryCount();
      fetchAiStatus();
    }, interval);

    return () => clearInterval(timerId);
  }, [isOpen, isFullPage, connectionState, fetchAiStatus]);

  // Auto-connect when panel opens or full page is active.
  // configVersion triggers reconnect when AI config changes.
  useEffect(() => {
    if (isOpen || isFullPage) {
      fetchAgents();
      // Check AI status before attempting Socket.IO connection
      api
        .get<AiStatus>("/api/ai/status")
        .then((status) => {
          storeRef.current.setAiStatus(status);
          if (status?.enabled && status?.configured) {
            connect();
          } else {
            storeRef.current.setConnectionState("error");
            storeRef.current.setConnectionError(
              status.message ||
                "AI assistant is not configured. Please set up an AI provider in Settings > AI Configuration."
            );
          }
        })
        .catch(() => {
          storeRef.current.setAiStatus(null);
          // Still try to connect — the server will report the actual error
          connect();
        });
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, isFullPage, configVersion, connect, disconnect, fetchAgents]);

  return { socketRef, connect, disconnect };
}
