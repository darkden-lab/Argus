"use client";

import { useAiSSE } from "@/hooks/ai/use-ai-sse";
import { useAiActions } from "@/hooks/ai/use-ai-actions";

/**
 * Thin facade that composes the SSE connection hook and action functions
 * for the chat UI. All SSE event handling, connection lifecycle, and
 * streaming logic live in useAiSSE. Actions use REST calls.
 */
export function useAiChat() {
  useAiSSE();

  const {
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
  } = useAiActions();

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
