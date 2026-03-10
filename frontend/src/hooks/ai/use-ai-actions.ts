"use client";

import { useCallback } from "react";
import {
  useAiChatStore,
  type ChatMessage,
  type PageContext,
  type Agent,
  type Conversation,
} from "@/stores/ai-chat";
import { api } from "@/lib/api";

/**
 * Hook that provides action functions for the AI chat, using REST
 * endpoints instead of Socket.IO emit calls.
 */
export function useAiActions() {
  const pageContext = useAiChatStore((s) => s.pageContext);

  const sendMessage = useCallback(
    (content: string) => {
      const store = useAiChatStore.getState();

      // Add user message locally
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(userMessage);

      if (store.connectionState !== "connected") {
        store.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Error: Unable to send message. The AI assistant is not connected. Please check your connection and AI configuration in Settings.",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // POST to REST endpoint — response comes via SSE
      api
        .post<{ conversation_id: string; status: string }>(
          "/api/ai/messages",
          {
            content,
            conversation_id: store.activeConversationId || undefined,
            context: pageContext,
            agent_id: store.activeAgentId || undefined,
          }
        )
        .catch((err) => {
          store.addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${err.message || "Failed to send message"}`,
            timestamp: new Date().toISOString(),
          });
        });
    },
    [pageContext]
  );

  const confirmAction = useCallback(
    (confirmId: string, approved: boolean) => {
      // Update locally
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
      state.setPendingConfirmationId(null);

      // POST to REST endpoint
      api
        .post("/api/ai/messages/confirm", {
          confirmation_id: confirmId,
          approved,
        })
        .catch(() => {
          // Best-effort
        });
    },
    []
  );

  const loadConversation = useCallback((conversationId: string) => {
    const store = useAiChatStore.getState();
    store.setActiveConversation(conversationId);
    store.setMessages([]);
    store.setIsHistoryLoading(true);

    // Load history via REST (already exists)
    api
      .get<{ id: string; messages: Array<{ content: string; role: string }> }>(
        `/api/ai/conversations/${conversationId}`
      )
      .then((conv) => {
        if (conv?.messages) {
          const msgs: ChatMessage[] = conv.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: (m.role === "user" ? "user" : "assistant") as
              | "user"
              | "assistant",
            content: m.content || "",
            timestamp: new Date().toISOString(),
          }));
          store.setMessages(msgs);
        }
        store.setIsHistoryLoading(false);
      })
      .catch(() => {
        store.setIsHistoryLoading(false);
      });
  }, []);

  const startNewConversation = useCallback(() => {
    const store = useAiChatStore.getState();
    store.setMessages([]);
    store.setActiveConversation(null);
    store.setActiveAgent(null);
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    api
      .del(`/api/ai/conversations/${conversationId}`)
      .then(() => {
        useAiChatStore.getState().removeConversation(conversationId);
      })
      .catch(() => {});
  }, []);

  const updateContext = useCallback((_ctx: PageContext) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Context is now sent inline with each message POST — no separate call needed
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    useAiChatStore.getState().setActiveAgent(agentId);
    // Agent ID is sent with each message POST — no separate call needed
  }, []);

  const fetchAgents = useCallback(() => {
    api
      .get<Agent[]>("/api/ai/agents")
      .then((agents) => {
        useAiChatStore.getState().setAgents(agents);
      })
      .catch(() => {});
  }, []);

  const fetchConversations = useCallback(() => {
    api
      .get<Conversation[]>("/api/ai/conversations")
      .then((conversations) => {
        useAiChatStore.getState().setConversations(conversations || []);
      })
      .catch(() => {});
  }, []);

  const startTask = useCallback(
    (agentId: string, title: string, content?: string) => {
      api
        .post("/api/ai/tasks", {
          agent_id: agentId,
          task_title: title,
          content: content || title,
        })
        .catch((err) => {
          useAiChatStore.getState().addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${err.message || "Failed to start task"}`,
            timestamp: new Date().toISOString(),
          });
        });
    },
    []
  );

  const cancelTask = useCallback((taskId: string) => {
    api.del(`/api/ai/tasks/${taskId}`).catch(() => {});
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
