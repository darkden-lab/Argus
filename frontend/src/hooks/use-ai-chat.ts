"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore, type ChatMessage, type PageContext } from "@/stores/ai-chat";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

interface ChatWsMessage {
  type:
    | "user_message"
    | "confirm_action"
    | "new_conversation"
    | "load_history"
    | "context_update";
  content?: string;
  conversationId?: string;
  confirmId?: string;
  approved?: boolean;
  context?: PageContext;
}

interface ChatServerMessage {
  type:
    | "message_start"
    | "message_delta"
    | "message_end"
    | "tool_use"
    | "confirm_request"
    | "conversation_created"
    | "history"
    | "error";
  messageId?: string;
  content?: string;
  role?: "assistant" | "tool";
  conversationId?: string;
  title?: string;
  messages?: ChatMessage[];
  toolCall?: ChatMessage["toolCall"];
  confirmAction?: ChatMessage["confirmAction"];
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
  };

  const connect = useCallback(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(
      `${WS_URL}/api/ai/chat?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const msg: ChatServerMessage = JSON.parse(event.data);
        const store = storeRef.current;

        switch (msg.type) {
          case "message_start":
            store.setIsStreaming(true);
            store.addMessage({
              id: msg.messageId || crypto.randomUUID(),
              role: msg.role || "assistant",
              content: "",
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
            break;

          case "message_delta":
            if (msg.messageId && msg.content) {
              store.appendToMessage(msg.messageId, msg.content);
            }
            break;

          case "message_end":
            if (msg.messageId) {
              store.updateMessage(msg.messageId, { isStreaming: false });
            }
            store.setIsStreaming(false);
            break;

          case "tool_use":
            store.addMessage({
              id: msg.messageId || crypto.randomUUID(),
              role: "tool",
              content: msg.content || "",
              timestamp: new Date().toISOString(),
              toolCall: msg.toolCall,
            });
            break;

          case "confirm_request":
            if (msg.messageId && msg.confirmAction) {
              store.addMessage({
                id: msg.messageId,
                role: "assistant",
                content: msg.content || "Action requires confirmation",
                timestamp: new Date().toISOString(),
                confirmAction: msg.confirmAction,
              });
            }
            break;

          case "conversation_created":
            if (msg.conversationId) {
              store.addConversation({
                id: msg.conversationId,
                title: msg.title || "New conversation",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messageCount: 0,
              });
              store.setActiveConversation(msg.conversationId);
            }
            break;

          case "history":
            if (msg.messages) {
              store.setMessages(msg.messages);
            }
            break;

          case "error":
            store.setIsStreaming(false);
            store.addMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${msg.error || "Unknown error"}`,
              timestamp: new Date().toISOString(),
            });
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
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

  // Connect when panel opens
  useEffect(() => {
    if (isOpen) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, connect, disconnect]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

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
        conversationId: useAiChatStore.getState().activeConversationId || undefined,
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
      confirmId,
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

    const msg: ChatWsMessage = {
      type: "load_history",
      conversationId,
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
