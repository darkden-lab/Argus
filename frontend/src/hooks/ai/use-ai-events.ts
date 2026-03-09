"use client";

import { useEffect, useRef } from "react";
import { useAiChatStore } from "@/stores/ai-chat";
import { classifyAiError } from "@/lib/ai-errors";
import type { Socket } from "socket.io-client";

/**
 * Hook that handles all non-streaming Socket.IO events for the AI chat:
 * ai_error, confirm_request, history_message, history_end,
 * conversation_created, agent_selected, and task lifecycle events.
 */
export function useAiEvents(
  socketRef: React.RefObject<Socket | null>
) {
  const {
    addMessage,
    updateMessage,
    setIsStreaming,
    setIsHistoryLoading,
    setPendingConfirmationId,
    setConnectionState,
    setConnectionError,
    addConversation,
    setActiveAgent,
    setTasks,
    updateTask,
  } = useAiChatStore();

  // Keep store actions in a ref so socket callbacks never go stale
  const storeRef = useRef({
    addMessage,
    updateMessage,
    setIsStreaming,
    setIsHistoryLoading,
    setPendingConfirmationId,
    setConnectionState,
    setConnectionError,
    addConversation,
    setActiveAgent,
    setTasks,
    updateTask,
  });
  storeRef.current = {
    addMessage,
    updateMessage,
    setIsStreaming,
    setIsHistoryLoading,
    setPendingConfirmationId,
    setConnectionState,
    setConnectionError,
    addConversation,
    setActiveAgent,
    setTasks,
    updateTask,
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // --- ai_error ---
    const handleAiError = (
      msg: { error?: string; content?: string } | string
    ) => {
      const store = storeRef.current;
      store.setIsStreaming(false);

      const classified = classifyAiError(msg);

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
    };

    // --- confirm_request ---
    const handleConfirmRequest = (msg: {
      confirmation_id?: string;
      tool_name?: string;
      tool_args?: string;
      content?: string;
    }) => {
      const store = storeRef.current;
      if (msg.confirmation_id) {
        store.setPendingConfirmationId(msg.confirmation_id);

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
    };

    // --- history_message ---
    const handleHistoryMessage = (msg: {
      content?: string;
      role?: string;
      conversation_id?: string;
    }) => {
      storeRef.current.addMessage({
        id: crypto.randomUUID(),
        role: (msg.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: msg.content || "",
        timestamp: new Date().toISOString(),
      });
    };

    // --- history_end ---
    const handleHistoryEnd = () => {
      storeRef.current.setIsHistoryLoading(false);
    };

    // --- conversation_created ---
    const handleConversationCreated = (msg: {
      conversation_id?: string;
      title?: string;
    }) => {
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
        useAiChatStore.setState({
          activeConversationId: msg.conversation_id,
        });
      }
    };

    // --- agent_selected ---
    const handleAgentSelected = (msg: {
      agent_id?: string;
      agent_name?: string;
    }) => {
      storeRef.current.setActiveAgent(msg.agent_id || null);
    };

    // --- task_created ---
    const handleTaskCreated = (msg: {
      task_id?: string;
      agent_id?: string;
      title?: string;
      current_step?: string;
      total_steps?: number;
    }) => {
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
    };

    // --- task_progress ---
    const handleTaskProgress = (msg: {
      task_id?: string;
      progress?: number;
      current_step?: string;
      completed_steps?: number;
    }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          progress: msg.progress ?? 0,
          current_step: msg.current_step || "",
          completed_steps: msg.completed_steps ?? 0,
        });
      }
    };

    // --- task_completed ---
    const handleTaskCompleted = (msg: {
      task_id?: string;
      result?: string;
      content?: string;
    }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "completed",
          progress: 100,
          result: msg.result || msg.content,
        });
      }
    };

    // --- task_failed ---
    const handleTaskFailed = (msg: {
      task_id?: string;
      error?: string;
      content?: string;
    }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "failed",
          error: msg.error || msg.content || "Task failed",
        });
      }
    };

    // --- task_cancelled ---
    const handleTaskCancelled = (msg: { task_id?: string }) => {
      if (msg.task_id) {
        storeRef.current.updateTask(msg.task_id, {
          status: "cancelled",
          progress: 0,
        });
      }
    };

    // Remove previous handlers for the events we manage
    socket.off("ai_error");
    socket.off("confirm_request");
    socket.off("history_message");
    socket.off("history_end");
    socket.off("conversation_created");
    socket.off("agent_selected");
    socket.off("task_created");
    socket.off("task_progress");
    socket.off("task_completed");
    socket.off("task_failed");
    socket.off("task_cancelled");

    // Register handlers
    socket.on("ai_error", handleAiError);
    socket.on("confirm_request", handleConfirmRequest);
    socket.on("history_message", handleHistoryMessage);
    socket.on("history_end", handleHistoryEnd);
    socket.on("conversation_created", handleConversationCreated);
    socket.on("agent_selected", handleAgentSelected);
    socket.on("task_created", handleTaskCreated);
    socket.on("task_progress", handleTaskProgress);
    socket.on("task_completed", handleTaskCompleted);
    socket.on("task_failed", handleTaskFailed);
    socket.on("task_cancelled", handleTaskCancelled);

    return () => {
      socket.off("ai_error", handleAiError);
      socket.off("confirm_request", handleConfirmRequest);
      socket.off("history_message", handleHistoryMessage);
      socket.off("history_end", handleHistoryEnd);
      socket.off("conversation_created", handleConversationCreated);
      socket.off("agent_selected", handleAgentSelected);
      socket.off("task_created", handleTaskCreated);
      socket.off("task_progress", handleTaskProgress);
      socket.off("task_completed", handleTaskCompleted);
      socket.off("task_failed", handleTaskFailed);
      socket.off("task_cancelled", handleTaskCancelled);
    };
  }, [socketRef]);
}
