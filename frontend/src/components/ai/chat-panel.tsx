"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import {
  MessageSquare,
  X,
  Plus,
  PanelLeftOpen,
  PanelLeftClose,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiChatStore } from "@/stores/ai-chat";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatInterface } from "./chat-interface";

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 420;

export function ChatPanel() {
  const {
    isOpen,
    close,
    showSidebar,
    toggleSidebar,
    connectionState,
  } = useAiChatStore();

  const { startNewConversation } = useAiChat();

  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = parseInt(localStorage.getItem("argus:ai-panel-width") || "", 10);
      if (Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH) return stored;
    }
    return DEFAULT_WIDTH;
  });

  // Save width to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("argus:ai-panel-width", String(panelWidth));
    }
  }, [panelWidth]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function handleMouseMove(ev: MouseEvent) {
        if (!isDraggingRef.current) return;
        const delta = startXRef.current - ev.clientX;
        const newWidth = Math.min(
          Math.max(startWidthRef.current + delta, MIN_WIDTH),
          MAX_WIDTH
        );
        setPanelWidth(newWidth);
      }

      function handleMouseUp() {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth]
  );

  if (!isOpen) return null;

  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  return (
    <div
      ref={panelRef}
      className="fixed inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-background shadow-xl will-change-transform"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Drag handle on left edge */}
      <div
        className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors"
        onMouseDown={handleDragStart}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-8 -ml-1.5 opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleSidebar}
            aria-label="Toggle conversation sidebar"
          >
            {showSidebar ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <h2 className="text-sm font-semibold">AI Assistant</h2>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected
                ? "bg-green-500"
                : connecting
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            )}
            title={connected ? "Connected" : connecting ? "Connecting..." : "Disconnected"}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={startNewConversation}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={close}
            aria-label="Close AI panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ChatInterface mode="panel" />
    </div>
  );
}

export function ChatToggleButton() {
  const { toggle, isOpen, messages, lastReadMessageIndex, markAsRead } = useAiChatStore();
  const unread = messages.filter(
    (m, i) => i > lastReadMessageIndex && m.role === "assistant" && !m.isStreaming
  ).length;

  // Mark as read when panel opens
  useEffect(() => {
    if (isOpen) {
      markAsRead();
    }
  }, [isOpen, messages.length, markAsRead]);

  return (
    <Button
      variant={isOpen ? "secondary" : "default"}
      size="icon"
      className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
      onClick={toggle}
      aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
    >
      <MessageSquare className="h-5 w-5" />
      {!isOpen && unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );
}
