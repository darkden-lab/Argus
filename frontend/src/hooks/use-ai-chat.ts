"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore, type ChatMessage, type PageContext, type AiStatus } from "@/stores/ai-chat";
import { api } from "@/lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

interface ChatWsMessage {
  type:
    | "user_message"
    | "confirm_action"
    | "new_conversation"
    | "load_history"
    | "context_update";
  content?: string;
  conversation_id?: string;
  confirmation_id?: string;
  approved?: boolean;
  context?: PageContext;
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
}

export function useAiChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  const {
    isOpen,
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
              store.addMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: msg.content || "Action requires confirmation",
                timestamp: new Date().toISOString(),
                confirmAction: {
                  id: msg.confirmation_id,
                  tool: msg.tool_name || "",
                  description: msg.content || "",
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

  // Connect when panel opens, fetch AI status
  useEffect(() => {
    if (isOpen) {
      fetchAiStatus();
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, connect, disconnect, fetchAiStatus]);

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

      const msg: ChatWsMessage = {
        type: "user_message",
        content,
        conversation_id: useAiChatStore.getState().activeConversationId || undefined,
        context: pageContext,
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

  return {
    sendMessage,
    confirmAction,
    startNewConversation,
    loadConversation,
    updateContext,
  };
}
