"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore, type ChatMessage, type PageContext, type AiStatus, type Agent, type Conversation } from "@/stores/ai-chat";
import { api } from "@/lib/api";
import { getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

const STREAM_TIMEOUT_MS = 30_000; // 30s without a stream_delta → reset isStreaming

export function useAiChat() {
  const socketRef = useRef<Socket | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isOpen,
    isFullPage,
    pageContext,
    addMessage,
    appendToMessage,
    updateMessage,
    setMessages,
    setIsStreaming,
    addConversation,
    removeConversation,
    setActiveConversation,
    setConversations,
    setAiStatus,
    setConnectionState,
    setConnectionError,
    setAgents,
    setTasks,
    updateTask,
    setActiveAgent,
  } = useAiChatStore();

  const storeRef = useRef({
    addMessage,
    appendToMessage,
    updateMessage,
    setMessages,
    setIsStreaming,
    addConversation,
    removeConversation,
    setActiveConversation,
    setConversations,
    setAiStatus,
    setConnectionState,
    setConnectionError,
    setAgents,
    setTasks,
    updateTask,
    setActiveAgent,
  });
  storeRef.current = {
    addMessage,
    appendToMessage,
    updateMessage,
    setMessages,
    setIsStreaming,
    addConversation,
    removeConversation,
    setActiveConversation,
    setConversations,
    setAiStatus,
    setConnectionState,
    setConnectionError,
    setAgents,
    setTasks,
    updateTask,
    setActiveAgent,
  };

  // Clear streaming timeout
  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  // Reset streaming timeout — fires if no stream_delta for STREAM_TIMEOUT_MS
  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      const state = useAiChatStore.getState();
      if (state.isStreaming) {
        const streamingMsg = state.messages.findLast((m) => m.isStreaming);
        if (streamingMsg) {
          storeRef.current.updateMessage(streamingMsg.id, { isStreaming: false });
        }
        storeRef.current.setIsStreaming(false);
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout]);

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

  // Fetch AI status when panel opens
  const fetchAiStatus = useCallback(() => {
    api
      .get<AiStatus>("/api/ai/status")
      .then((status) => {
        storeRef.current.setAiStatus(status);
      })
      .catch(() => {
        storeRef.current.setAiStatus(null);
      });
  }, []);

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

  const connect = useCallback(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError("Not authenticated. Please log in.");
      return;
    }

    storeRef.current.setConnectionState("connecting");
    storeRef.current.setConnectionError(null);

    const socket = getSocket("/ai");
    socketRef.current = socket;

    // Prevent duplicate handlers on reconnect or re-render
    socket.removeAllListeners();

    socket.on("connect", () => {
      storeRef.current.setConnectionState("connected");
      storeRef.current.setConnectionError(null);
      // Fetch conversation list and agents on connect/reconnect
      fetchConversations();
      fetchAgents();
    });

    socket.on("stream_delta", (msg: { content?: string }) => {
      const store = storeRef.current;
      const state = useAiChatStore.getState();
      const lastMsg = state.messages[state.messages.length - 1];
      if (!lastMsg || !lastMsg.isStreaming) {
        store.setIsStreaming(true);
        const newId = crypto.randomUUID();
        store.addMessage({
          id: newId,
          role: "assistant",
          content: msg.content || "",
          timestamp: new Date().toISOString(),
          isStreaming: true,
        });
      } else if (msg.content) {
        store.appendToMessage(lastMsg.id, msg.content);
      }
      // Reset streaming timeout on each delta
      resetStreamTimeout();
    });

    socket.on("stream_end", () => {
      clearStreamTimeout();
      const store = storeRef.current;
      const state = useAiChatStore.getState();
      const streamingMsg = state.messages.findLast((m) => m.isStreaming);
      if (streamingMsg) {
        store.updateMessage(streamingMsg.id, { isStreaming: false });
      }
      store.setIsStreaming(false);
    });

    socket.on("confirm_request", (msg: { confirmation_id?: string; tool_name?: string; tool_args?: string; content?: string }) => {
      const store = storeRef.current;
      if (msg.confirmation_id) {
        let parsedArgs: Record<string, unknown> | undefined;
        if (msg.tool_args) {
          try {
            parsedArgs = JSON.parse(msg.tool_args);
          } catch {
            // Ignore malformed args
          }
        }
        store.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: msg.content || "Action requires confirmation",
          timestamp: new Date().toISOString(),
          confirmAction: {
            id: msg.confirmation_id,
            tool: msg.tool_name || "",
            description: msg.content || "",
            args: parsedArgs,
            status: "pending" as const,
          },
        });
      }
    });

    socket.on("conversation_created", (msg: { conversation_id?: string; title?: string }) => {
      const store = storeRef.current;
      if (msg.conversation_id) {
        store.addConversation({
          id: msg.conversation_id,
          title: msg.title || "New conversation",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        });
        // Set activeConversationId WITHOUT clearing messages (we may be mid-stream)
        useAiChatStore.setState({ activeConversationId: msg.conversation_id });
      }
    });

    socket.on("history_message", (msg: { content?: string; role?: string; conversation_id?: string }) => {
      storeRef.current.addMessage({
        id: crypto.randomUUID(),
        role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content || "",
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("history_end", () => {
      // History loading complete
    });

    socket.on("agent_selected", (msg: { agent_id?: string; agent_name?: string }) => {
      storeRef.current.setActiveAgent(msg.agent_id || null);
    });

    socket.on("task_created", (msg: { task_id?: string; agent_id?: string; title?: string; current_step?: string; total_steps?: number }) => {
      if (msg.task_id) {
        const state = useAiChatStore.getState();
        storeRef.current.setTasks([
          ...state.tasks,
          {
            id: msg.task_id,
            agent_id: msg.agent_id || "",
            title: msg.title || "Task",
            status: "running",
            progress: 0,
            current_step: msg.current_step || "",
            total_steps: msg.total_steps || 0,
            completed_steps: 0,
          },
        ]);
      }
    });

    socket.on("task_progress", (msg: { task_id?: string; progress?: number; current_step?: string; completed_steps?: number }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          progress: msg.progress ?? 0,
          current_step: msg.current_step || "",
          completed_steps: msg.completed_steps ?? 0,
        });
      }
    });

    socket.on("task_completed", (msg: { task_id?: string; result?: string; content?: string }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "completed",
          progress: 100,
          result: msg.result || msg.content,
        });
      }
    });

    socket.on("task_failed", (msg: { task_id?: string; error?: string; content?: string }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "failed",
          error: msg.error || msg.content || "Task failed",
        });
      }
    });

    socket.on("task_cancelled", (msg: { task_id?: string }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "cancelled",
          progress: 0,
        });
      }
    });

    socket.on("ai_error", (msg: { error?: string; content?: string } | string) => {
      clearStreamTimeout();
      const store = storeRef.current;
      store.setIsStreaming(false);
      const errorText = typeof msg === "string" ? msg : (msg.error || msg.content || "Unknown error");
      const isNotConfigured = /not configured|no provider/i.test(errorText);
      const friendlyError = isNotConfigured
        ? "AI assistant is not configured. Please set up an AI provider in Settings."
        : errorText;
      store.addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${friendlyError}`,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      clearStreamTimeout();
      storeRef.current.setConnectionState("disconnected");
      // If streaming was active during disconnect, reset it
      const state = useAiChatStore.getState();
      if (state.isStreaming) {
        const streamingMsg = state.messages.findLast((m) => m.isStreaming);
        if (streamingMsg) {
          storeRef.current.updateMessage(streamingMsg.id, { isStreaming: false });
        }
        storeRef.current.setIsStreaming(false);
      }
    });

    socket.on("connect_error", () => {
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError(
        "Failed to connect to AI assistant. The server may be unavailable."
      );
    });
  }, [fetchConversations, fetchAgents, resetStreamTimeout, clearStreamTimeout]);

  const disconnect = useCallback(() => {
    clearStreamTimeout();
    disconnectSocket("/ai");
    socketRef.current = null;
  }, [clearStreamTimeout]);

  // Connect when panel opens or full page is active, fetch AI status first
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
  }, [isOpen, isFullPage, connect, disconnect, fetchAgents]);

  const sendMessage = useCallback(
    (content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        storeRef.current.addMessage({
          id: crypto.randomUUID(),
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        });
        storeRef.current.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Error: Unable to send message. The AI assistant is not connected. Please check your connection and AI configuration in Settings.",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      storeRef.current.addMessage(userMessage);

      const state = useAiChatStore.getState();
      socket.emit("user_message", {
        content,
        conversation_id: state.activeConversationId || undefined,
        context: pageContext,
        agent_id: state.activeAgentId,
      });
    },
    [pageContext]
  );

  const confirmAction = useCallback((confirmId: string, approved: boolean) => {
    socketRef.current?.emit("confirm_action", {
      confirmation_id: confirmId,
      approved,
    });
    // Update the confirmation status locally so the UI reflects approve/reject
    const state = useAiChatStore.getState();
    const targetMsg = state.messages.find(m => m.confirmAction?.id === confirmId);
    if (targetMsg) {
      storeRef.current.updateMessage(targetMsg.id, {
        confirmAction: { ...targetMsg.confirmAction!, status: approved ? "approved" : "rejected" },
      });
    }
  }, []);

  const startNewConversation = useCallback(() => {
    storeRef.current.setMessages([]);
    storeRef.current.setActiveConversation(null);
    socketRef.current?.emit("new_conversation");
  }, []);

  const loadConversation = useCallback((conversationId: string) => {
    storeRef.current.setActiveConversation(conversationId);
    storeRef.current.setMessages([]);
    socketRef.current?.emit("load_history", {
      conversation_id: conversationId,
    });
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    api
      .del(`/api/ai/conversations/${conversationId}`)
      .then(() => {
        storeRef.current.removeConversation(conversationId);
      })
      .catch(() => {
        // Silently handle — conversation may already be gone
      });
  }, []);

  const updateContext = useCallback((context: PageContext) => {
    socketRef.current?.emit("context_update", context);
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    storeRef.current.setActiveAgent(agentId);
    socketRef.current?.emit("select_agent", { agent_id: agentId });
  }, []);

  const startTask = useCallback((agentId: string, title: string, content?: string) => {
    socketRef.current?.emit("start_task", {
      agent_id: agentId,
      task_title: title,
      content: content || title,
    });
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    socketRef.current?.emit("cancel_task", { task_id: taskId });
  }, []);

  return {
    sendMessage,
    confirmAction,
    startNewConversation,
    loadConversation,
    deleteConversation,
    updateContext,
    selectAgent,
    fetchAgents,
    fetchConversations,
    startTask,
    cancelTask,
  };
}
