"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore, type ChatMessage, type PageContext, type AiStatus, type Agent } from "@/stores/ai-chat";
import { api } from "@/lib/api";
import { WS_URL } from "@/lib/ws";

interface ChatWsMessage {
  type:
    | "user_message"
    | "confirm_action"
    | "new_conversation"
    | "load_history"
    | "context_update"
    | "select_agent";
  content?: string;
  conversation_id?: string;
  confirmation_id?: string;
  approved?: boolean;
  context?: PageContext;
  agent_id?: string | null;
}

interface ChatServerMessage {
  type:
    | "assistant_message"
    | "stream_delta"
    | "stream_end"
    | "tool_use"
    | "confirm_request"
    | "conversation_created"
    | "history"
    | "history_message"
    | "history_end"
    | "task_created"
    | "task_progress"
    | "task_completed"
    | "task_failed"
    | "error";
  content?: string;
  role?: string;
  conversation_id?: string;
  confirmation_id?: string;
  tool_name?: string;
  tool_args?: string;
  title?: string;
  messages?: ChatMessage[];
  error?: string;
  task_id?: string;
  agent_id?: string;
  progress?: number;
  current_step?: string;
  total_steps?: number;
  completed_steps?: number;
  result?: string;
}

export function useAiChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

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

    if (wsRef.current) {
      wsRef.current.close();
    }

    storeRef.current.setConnectionState("connecting");
    storeRef.current.setConnectionError(null);

    const ws = new WebSocket(
      `${WS_URL}/ws/ai/chat?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = 1000;
      storeRef.current.setConnectionState("connected");
      storeRef.current.setConnectionError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ChatServerMessage = JSON.parse(event.data);
        const store = storeRef.current;

        switch (msg.type) {
          case "stream_delta": {
            // If not already streaming, start a new assistant message
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
            break;
          }

          case "stream_end": {
            const state = useAiChatStore.getState();
            const streamingMsg = state.messages.findLast((m) => m.isStreaming);
            if (streamingMsg) {
              store.updateMessage(streamingMsg.id, { isStreaming: false });
            }
            store.setIsStreaming(false);
            break;
          }

          case "assistant_message":
            store.addMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content: msg.content || "",
              timestamp: new Date().toISOString(),
            });
            break;

          case "confirm_request":
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
            break;

          case "conversation_created":
            if (msg.conversation_id) {
              store.addConversation({
                id: msg.conversation_id,
                title: msg.title || "New conversation",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messageCount: 0,
              });
              store.setActiveConversation(msg.conversation_id);
            }
            break;

          case "history":
            if (msg.messages) {
              store.setMessages(msg.messages);
            }
            break;

          case "history_message":
            store.addMessage({
              id: crypto.randomUUID(),
              role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
              content: msg.content || "",
              timestamp: new Date().toISOString(),
            });
            break;

          case "history_end":
            // History loading complete — no action needed
            break;

          case "task_created": {
            if (msg.task_id) {
              const state = useAiChatStore.getState();
              store.setTasks([
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
            break;
          }

          case "task_progress": {
            if (msg.task_id) {
              store.updateTask(msg.task_id, {
                progress: msg.progress ?? 0,
                current_step: msg.current_step || "",
                completed_steps: msg.completed_steps ?? 0,
              });
            }
            break;
          }

          case "task_completed": {
            if (msg.task_id) {
              store.updateTask(msg.task_id, {
                status: "completed",
                progress: 100,
                result: msg.result || msg.content,
              });
            }
            break;
          }

          case "task_failed": {
            if (msg.task_id) {
              store.updateTask(msg.task_id, {
                status: "failed",
                error: msg.error || msg.content || "Task failed",
              });
            }
            break;
          }

          case "error": {
            store.setIsStreaming(false);
            const errorText = msg.error || msg.content || "Unknown error";
            const isNotConfigured =
              /not configured|no provider/i.test(errorText);
            const friendlyError = isNotConfigured
              ? "AI assistant is not configured. Please set up an AI provider in Settings."
              : errorText;
            store.addMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${friendlyError}`,
              timestamp: new Date().toISOString(),
            });
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      storeRef.current.setConnectionState("disconnected");
      // Only reconnect if the panel is still open and it wasn't a clean close
      if (event.code !== 1000) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            30000
          );
          connect();
        }, reconnectDelayRef.current);
      }
    };

    ws.onerror = () => {
      storeRef.current.setConnectionState("error");
      storeRef.current.setConnectionError(
        "Failed to connect to AI assistant. The server may be unavailable."
      );
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Connect when panel opens or full page is active, fetch AI status
  useEffect(() => {
    if (isOpen || isFullPage) {
      fetchAiStatus();
      fetchAgents();
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, isFullPage, connect, disconnect, fetchAiStatus, fetchAgents]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
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
      const msg: ChatWsMessage = {
        type: "user_message",
        content,
        conversation_id: state.activeConversationId || undefined,
        context: pageContext,
        agent_id: state.activeAgentId,
      };
      wsRef.current.send(JSON.stringify(msg));
    },
    [pageContext]
  );

  const confirmAction = useCallback((confirmId: string, approved: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const msg: ChatWsMessage = {
      type: "confirm_action",
      confirmation_id: confirmId,
      approved,
    };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  const startNewConversation = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    storeRef.current.setMessages([]);
    storeRef.current.setActiveConversation(null);

    const msg: ChatWsMessage = { type: "new_conversation" };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  const loadConversation = useCallback((conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    storeRef.current.setActiveConversation(conversationId);
    storeRef.current.setMessages([]);

    const msg: ChatWsMessage = {
      type: "load_history",
      conversation_id: conversationId,
    };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  const updateContext = useCallback((context: PageContext) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const msg: ChatWsMessage = {
      type: "context_update",
      context,
    };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    storeRef.current.setActiveAgent(agentId);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: ChatWsMessage = {
        type: "select_agent",
        agent_id: agentId,
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    sendMessage,
    confirmAction,
    startNewConversation,
    loadConversation,
    updateContext,
    selectAgent,
    fetchAgents,
  };
}
