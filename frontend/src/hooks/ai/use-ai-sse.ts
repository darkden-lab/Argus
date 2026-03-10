"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore } from "@/stores/ai-chat";
import { SSEClient, getToken } from "@/lib/sse-client";
import { classifyAiError } from "@/lib/ai-errors";
import { api } from "@/lib/api";
import type { AiStatus, Agent, Conversation } from "@/stores/ai-chat";

/** Timeout in ms — if no stream_delta arrives within this window, streaming is reset. */
const STREAM_TIMEOUT_MS = 90_000;

/**
 * Hook that manages the SSE connection lifecycle for AI chat.
 * Replaces use-ai-connection + use-ai-stream + use-ai-events.
 */
export function useAiSSE() {
  const clientRef = useRef<SSEClient | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const lastDeltaContentRef = useRef<string | null>(null);

  const {
    isOpen,
    isFullPage,
    connectionState,
    configVersion,
    setConnectionState,
    setConnectionError,
    setAiStatus,
    setConversations,
    setAgents,
    incrementConfigVersion,
  } = useAiChatStore();

  // Keep store actions in a ref so callbacks never go stale
  const storeRef = useRef({
    setConnectionState,
    setConnectionError,
    setAiStatus,
    setConversations,
    setAgents,
    incrementConfigVersion,
    addMessage: useAiChatStore.getState().addMessage,
    appendToMessage: useAiChatStore.getState().appendToMessage,
    updateMessage: useAiChatStore.getState().updateMessage,
    setIsStreaming: useAiChatStore.getState().setIsStreaming,
    setStreamFinishReason: useAiChatStore.getState().setStreamFinishReason,
    setPendingConfirmationId: useAiChatStore.getState().setPendingConfirmationId,
    addConversation: useAiChatStore.getState().addConversation,
    setActiveAgent: useAiChatStore.getState().setActiveAgent,
    setTasks: useAiChatStore.getState().setTasks,
    updateTask: useAiChatStore.getState().updateTask,
    setIsHistoryLoading: useAiChatStore.getState().setIsHistoryLoading,
  });
  useEffect(() => {
    const s = useAiChatStore.getState();
    storeRef.current = {
      setConnectionState,
      setConnectionError,
      setAiStatus,
      setConversations,
      setAgents,
      incrementConfigVersion,
      addMessage: s.addMessage,
      appendToMessage: s.appendToMessage,
      updateMessage: s.updateMessage,
      setIsStreaming: s.setIsStreaming,
      setStreamFinishReason: s.setStreamFinishReason,
      setPendingConfirmationId: s.setPendingConfirmationId,
      addConversation: s.addConversation,
      setActiveAgent: s.setActiveAgent,
      setTasks: s.setTasks,
      updateTask: s.updateTask,
      setIsHistoryLoading: s.setIsHistoryLoading,
    };
  });

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  const finalizeStream = useCallback(
    (reason: string) => {
      clearStreamTimeout();
      const store = storeRef.current;
      const state = useAiChatStore.getState();
      const streamingMsg = state.messages.findLast((m) => m.isStreaming);
      if (streamingMsg) {
        store.updateMessage(streamingMsg.id, { isStreaming: false });
      }
      store.setIsStreaming(false);
      store.setStreamFinishReason(reason);
      streamMessageIdRef.current = null;
      lastDeltaContentRef.current = null;
    },
    [clearStreamTimeout]
  );

  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      const state = useAiChatStore.getState();
      if (state.isStreaming) {
        finalizeStream("timeout");
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout, finalizeStream]);

  // Handle SSE events
  const handleSSEEvent = useCallback(
    (type: string, data: unknown) => {
      const store = storeRef.current;
      const payload = data as Record<string, unknown>;

      switch (type) {
        case "ai:stream_delta": {
          const content = (payload.content as string) || "";
          lastDeltaContentRef.current = content || null;

          const state = useAiChatStore.getState();

          if (streamMessageIdRef.current) {
            const tracked = state.messages.find(
              (m) => m.id === streamMessageIdRef.current
            );
            if (tracked && tracked.isStreaming) {
              if (content) store.appendToMessage(tracked.id, content);
              resetStreamTimeout();
              return;
            }
          }

          const lastMsg = state.messages[state.messages.length - 1];
          if (!lastMsg || !lastMsg.isStreaming) {
            store.setIsStreaming(true);
            const newId = crypto.randomUUID();
            streamMessageIdRef.current = newId;
            store.addMessage({
              id: newId,
              role: "assistant",
              content,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
          } else {
            streamMessageIdRef.current = lastMsg.id;
            if (content) store.appendToMessage(lastMsg.id, content);
          }
          resetStreamTimeout();
          break;
        }

        case "ai:stream_end":
          finalizeStream((payload.reason as string) || "stop");
          break;

        case "ai:error": {
          store.setIsStreaming(false);
          const classified = classifyAiError(payload);
          if (classified.isConfigError) {
            store.setConnectionState("error");
            store.setConnectionError(classified.message);
          }
          store.addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${classified.message}`,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case "ai:confirm_request": {
          if (payload.confirmation_id) {
            store.setPendingConfirmationId(payload.confirmation_id as string);
            let parsedArgs: Record<string, unknown> | undefined;
            if (payload.tool_args) {
              try {
                parsedArgs = JSON.parse(payload.tool_args as string);
              } catch {
                // Ignore malformed args
              }
            }
            store.addMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                (payload.content as string) || "Action requires confirmation",
              timestamp: new Date().toISOString(),
              confirmAction: {
                id: payload.confirmation_id as string,
                tool: (payload.tool_name as string) || "",
                description: (payload.content as string) || "",
                args: parsedArgs,
                status: "pending" as const,
              },
            });
          }
          break;
        }

        case "ai:conversation_created": {
          if (payload.conversation_id) {
            store.addConversation({
              id: payload.conversation_id as string,
              title: (payload.title as string) || "New conversation",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageCount: 0,
            });
            useAiChatStore.setState({
              activeConversationId: payload.conversation_id as string,
            });
          }
          break;
        }

        case "ai:task_created": {
          if (payload.task_id) {
            const state = useAiChatStore.getState();
            store.setTasks([
              ...state.tasks,
              {
                id: payload.task_id as string,
                agent_id: (payload.agent_id as string) || "",
                title: (payload.title as string) || "Task",
                status: "running",
                progress: 0,
                current_step: (payload.current_step as string) || "",
                total_steps: (payload.total_steps as number) || 0,
                completed_steps: 0,
              },
            ]);
          }
          break;
        }

        case "ai:task_progress":
          if (payload.task_id) {
            store.updateTask(payload.task_id as string, {
              progress: (payload.progress as number) ?? 0,
              current_step: (payload.current_step as string) || "",
              completed_steps: (payload.completed_steps as number) ?? 0,
            });
          }
          break;

        case "ai:task_completed":
          if (payload.task_id) {
            store.updateTask(payload.task_id as string, {
              status: "completed",
              progress: 100,
              result: (payload.result as string) || (payload.content as string),
            });
          }
          break;

        case "ai:task_failed":
          if (payload.task_id) {
            store.updateTask(payload.task_id as string, {
              status: "failed",
              error:
                (payload.error as string) ||
                (payload.content as string) ||
                "Task failed",
            });
          }
          break;

        case "ai:task_cancelled":
          if (payload.task_id) {
            store.updateTask(payload.task_id as string, {
              status: "cancelled",
              progress: 0,
            });
          }
          break;
      }
    },
    [finalizeStream, resetStreamTimeout]
  );

  // Fetch helpers
  const fetchConversations = useCallback(() => {
    api
      .get<Conversation[]>("/api/ai/conversations")
      .then((conversations) => {
        storeRef.current.setConversations(conversations || []);
      })
      .catch(() => {});
  }, []);

  const fetchAgents = useCallback(() => {
    api
      .get<Agent[]>("/api/ai/agents")
      .then((agents) => {
        storeRef.current.setAgents(agents);
      })
      .catch(() => {});
  }, []);

  const fetchAiStatus = useCallback(() => {
    api
      .get<AiStatus>("/api/ai/status")
      .then((status) => {
        const prev = useAiChatStore.getState().aiStatus;
        storeRef.current.setAiStatus(status);
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

  // Connect SSE
  const connect = useCallback(() => {
    const token = getToken();
    if (!token) {
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError(
        "Not authenticated. Please log in."
      );
      return;
    }

    // Disconnect any existing client before creating a new one (C7 fix)
    clientRef.current?.disconnect();
    clientRef.current = null;

    storeRef.current.setConnectionState("connecting");
    storeRef.current.setConnectionError(null);

    const client = new SSEClient({
      url: "/api/ai/stream",
      getToken,
      onEvent: handleSSEEvent,
      onOpen: () => {
        storeRef.current.setConnectionState("connected");
        storeRef.current.setConnectionError(null);
        fetchConversations();
        fetchAgents();
      },
      onError: (err) => {
        const classified = classifyAiError(err.message);
        storeRef.current.setConnectionState("error");
        storeRef.current.setConnectionError(classified.message);
      },
      onClose: () => {
        const currentState = useAiChatStore.getState().connectionState;
        if (currentState !== "error") {
          storeRef.current.setConnectionState("disconnected");
        }
      },
    });

    clientRef.current = client;
    client.connect();
  }, [handleSSEEvent, fetchConversations, fetchAgents]);

  const disconnect = useCallback(() => {
    clearStreamTimeout();
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, [clearStreamTimeout]);

  // Poll AI status when in error/disconnected state
  useEffect(() => {
    if (!(isOpen || isFullPage)) return;
    if (connectionState !== "error" && connectionState !== "disconnected")
      return;

    const timerId = setInterval(() => {
      fetchAiStatus();
    }, 15_000);

    return () => clearInterval(timerId);
  }, [isOpen, isFullPage, connectionState, fetchAiStatus]);

  // Auto-connect when panel opens; configVersion triggers reconnect
  useEffect(() => {
    if (isOpen || isFullPage) {
      fetchAgents();
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
          connect();
        });
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, isFullPage, configVersion, connect, disconnect, fetchAgents]);
}
