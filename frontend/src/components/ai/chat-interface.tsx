"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Send,
  Loader2,
  Server,
  FolderOpen,
  AlertTriangle,
  Settings,
  WifiOff,
  Bot,
  Search,
  Activity,
  Wrench,
  PanelLeftOpen,
  PanelLeftClose,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAiChatStore } from "@/stores/ai-chat";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatMessage } from "./chat-message";
import { ConfirmAction } from "./confirm-action";
import { AgentSelector } from "./agent-selector";
import { AgentEditor } from "./agent-editor";
import { TaskProgress } from "./task-progress";

const suggestedPrompts = [
  {
    category: "Diagnose",
    icon: Activity,
    prompts: [
      "What pods are failing in this cluster?",
      "Show recent warning events",
    ],
  },
  {
    category: "Monitor",
    icon: Search,
    prompts: [
      "Show CPU and memory usage",
      "Which nodes have high resource pressure?",
    ],
  },
  {
    category: "Manage",
    icon: Wrench,
    prompts: [
      "Help me scale my deployment",
      "List all ingresses across namespaces",
    ],
  },
];

function groupConversationsByDate(conversations: { id: string; title: string; updatedAt: string }[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: typeof conversations }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= lastWeek) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

interface ChatInterfaceProps {
  mode: "panel" | "fullpage";
}

export function ChatInterface({ mode }: ChatInterfaceProps) {
  const {
    messages,
    isStreaming,
    inputValue,
    setInputValue,
    conversations,
    activeConversationId,
    showSidebar,
    toggleSidebar,
    pageContext,
    aiStatus,
    connectionState,
    connectionError,
    agents,
    activeAgentId,
    tasks,
  } = useAiChatStore();

  const {
    sendMessage,
    confirmAction,
    startNewConversation,
    loadConversation,
    deleteConversation,
    selectAgent,
    fetchAgents,
    cancelTask,
  } = useAiChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [sidebarSearch, setSidebarSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const filteredConversations = useMemo(() => {
    if (!sidebarSearch.trim()) return conversations;
    const q = sidebarSearch.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, sidebarSearch]);

  const conversationGroups = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  const isPanel = mode === "panel";
  const isEmpty = messages.length === 0;
  const sidebarWidth = isPanel ? "w-52" : "w-64";
  const sidebarInnerWidth = isPanel ? "w-52" : "w-64";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount for fullpage
  useEffect(() => {
    if (mode === "fullpage") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode]);

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

  const handleCancelTask = (taskId: string) => {
    cancelTask(taskId);
  };

  const hasContext = pageContext.cluster_id || pageContext.namespace;
  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  const inputArea = (
    <div className={cn(isEmpty && !isPanel ? "max-w-2xl w-full" : "w-full")}>
      <div className={cn(
        "flex items-end gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors",
        "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20",
        (aiStatus && !aiStatus.configured) && "opacity-50"
      )}>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            aiStatus && !aiStatus.configured
              ? "AI assistant is not configured..."
              : connectionState !== "connected"
                ? "Connecting to AI assistant..."
                : "Ask about your clusters..."
          }
          rows={1}
          disabled={!!(aiStatus && !aiStatus.configured)}
          aria-label="Message to AI assistant"
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
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
          disabled={!inputValue.trim() || isStreaming || !!(aiStatus && !aiStatus.configured)}
          onClick={handleSubmit}
          aria-label="Send message"
        >
          {isStreaming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        <span className="text-[10px] text-muted-foreground/40">
          Enter to send, Shift+Enter for new line
        </span>
        <span className="text-[10px] text-muted-foreground/40">
          AI can make mistakes
        </span>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col", isPanel ? "flex-1 min-h-0" : "h-full")}>
      {/* Fullpage header */}
      {!isPanel && (
        <div className="flex h-14 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
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
            <h1 className="text-lg font-semibold">AI Assistant</h1>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected
                  ? "bg-green-500"
                  : connecting
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              )}
              title={connected ? "Connected" : connecting ? "Connecting..." : "Disconnected"}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={startNewConversation}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>
      )}

      {/* Context bar with pills */}
      {hasContext && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 bg-muted/30">
          {pageContext.cluster_id && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              <Server className="h-2.5 w-2.5" />
              {pageContext.cluster_id}
            </span>
          )}
          {pageContext.namespace && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              <FolderOpen className="h-2.5 w-2.5" />
              {pageContext.namespace}
            </span>
          )}
        </div>
      )}

      {/* Agent selector */}
      {agents.length > 0 && (
        <AgentSelector
          agents={agents}
          activeAgentId={activeAgentId}
          onSelectAgent={selectAgent}
          onCreateAgent={() => setEditorOpen(true)}
        />
      )}

      <div className="flex flex-1 min-h-0">
        {/* Conversation sidebar */}
        <div
          className={cn(
            "shrink-0 border-r border-border overflow-hidden transition-all duration-200",
            showSidebar ? sidebarWidth : "w-0 border-r-0"
          )}
        >
          <div className={cn(sidebarInnerWidth, "h-full flex flex-col")}>
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  aria-label="Search conversations"
                  className="w-full rounded-md border border-border bg-transparent pl-7 pr-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-3">
                {conversationGroups.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {sidebarSearch ? "No results" : "No conversations yet"}
                  </p>
                ) : (
                  conversationGroups.map((group) => (
                    <div key={group.label}>
                      <p className="px-2 mb-1 text-[10px] font-medium uppercase text-muted-foreground/60">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map((conv) => (
                          <div
                            key={conv.id}
                            className={cn(
                              "group flex items-center rounded-md transition-colors",
                              conv.id === activeConversationId
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50"
                            )}
                          >
                            <button
                              className="flex-1 min-w-0 px-2 py-1.5 text-left text-xs"
                              onClick={() => loadConversation(conv.id)}
                              aria-label={`Load conversation: ${conv.title}`}
                            >
                              <p className="truncate font-medium">{conv.title}</p>
                            </button>
                            <button
                              className="hidden group-hover:flex shrink-0 items-center justify-center h-6 w-6 mr-1 rounded hover:bg-destructive/20 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Delete this conversation?")) {
                                  deleteConversation(conv.id);
                                }
                              }}
                              title="Delete conversation"
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Connection / configuration warnings */}
          {connectionState === "error" && connectionError && (
            <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{connectionError}</span>
            </div>
          )}
          {connectionState === "connecting" && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>Connecting to AI assistant...</span>
            </div>
          )}
          {aiStatus && !aiStatus.configured && connectionState !== "connecting" && (
            <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-medium">AI assistant requires configuration</p>
                <p className="mt-0.5 opacity-80">{aiStatus.message}</p>
                <a
                  href="/settings/ai"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80"
                >
                  <Settings className="h-3 w-3" />
                  Go to AI Settings
                </a>
              </div>
            </div>
          )}

          {/* Task progress */}
          <TaskProgress tasks={tasks} onCancelTask={handleCancelTask} />

          {isEmpty ? (
            /* Centered layout when no messages */
            <div className="flex flex-1 flex-col items-center justify-center min-h-0">
              <div className={cn(
                "flex flex-col items-center text-center",
                isPanel ? "px-6" : "px-8 max-w-2xl w-full"
              )}>
                {aiStatus && !aiStatus.configured ? (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted animate-fade-up">
                      <Bot className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-sm font-medium animate-fade-up" style={{ animationDelay: "0.1s", opacity: 0 }}>
                      AI Assistant Not Configured
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground animate-fade-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
                      {aiStatus.message || "Set up an AI provider in Settings to start using the assistant."}
                    </p>
                    <a
                      href="/settings/ai"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors animate-fade-up"
                      style={{ animationDelay: "0.2s", opacity: 0 }}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Configure AI Provider
                    </a>
                  </>
                ) : (
                  <>
                    <div className="relative animate-fade-up">
                      <div className={cn(
                        "flex items-center justify-center rounded-full bg-muted",
                        isPanel ? "h-14 w-14" : "h-16 w-16"
                      )}>
                        <Bot className={cn("text-muted-foreground", isPanel ? "h-7 w-7" : "h-8 w-8")} />
                      </div>
                      {connected && (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                      )}
                    </div>
                    <h3 className={cn(
                      "mt-4 font-medium animate-fade-up",
                      isPanel ? "text-sm" : "text-base"
                    )} style={{ animationDelay: "0.1s", opacity: 0 }}>
                      How can I help?
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground animate-fade-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
                      Ask about your Kubernetes clusters, troubleshoot issues, or manage resources.
                    </p>

                    {/* Suggested prompts by category */}
                    <div className={cn(
                      "mt-6 w-full space-y-3",
                      isPanel ? "px-2" : "max-w-lg"
                    )}>
                      {suggestedPrompts.map((group, gi) => (
                        <div
                          key={group.category}
                          className="animate-fade-up"
                          style={{ animationDelay: `${0.2 + gi * 0.08}s`, opacity: 0 }}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5 px-1">
                            <group.icon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] font-medium uppercase text-muted-foreground">
                              {group.category}
                            </span>
                          </div>
                          <div className={cn(
                            "grid gap-1.5",
                            isPanel ? "grid-cols-1" : "grid-cols-2"
                          )}>
                            {group.prompts.map((prompt) => (
                              <button
                                key={prompt}
                                className={cn(
                                  "rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors",
                                  "hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
                                  "text-muted-foreground"
                                )}
                                onClick={() => handleSuggestedPrompt(prompt)}
                                disabled={isStreaming}
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Input centered below prompts */}
                    <div className={cn("mt-6 w-full", isPanel ? "" : "max-w-2xl")}>
                      {inputArea}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Standard layout with messages */
            <>
              <ScrollArea className="flex-1">
                <div className={cn("py-4", !isPanel && "max-w-3xl mx-auto px-4")}>
                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <ChatMessage message={msg} />
                      {msg.confirmAction && (
                        <ConfirmAction
                          confirmAction={msg.confirmAction}
                          onConfirm={confirmAction}
                        />
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <Separator />

              {/* Input pinned at bottom */}
              <div className={cn(isPanel ? "p-3" : "max-w-3xl mx-auto w-full p-4")}>
                {inputArea}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agent editor dialog */}
      <AgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={fetchAgents}
      />
    </div>
  );
}
