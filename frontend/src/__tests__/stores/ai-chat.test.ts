import { useAiChatStore, type ChatMessage, type Conversation } from '@/stores/ai-chat';

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
      useAiChatStore.getState().setPageContext({ cluster: 'prod', namespace: 'default' });
      expect(useAiChatStore.getState().pageContext).toEqual({
        cluster: 'prod',
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
});
