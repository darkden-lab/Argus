"use client";

import { useCallback } from "react";
import { useAiChatStore, type ChatMessage, type PageContext, type Agent, type Conversation } from "@/stores/ai-chat";
import { useAiConnection } from "@/hooks/ai/use-ai-connection";
import { useAiStream } from "@/hooks/ai/use-ai-stream";
import { useAiEvents } from "@/hooks/ai/use-ai-events";
import { api } from "@/lib/api";

/**
 * Thin facade that composes the three AI sub-hooks and exposes
 * action functions for the chat UI. All socket event handling,
 * connection lifecycle, and streaming logic live in the sub-hooks.
 */
export function useAiChat() {
  const { socketRef } = useAiConnection();
  useAiStream(socketRef);
  useAiEvents(socketRef);

  const pageContext = useAiChatStore((s) => s.pageContext);

  const sendMessage = useCallback(
    (content: string) => {
      const socket = socketRef.current;
      const store = useAiChatStore.getState();

      // Add the user message locally
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(userMessage);

      if (!socket?.connected) {
        store.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Error: Unable to send message. The AI assistant is not connected. Please check your connection and AI configuration in Settings.",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      socket.emit("user_message", {
        content,
        conversation_id: store.activeConversationId || undefined,
        context: pageContext,
        agent_id: store.activeAgentId,
      });
    },
    [socketRef, pageContext]
  );

  const confirmAction = useCallback(
    (confirmId: string, approved: boolean) => {
      socketRef.current?.emit("confirm_action", {
        confirmation_id: confirmId,
        approved,
      });

      // Update the confirmation status locally
      const state = useAiChatStore.getState();
      const targetMsg = state.messages.find(
        (m) => m.confirmAction?.id === confirmId
      );
      if (targetMsg) {
        state.updateMessage(targetMsg.id, {
          confirmAction: {
            ...targetMsg.confirmAction!,
            status: approved ? "approved" : "rejected",
          },
        });
      }

      // Clear the pending confirmation
      state.setPendingConfirmationId(null);
    },
    [socketRef]
  );

  const startNewConversation = useCallback(() => {
    const store = useAiChatStore.getState();
    store.setMessages([]);
    store.setActiveConversation(null);
    store.setActiveAgent(null);
    socketRef.current?.emit("new_conversation");
  }, [socketRef]);

  const loadConversation = useCallback(
    (conversationId: string) => {
      const store = useAiChatStore.getState();
      store.setActiveConversation(conversationId);
      store.setMessages([]);
      store.setIsHistoryLoading(true);
      socketRef.current?.emit("load_history", {
        conversation_id: conversationId,
      });
    },
    [socketRef]
  );

  const deleteConversation = useCallback((conversationId: string) => {
    api
      .del(`/api/ai/conversations/${conversationId}`)
      .then(() => {
        useAiChatStore.getState().removeConversation(conversationId);
      })
      .catch(() => {
        // Silently handle — conversation may already be gone
      });
  }, []);

  const updateContext = useCallback(
    (context: PageContext) => {
      socketRef.current?.emit("context_update", context);
    },
    [socketRef]
  );

  const selectAgent = useCallback(
    (agentId: string | null) => {
      useAiChatStore.getState().setActiveAgent(agentId);
      socketRef.current?.emit("select_agent", { agent_id: agentId });
    },
    [socketRef]
  );

  const fetchAgents = useCallback(() => {
    api
      .get<Agent[]>("/api/ai/agents")
      .then((agents) => {
        useAiChatStore.getState().setAgents(agents);
      })
      .catch(() => {
        // Agents endpoint may not exist yet
      });
  }, []);

  const fetchConversations = useCallback(() => {
    api
      .get<Conversation[]>("/api/ai/conversations")
      .then((conversations) => {
        useAiChatStore.getState().setConversations(conversations || []);
      })
      .catch(() => {
        // Endpoint may not be available yet
      });
  }, []);

  const startTask = useCallback(
    (agentId: string, title: string, content?: string) => {
      socketRef.current?.emit("start_task", {
        agent_id: agentId,
        task_title: title,
        content: content || title,
      });
    },
    [socketRef]
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      socketRef.current?.emit("cancel_task", { task_id: taskId });
    },
    [socketRef]
  );

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
