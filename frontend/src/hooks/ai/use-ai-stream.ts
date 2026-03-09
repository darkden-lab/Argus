"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAiChatStore } from "@/stores/ai-chat";
import type { Socket } from "socket.io-client";

/** Timeout in ms — if no stream_delta arrives within this window, streaming is reset. */
const STREAM_TIMEOUT_MS = 90_000;

/**
 * Hook that handles streaming events (stream_delta, stream_end) on the
 * AI Socket.IO connection. Includes deduplication, message ordering via
 * streamMessageId, and a 90 s inactivity timeout.
 */
export function useAiStream(
  socketRef: React.RefObject<Socket | null>
) {
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ID of the message currently being streamed into. */
  const streamMessageIdRef = useRef<string | null>(null);
  /** Last delta content received — used for deduplication. */
  const lastDeltaContentRef = useRef<string | null>(null);

  const {
    addMessage,
    appendToMessage,
    updateMessage,
    setIsStreaming,
    setStreamFinishReason,
  } = useAiChatStore();

  // Keep store actions in a ref so socket callbacks never go stale
  const storeRef = useRef({
    addMessage,
    appendToMessage,
    updateMessage,
    setIsStreaming,
    setStreamFinishReason,
  });
  storeRef.current = {
    addMessage,
    appendToMessage,
    updateMessage,
    setIsStreaming,
    setStreamFinishReason,
  };

  // Clear the streaming timeout
  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  // Finalize streaming state — shared by stream_end and timeout
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

  // Reset the streaming timeout — fires if no stream_delta for STREAM_TIMEOUT_MS
  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      const state = useAiChatStore.getState();
      if (state.isStreaming) {
        finalizeStream("timeout");
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout, finalizeStream]);

  // Attach / detach socket listeners
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleStreamDelta = (msg: { content?: string }) => {
      const store = storeRef.current;
      const content = msg.content || "";

      // Deduplication: skip if the content is identical to the last delta
      if (content && content === lastDeltaContentRef.current) {
        return;
      }
      lastDeltaContentRef.current = content || null;

      const state = useAiChatStore.getState();

      // If we have a tracked streaming message, append to it
      if (streamMessageIdRef.current) {
        const tracked = state.messages.find(
          (m) => m.id === streamMessageIdRef.current
        );
        if (tracked && tracked.isStreaming) {
          if (content) {
            store.appendToMessage(tracked.id, content);
          }
          resetStreamTimeout();
          return;
        }
      }

      // Check the last message in the list
      const lastMsg = state.messages[state.messages.length - 1];
      if (!lastMsg || !lastMsg.isStreaming) {
        // Start a new streaming message
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
        // Append to the existing streaming message
        streamMessageIdRef.current = lastMsg.id;
        if (content) {
          store.appendToMessage(lastMsg.id, content);
        }
      }

      resetStreamTimeout();
    };

    const handleStreamEnd = (msg?: { reason?: string }) => {
      finalizeStream(msg?.reason || "stop");
    };

    socket.off("stream_delta");
    socket.off("stream_end");
    socket.on("stream_delta", handleStreamDelta);
    socket.on("stream_end", handleStreamEnd);

    return () => {
      socket.off("stream_delta", handleStreamDelta);
      socket.off("stream_end", handleStreamEnd);
      clearStreamTimeout();
    };
  }, [socketRef, resetStreamTimeout, finalizeStream, clearStreamTimeout]);
}
