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
    args?: Record<string, unknown>;
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
  cluster_id?: string;
  namespace?: string;
  resource?: string;
  name?: string;
}

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  provider: string;
  model: string;
  message: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  system_prompt?: string;
  allowed_tools?: string[];
  tool_permission_level?: string;
  workflow_steps?: Array<{ step: number; name: string; description: string }>;
  workflow_mode?: string;
  is_builtin: boolean;
  owner_user_id?: string;
  is_public: boolean;
}

export interface AgentTask {
  id: string;
  agent_id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  current_step: string;
  total_steps: number;
  completed_steps: number;
  result?: string;
  error?: string;
}

interface AiChatState {
  // Panel state
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // Unread tracking
  lastReadMessageIndex: number;
  markAsRead: () => void;

  // AI status
  aiStatus: AiStatus | null;
  setAiStatus: (status: AiStatus | null) => void;

  // Connection state
  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;
  connectionError: string | null;
  setConnectionError: (error: string | null) => void;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;

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

  // Full page mode
  isFullPage: boolean;
  setIsFullPage: (v: boolean) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  activeAgentId: string | null;
  setActiveAgent: (id: string | null) => void;

  // Tasks
  tasks: AgentTask[];
  setTasks: (tasks: AgentTask[]) => void;
  updateTask: (id: string, updates: Partial<AgentTask>) => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  // Panel state
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  // Unread tracking
  lastReadMessageIndex: -1,
  markAsRead: () => set((s) => ({ lastReadMessageIndex: s.messages.length - 1 })),

  // AI status
  aiStatus: null,
  setAiStatus: (status) => set({ aiStatus: status }),

  // Connection state
  connectionState: "disconnected",
  setConnectionState: (state) => set({ connectionState: state }),
  connectionError: null,
  setConnectionError: (error) => set({ connectionError: error }),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) =>
    set({ activeConversationId: id, messages: [], lastReadMessageIndex: -1 }),
  addConversation: (conversation) =>
    set((s) => ({ conversations: [conversation, ...s.conversations] })),
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(s.activeConversationId === id
        ? { activeConversationId: null, messages: [], lastReadMessageIndex: -1 }
        : {}),
    })),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages, lastReadMessageIndex: messages.length > 0 ? messages.length - 1 : -1 }),
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

  // Full page mode
  isFullPage: false,
  setIsFullPage: (v) => set({ isFullPage: v }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  activeAgentId: null,
  setActiveAgent: (id) => set({ activeAgentId: id }),

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),
}));
