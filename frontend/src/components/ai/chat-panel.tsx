"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  MessageSquare,
  X,
  Plus,
  PanelLeftOpen,
  PanelLeftClose,
  Send,
  Loader2,
  GripVertical,
  Server,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAiChatStore } from "@/stores/ai-chat";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatMessage } from "./chat-message";
import { ConfirmAction } from "./confirm-action";

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 420;

const suggestedPrompts = [
  { label: "What pods are failing?", icon: "alert" },
  { label: "Show resource usage", icon: "chart" },
  { label: "Help me scale my deployment", icon: "scale" },
  { label: "Explain this error", icon: "help" },
];

export function ChatPanel() {
  const {
    isOpen,
    close,
    messages,
    isStreaming,
    inputValue,
    setInputValue,
    conversations,
    activeConversationId,
    showSidebar,
    toggleSidebar,
    pageContext,
  } = useAiChatStore();

  const {
    sendMessage,
    confirmAction,
    startNewConversation,
    loadConversation,
  } = useAiChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("argus:ai-panel-width");
      if (stored) return parseInt(stored, 10);
    }
    return DEFAULT_WIDTH;
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

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
        // Dragging left edge means positive delta = increase width
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

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    if (isStreaming) return;
    sendMessage(prompt);
  };

  if (!isOpen) return null;

  const hasContext = pageContext.cluster || pageContext.namespace;

  return (
    <div
      ref={panelRef}
      className="fixed inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-background shadow-xl"
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
          >
            {showSidebar ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <h2 className="text-sm font-semibold">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={startNewConversation}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={close}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Context bar */}
      {hasContext && (
        <div className="flex items-center gap-3 border-b border-border px-4 py-1.5 bg-muted/30">
          {pageContext.cluster && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3 w-3" />
              <span>Cluster: <span className="font-medium text-foreground">{pageContext.cluster}</span></span>
            </div>
          )}
          {pageContext.namespace && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderOpen className="h-3 w-3" />
              <span>Namespace: <span className="font-medium text-foreground">{pageContext.namespace}</span></span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Conversation sidebar */}
        {showSidebar && (
          <div className="w-48 shrink-0 border-r border-border">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-0.5">
                {conversations.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    No conversations yet
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        conv.id === activeConversationId
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50"
                      )}
                      onClick={() => loadConversation(conv.id)}
                    >
                      <p className="truncate font-medium">{conv.title}</p>
                      <p className="mt-0.5 text-[10px] opacity-60">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="py-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium">
                    How can I help?
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ask questions about your Kubernetes clusters, get
                    troubleshooting help, or manage resources.
                  </p>

                  {/* Suggested prompts */}
                  <div className="mt-6 grid w-full grid-cols-2 gap-2 px-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        className={cn(
                          "rounded-lg border border-border px-3 py-2.5 text-left text-xs transition-colors",
                          "hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
                          "text-muted-foreground"
                        )}
                        onClick={() => handleSuggestedPrompt(prompt.label)}
                        disabled={isStreaming}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id}>
                    <ChatMessage message={msg} />
                    {msg.confirmAction && (
                      <ConfirmAction
                        confirmAction={msg.confirmAction}
                        onConfirm={confirmAction}
                      />
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <Separator />

          {/* Input */}
          <div className="p-3">
            <div className="flex items-end gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your clusters..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                style={{
                  minHeight: "20px",
                  maxHeight: "120px",
                  height: "auto",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
              <Button
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={!inputValue.trim() || isStreaming}
                onClick={handleSubmit}
              >
                {isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              AI can make mistakes. Verify actions before approving.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatToggleButton() {
  const { toggle, isOpen, messages } = useAiChatStore();
  const unread = messages.filter(
    (m) => m.role === "assistant" && !m.isStreaming
  ).length;

  return (
    <Button
      variant={isOpen ? "secondary" : "default"}
      size="icon"
      className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
      onClick={toggle}
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
