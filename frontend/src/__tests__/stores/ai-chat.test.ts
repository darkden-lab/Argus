import { useAiChatStore, type ChatMessage, type Conversation, type AgentTask } from '@/stores/ai-chat';

const mockMessage: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello',
  timestamp: '2026-01-01T00:00:00Z',
};

const mockAssistantMessage: ChatMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: 'Hi there',
  timestamp: '2026-01-01T00:00:01Z',
};

const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test conversation',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  messageCount: 0,
};

describe('useAiChatStore', () => {
  beforeEach(() => {
    useAiChatStore.setState({
      isOpen: false,
      conversations: [],
      activeConversationId: null,
      messages: [],
      isStreaming: false,
      pageContext: {},
      inputValue: '',
      showSidebar: false,
      lastReadMessageIndex: -1,
      aiStatus: null,
      connectionState: 'disconnected',
      connectionError: null,
      isFullPage: false,
      agents: [],
      activeAgentId: null,
      tasks: [],
      isHistoryLoading: false,
      pendingConfirmationId: null,
      streamFinishReason: null,
      configChangedWhileOpen: false,
      connectionRetryCount: 0,
      configVersion: 0,
    });
  });

  describe('panel state', () => {
    it('starts closed', () => {
      expect(useAiChatStore.getState().isOpen).toBe(false);
    });

    it('open() sets isOpen to true', () => {
      useAiChatStore.getState().open();
      expect(useAiChatStore.getState().isOpen).toBe(true);
    });

    it('close() sets isOpen to false', () => {
      useAiChatStore.setState({ isOpen: true });
      useAiChatStore.getState().close();
      expect(useAiChatStore.getState().isOpen).toBe(false);
    });

    it('toggle() flips isOpen', () => {
      expect(useAiChatStore.getState().isOpen).toBe(false);
      useAiChatStore.getState().toggle();
      expect(useAiChatStore.getState().isOpen).toBe(true);
      useAiChatStore.getState().toggle();
      expect(useAiChatStore.getState().isOpen).toBe(false);
    });
  });

  describe('conversations', () => {
    it('setConversations replaces conversations list', () => {
      useAiChatStore.getState().setConversations([mockConversation]);
      expect(useAiChatStore.getState().conversations).toEqual([mockConversation]);
    });

    it('addConversation prepends to list', () => {
      const existing: Conversation = { ...mockConversation, id: 'conv-0', title: 'Older' };
      useAiChatStore.setState({ conversations: [existing] });

      useAiChatStore.getState().addConversation(mockConversation);

      const convs = useAiChatStore.getState().conversations;
      expect(convs).toHaveLength(2);
      expect(convs[0].id).toBe('conv-1');
      expect(convs[1].id).toBe('conv-0');
    });

    it('setActiveConversation sets id and clears messages', () => {
      useAiChatStore.setState({ messages: [mockMessage] });
      useAiChatStore.getState().setActiveConversation('conv-1');

      expect(useAiChatStore.getState().activeConversationId).toBe('conv-1');
      expect(useAiChatStore.getState().messages).toEqual([]);
    });

    it('setActiveConversation with null clears conversation', () => {
      useAiChatStore.setState({ activeConversationId: 'conv-1' });
      useAiChatStore.getState().setActiveConversation(null);
      expect(useAiChatStore.getState().activeConversationId).toBeNull();
    });
  });

  describe('messages', () => {
    it('addMessage appends to messages list', () => {
      useAiChatStore.getState().addMessage(mockMessage);
      expect(useAiChatStore.getState().messages).toEqual([mockMessage]);

      useAiChatStore.getState().addMessage(mockAssistantMessage);
      expect(useAiChatStore.getState().messages).toHaveLength(2);
    });

    it('setMessages replaces all messages', () => {
      useAiChatStore.setState({ messages: [mockMessage] });
      useAiChatStore.getState().setMessages([mockAssistantMessage]);
      expect(useAiChatStore.getState().messages).toEqual([mockAssistantMessage]);
    });

    it('updateMessage updates specific message by id', () => {
      useAiChatStore.setState({ messages: [mockMessage, mockAssistantMessage] });
      useAiChatStore.getState().updateMessage('msg-2', { content: 'Updated content' });

      const msgs = useAiChatStore.getState().messages;
      expect(msgs[0].content).toBe('Hello');
      expect(msgs[1].content).toBe('Updated content');
    });

    it('updateMessage does not affect other messages', () => {
      useAiChatStore.setState({ messages: [mockMessage, mockAssistantMessage] });
      useAiChatStore.getState().updateMessage('msg-nonexistent', { content: 'nothing' });

      const msgs = useAiChatStore.getState().messages;
      expect(msgs[0].content).toBe('Hello');
      expect(msgs[1].content).toBe('Hi there');
    });

    it('appendToMessage appends text to specific message', () => {
      useAiChatStore.setState({ messages: [mockAssistantMessage] });
      useAiChatStore.getState().appendToMessage('msg-2', ' How are you?');

      expect(useAiChatStore.getState().messages[0].content).toBe('Hi there How are you?');
    });
  });

  describe('streaming', () => {
    it('setIsStreaming updates streaming state', () => {
      expect(useAiChatStore.getState().isStreaming).toBe(false);
      useAiChatStore.getState().setIsStreaming(true);
      expect(useAiChatStore.getState().isStreaming).toBe(true);
      useAiChatStore.getState().setIsStreaming(false);
      expect(useAiChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('page context', () => {
    it('setPageContext updates context', () => {
      useAiChatStore.getState().setPageContext({ cluster_id: 'prod', namespace: 'default' });
      expect(useAiChatStore.getState().pageContext).toEqual({
        cluster_id: 'prod',
        namespace: 'default',
      });
    });
  });

  describe('input', () => {
    it('setInputValue updates input', () => {
      useAiChatStore.getState().setInputValue('kubectl get pods');
      expect(useAiChatStore.getState().inputValue).toBe('kubectl get pods');
    });
  });

  describe('sidebar', () => {
    it('toggleSidebar flips showSidebar', () => {
      expect(useAiChatStore.getState().showSidebar).toBe(false);
      useAiChatStore.getState().toggleSidebar();
      expect(useAiChatStore.getState().showSidebar).toBe(true);
      useAiChatStore.getState().toggleSidebar();
      expect(useAiChatStore.getState().showSidebar).toBe(false);
    });
  });

  describe('history loading', () => {
    it('isHistoryLoading defaults to false', () => {
      expect(useAiChatStore.getState().isHistoryLoading).toBe(false);
    });

    it('setIsHistoryLoading toggles the flag', () => {
      useAiChatStore.getState().setIsHistoryLoading(true);
      expect(useAiChatStore.getState().isHistoryLoading).toBe(true);
      useAiChatStore.getState().setIsHistoryLoading(false);
      expect(useAiChatStore.getState().isHistoryLoading).toBe(false);
    });
  });

  describe('pending confirmation', () => {
    it('pendingConfirmationId defaults to null', () => {
      expect(useAiChatStore.getState().pendingConfirmationId).toBeNull();
    });

    it('setPendingConfirmationId sets and clears the id', () => {
      useAiChatStore.getState().setPendingConfirmationId('conf-123');
      expect(useAiChatStore.getState().pendingConfirmationId).toBe('conf-123');
      useAiChatStore.getState().setPendingConfirmationId(null);
      expect(useAiChatStore.getState().pendingConfirmationId).toBeNull();
    });
  });

  describe('stream finish reason', () => {
    it('streamFinishReason defaults to null', () => {
      expect(useAiChatStore.getState().streamFinishReason).toBeNull();
    });

    it('setStreamFinishReason sets the reason', () => {
      useAiChatStore.getState().setStreamFinishReason('stop');
      expect(useAiChatStore.getState().streamFinishReason).toBe('stop');
    });

    it('setStreamFinishReason can be cleared', () => {
      useAiChatStore.getState().setStreamFinishReason('error');
      useAiChatStore.getState().setStreamFinishReason(null);
      expect(useAiChatStore.getState().streamFinishReason).toBeNull();
    });
  });

  describe('config changed while open', () => {
    it('configChangedWhileOpen defaults to false', () => {
      expect(useAiChatStore.getState().configChangedWhileOpen).toBe(false);
    });

    it('setConfigChangedWhileOpen sets the flag', () => {
      useAiChatStore.getState().setConfigChangedWhileOpen(true);
      expect(useAiChatStore.getState().configChangedWhileOpen).toBe(true);
      useAiChatStore.getState().setConfigChangedWhileOpen(false);
      expect(useAiChatStore.getState().configChangedWhileOpen).toBe(false);
    });
  });

  describe('connection retry count', () => {
    it('connectionRetryCount defaults to 0', () => {
      expect(useAiChatStore.getState().connectionRetryCount).toBe(0);
    });

    it('incrementConnectionRetryCount increments by 1', () => {
      useAiChatStore.getState().incrementConnectionRetryCount();
      expect(useAiChatStore.getState().connectionRetryCount).toBe(1);
      useAiChatStore.getState().incrementConnectionRetryCount();
      expect(useAiChatStore.getState().connectionRetryCount).toBe(2);
      useAiChatStore.getState().incrementConnectionRetryCount();
      expect(useAiChatStore.getState().connectionRetryCount).toBe(3);
    });

    it('setConnectionRetryCount sets to arbitrary value', () => {
      useAiChatStore.getState().setConnectionRetryCount(5);
      expect(useAiChatStore.getState().connectionRetryCount).toBe(5);
    });

    it('setConnectionRetryCount can reset to zero', () => {
      useAiChatStore.getState().incrementConnectionRetryCount();
      useAiChatStore.getState().incrementConnectionRetryCount();
      useAiChatStore.getState().setConnectionRetryCount(0);
      expect(useAiChatStore.getState().connectionRetryCount).toBe(0);
    });
  });

  describe('config version', () => {
    it('configVersion defaults to 0', () => {
      expect(useAiChatStore.getState().configVersion).toBe(0);
    });

    it('incrementConfigVersion increments by 1', () => {
      useAiChatStore.getState().incrementConfigVersion();
      expect(useAiChatStore.getState().configVersion).toBe(1);
      useAiChatStore.getState().incrementConfigVersion();
      expect(useAiChatStore.getState().configVersion).toBe(2);
    });
  });

  describe('connection state', () => {
    it('connectionState defaults to disconnected', () => {
      expect(useAiChatStore.getState().connectionState).toBe('disconnected');
    });

    it('setConnectionState updates the state', () => {
      useAiChatStore.getState().setConnectionState('connecting');
      expect(useAiChatStore.getState().connectionState).toBe('connecting');
      useAiChatStore.getState().setConnectionState('connected');
      expect(useAiChatStore.getState().connectionState).toBe('connected');
      useAiChatStore.getState().setConnectionState('error');
      expect(useAiChatStore.getState().connectionState).toBe('error');
    });

    it('connectionError defaults to null', () => {
      expect(useAiChatStore.getState().connectionError).toBeNull();
    });

    it('setConnectionError sets and clears error', () => {
      useAiChatStore.getState().setConnectionError('Connection lost');
      expect(useAiChatStore.getState().connectionError).toBe('Connection lost');
      useAiChatStore.getState().setConnectionError(null);
      expect(useAiChatStore.getState().connectionError).toBeNull();
    });
  });

  describe('full page mode', () => {
    it('isFullPage defaults to false', () => {
      expect(useAiChatStore.getState().isFullPage).toBe(false);
    });

    it('setIsFullPage toggles the flag', () => {
      useAiChatStore.getState().setIsFullPage(true);
      expect(useAiChatStore.getState().isFullPage).toBe(true);
      useAiChatStore.getState().setIsFullPage(false);
      expect(useAiChatStore.getState().isFullPage).toBe(false);
    });
  });

  describe('agents', () => {
    it('agents defaults to empty array', () => {
      expect(useAiChatStore.getState().agents).toEqual([]);
    });

    it('setAgents replaces agents list', () => {
      const agents = [
        { id: 'a1', slug: 'k8s', name: 'K8s Agent', description: 'Kubernetes', icon: 'k8s', category: 'ops', is_builtin: true, is_public: true },
      ];
      useAiChatStore.getState().setAgents(agents);
      expect(useAiChatStore.getState().agents).toEqual(agents);
    });

    it('activeAgentId defaults to null', () => {
      expect(useAiChatStore.getState().activeAgentId).toBeNull();
    });

    it('setActiveAgent sets the active agent id', () => {
      useAiChatStore.getState().setActiveAgent('a1');
      expect(useAiChatStore.getState().activeAgentId).toBe('a1');
      useAiChatStore.getState().setActiveAgent(null);
      expect(useAiChatStore.getState().activeAgentId).toBeNull();
    });
  });

  describe('tasks', () => {
    const mockTask: AgentTask = {
      id: 'task-1',
      agent_id: 'a1',
      title: 'Diagnose pod',
      status: 'running',
      progress: 50,
      current_step: 'Checking logs',
      total_steps: 4,
      completed_steps: 2,
    };

    it('tasks defaults to empty array', () => {
      expect(useAiChatStore.getState().tasks).toEqual([]);
    });

    it('setTasks replaces tasks list', () => {
      useAiChatStore.getState().setTasks([mockTask]);
      expect(useAiChatStore.getState().tasks).toEqual([mockTask]);
    });

    it('updateTask updates specific task by id', () => {
      useAiChatStore.getState().setTasks([mockTask]);
      useAiChatStore.getState().updateTask('task-1', { status: 'completed', progress: 100 });

      const tasks = useAiChatStore.getState().tasks;
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].progress).toBe(100);
      expect(tasks[0].title).toBe('Diagnose pod');
    });

    it('updateTask does not affect non-matching tasks', () => {
      useAiChatStore.getState().setTasks([mockTask]);
      useAiChatStore.getState().updateTask('nonexistent', { status: 'failed' });

      expect(useAiChatStore.getState().tasks[0].status).toBe('running');
    });
  });

  describe('removeConversation', () => {
    it('removes conversation from list', () => {
      const conv2: Conversation = { ...mockConversation, id: 'conv-2', title: 'Second' };
      useAiChatStore.setState({ conversations: [mockConversation, conv2] });
      useAiChatStore.getState().removeConversation('conv-1');
      expect(useAiChatStore.getState().conversations).toHaveLength(1);
      expect(useAiChatStore.getState().conversations[0].id).toBe('conv-2');
    });

    it('clears active conversation if removed', () => {
      useAiChatStore.setState({
        conversations: [mockConversation],
        activeConversationId: 'conv-1',
        messages: [mockMessage],
      });
      useAiChatStore.getState().removeConversation('conv-1');
      expect(useAiChatStore.getState().activeConversationId).toBeNull();
      expect(useAiChatStore.getState().messages).toEqual([]);
    });

    it('does not clear active conversation if different one is removed', () => {
      const conv2: Conversation = { ...mockConversation, id: 'conv-2', title: 'Second' };
      useAiChatStore.setState({
        conversations: [mockConversation, conv2],
        activeConversationId: 'conv-1',
        messages: [mockMessage],
      });
      useAiChatStore.getState().removeConversation('conv-2');
      expect(useAiChatStore.getState().activeConversationId).toBe('conv-1');
      expect(useAiChatStore.getState().messages).toEqual([mockMessage]);
    });
  });

  describe('AI status', () => {
    it('aiStatus defaults to null', () => {
      expect(useAiChatStore.getState().aiStatus).toBeNull();
    });

    it('setAiStatus sets and clears status', () => {
      const status = { enabled: true, configured: true, provider: 'openai', model: 'gpt-4', message: 'OK' };
      useAiChatStore.getState().setAiStatus(status);
      expect(useAiChatStore.getState().aiStatus).toEqual(status);
      useAiChatStore.getState().setAiStatus(null);
      expect(useAiChatStore.getState().aiStatus).toBeNull();
    });
  });

  describe('unread tracking', () => {
    it('markAsRead sets lastReadMessageIndex to last message index', () => {
      useAiChatStore.setState({ messages: [mockMessage, mockAssistantMessage] });
      useAiChatStore.getState().markAsRead();
      expect(useAiChatStore.getState().lastReadMessageIndex).toBe(1);
    });

    it('markAsRead with no messages sets index to -1', () => {
      useAiChatStore.setState({ messages: [] });
      useAiChatStore.getState().markAsRead();
      expect(useAiChatStore.getState().lastReadMessageIndex).toBe(-1);
    });
  });

  describe('setMessages updates lastReadMessageIndex', () => {
    it('sets lastReadMessageIndex to last index when messages are provided', () => {
      useAiChatStore.getState().setMessages([mockMessage, mockAssistantMessage]);
      expect(useAiChatStore.getState().lastReadMessageIndex).toBe(1);
    });

    it('sets lastReadMessageIndex to -1 when empty array is provided', () => {
      useAiChatStore.getState().setMessages([]);
      expect(useAiChatStore.getState().lastReadMessageIndex).toBe(-1);
    });
  });
});
