import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    result?: string;
  };
  confirmAction?: {
    id: string;
    tool: string;
    description: string;
    status: "pending" | "approved" | "rejected";
  };
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface PageContext {
  cluster?: string;
  namespace?: string;
  resource?: string;
  resourceKind?: string;
  resourceName?: string;
}

interface AiChatState {
  // Panel state
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addConversation: (conversation: Conversation) => void;

  // Messages
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, chunk: string) => void;

  // Streaming
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;

  // Page context
  pageContext: PageContext;
  setPageContext: (context: PageContext) => void;

  // Input
  inputValue: string;
  setInputValue: (value: string) => void;

  // Sidebar
  showSidebar: boolean;
  toggleSidebar: () => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  // Panel state
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) =>
    set({ activeConversationId: id, messages: [] }),
  addConversation: (conversation) =>
    set((s) => ({ conversations: [conversation, ...s.conversations] })),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  appendToMessage: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m
      ),
    })),

  // Streaming
  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  // Page context
  pageContext: {},
  setPageContext: (context) => set({ pageContext: context }),

  // Input
  inputValue: "",
  setInputValue: (value) => set({ inputValue: value }),

  // Sidebar
  showSidebar: false,
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
}));
