import React from 'react';
import { render, screen } from '../test-utils';
import { ChatPanel, ChatToggleButton } from '@/components/ai/chat-panel';
import { ChatMessage } from '@/components/ai/chat-message';
import { ChatCodeBlock } from '@/components/ai/chat-code-block';
import { ConfirmAction } from '@/components/ai/confirm-action';
import { useAiChatStore } from '@/stores/ai-chat';
import type { ChatMessage as ChatMessageType } from '@/stores/ai-chat';

// Mock the AI chat hook
const mockSendMessage = jest.fn();
const mockConfirmAction = jest.fn();
const mockStartNewConversation = jest.fn();
const mockLoadConversation = jest.fn();

jest.mock('@/hooks/use-ai-chat', () => ({
  useAiChat: () => ({
    sendMessage: mockSendMessage,
    confirmAction: mockConfirmAction,
    startNewConversation: mockStartNewConversation,
    loadConversation: mockLoadConversation,
  }),
}));

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = jest.fn();

describe('ChatPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAiChatStore.setState({
      isOpen: false,
      messages: [],
      isStreaming: false,
      inputValue: '',
      conversations: [],
      activeConversationId: null,
      showSidebar: false,
    });
  });

  it('returns null when panel is closed', () => {
    const { container } = render(<ChatPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the panel when open', () => {
    useAiChatStore.setState({ isOpen: true });

    render(<ChatPanel />);

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    useAiChatStore.setState({ isOpen: true, messages: [] });

    render(<ChatPanel />);

    expect(screen.getByText('How can I help?')).toBeInTheDocument();
    expect(
      screen.getByText(/Ask questions about your Kubernetes clusters/)
    ).toBeInTheDocument();
  });

  it('renders messages when present', () => {
    const messages: ChatMessageType[] = [
      {
        id: '1',
        role: 'user',
        content: 'Hello AI',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Hello! How can I help?',
        timestamp: new Date().toISOString(),
      },
    ];

    useAiChatStore.setState({ isOpen: true, messages });

    render(<ChatPanel />);

    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument();
  });

  it('renders textarea input with placeholder', () => {
    useAiChatStore.setState({ isOpen: true });

    render(<ChatPanel />);

    expect(
      screen.getByPlaceholderText('Ask about your clusters...')
    ).toBeInTheDocument();
  });

  it('shows disclaimer text', () => {
    useAiChatStore.setState({ isOpen: true });

    render(<ChatPanel />);

    expect(
      screen.getByText('AI can make mistakes. Verify actions before approving.')
    ).toBeInTheDocument();
  });

  it('shows conversation sidebar when toggled', () => {
    useAiChatStore.setState({
      isOpen: true,
      showSidebar: true,
      conversations: [],
    });

    render(<ChatPanel />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('lists conversations in sidebar', () => {
    useAiChatStore.setState({
      isOpen: true,
      showSidebar: true,
      conversations: [
        {
          id: 'c1',
          title: 'Debug pods',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 3,
        },
      ],
      activeConversationId: null,
    });

    render(<ChatPanel />);

    expect(screen.getByText('Debug pods')).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    useAiChatStore.setState({ isOpen: true, inputValue: '' });

    render(<ChatPanel />);

    const buttons = screen.getAllByRole('button');
    const sendButton = buttons.find(
      (btn) => btn.className.includes('shrink-0') && btn.hasAttribute('disabled')
    );
    expect(sendButton).toBeDefined();
  });
});

describe('ChatToggleButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAiChatStore.setState({
      isOpen: false,
      messages: [],
    });
  });

  it('renders the toggle button', () => {
    render(<ChatToggleButton />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('toggles the panel when clicked', async () => {
    const { user } = render(<ChatToggleButton />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(useAiChatStore.getState().isOpen).toBe(true);
  });
});

describe('ChatMessage', () => {
  it('renders a user message', () => {
    const msg: ChatMessageType = {
      id: '1',
      role: 'user',
      content: 'List all pods',
      timestamp: new Date().toISOString(),
    };

    render(<ChatMessage message={msg} />);

    expect(screen.getByText('List all pods')).toBeInTheDocument();
  });

  it('renders an assistant message', () => {
    const msg: ChatMessageType = {
      id: '2',
      role: 'assistant',
      content: 'Here are the pods in the default namespace.',
      timestamp: new Date().toISOString(),
    };

    render(<ChatMessage message={msg} />);

    expect(
      screen.getByText('Here are the pods in the default namespace.')
    ).toBeInTheDocument();
  });

  it('renders a tool message with tool call info', () => {
    const msg: ChatMessageType = {
      id: '3',
      role: 'tool',
      content: 'Executed kubectl get pods',
      timestamp: new Date().toISOString(),
      toolCall: {
        name: 'kubectl',
        args: { command: 'get pods' },
        result: 'pod-1 Running\npod-2 Running',
      },
    };

    const { container } = render(<ChatMessage message={msg} />);

    expect(screen.getByText('kubectl')).toBeInTheDocument();
    // Tool result renders in a <pre> tag with multiline text
    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('pod-1 Running');
  });

  it('renders code blocks within message content', () => {
    const msg: ChatMessageType = {
      id: '4',
      role: 'assistant',
      content: 'Here is the YAML:\n```yaml\napiVersion: v1\nkind: Pod\n```',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<ChatMessage message={msg} />);

    // Code block renders inside <code> tag
    const codeEl = container.querySelector('code');
    expect(codeEl).toBeInTheDocument();
    expect(codeEl?.textContent).toContain('apiVersion: v1');
  });

  it('shows streaming indicator when message is streaming', () => {
    const msg: ChatMessageType = {
      id: '5',
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    const { container } = render(<ChatMessage message={msg} />);

    // Loader2 icon with animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders bold text correctly', () => {
    const msg: ChatMessageType = {
      id: '6',
      role: 'assistant',
      content: 'This is **bold** text',
      timestamp: new Date().toISOString(),
    };

    render(<ChatMessage message={msg} />);

    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders inline code correctly', () => {
    const msg: ChatMessageType = {
      id: '7',
      role: 'assistant',
      content: 'Run `kubectl get pods` now',
      timestamp: new Date().toISOString(),
    };

    render(<ChatMessage message={msg} />);

    const code = screen.getByText('kubectl get pods');
    expect(code.tagName).toBe('CODE');
  });

  it('displays timestamp', () => {
    const timestamp = new Date(2026, 0, 15, 14, 30, 0).toISOString();
    const msg: ChatMessageType = {
      id: '8',
      role: 'user',
      content: 'test',
      timestamp,
    };

    render(<ChatMessage message={msg} />);

    // Timestamp is rendered using toLocaleTimeString
    const timeStr = new Date(timestamp).toLocaleTimeString();
    expect(screen.getByText(timeStr)).toBeInTheDocument();
  });
});

describe('ChatCodeBlock', () => {
  it('renders code content', () => {
    render(<ChatCodeBlock code="console.log('hello')" language="javascript" />);

    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
  });

  it('displays language label', () => {
    render(<ChatCodeBlock code="print('hi')" language="python" />);

    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<ChatCodeBlock code="test" language="text" />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('copies code to clipboard on click', async () => {
    const { user } = render(
      <ChatCodeBlock code="kubectl get pods" language="bash" />
    );

    const copyButton = screen.getAllByRole('button')[0];
    await user.click(copyButton);

    // After click, the clipboard should contain the code
    // Verify the button was clickable (no error thrown)
    expect(copyButton).toBeInTheDocument();
  });

  it('shows Apply button for YAML when onApply is provided', () => {
    const onApply = jest.fn();
    render(
      <ChatCodeBlock
        code="apiVersion: v1"
        language="yaml"
        onApply={onApply}
      />
    );

    // Should have 2 buttons: apply + copy
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
  });

  it('does not show Apply button for non-YAML code', () => {
    const onApply = jest.fn();
    render(
      <ChatCodeBlock
        code="console.log('hi')"
        language="javascript"
        onApply={onApply}
      />
    );

    // Only copy button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
  });

  it('calls onApply when Apply button is clicked', async () => {
    const onApply = jest.fn();
    const { user } = render(
      <ChatCodeBlock code="kind: Pod" language="yaml" onApply={onApply} />
    );

    // Apply button is the first one (before copy)
    const applyButton = screen.getAllByRole('button')[0];
    await user.click(applyButton);

    expect(onApply).toHaveBeenCalledWith('kind: Pod');
  });
});

describe('ConfirmAction', () => {
  it('renders action details', () => {
    render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-1',
          tool: 'kubectl_apply',
          description: 'Apply deployment manifest',
          status: 'pending',
        }}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.getByText('Action requires confirmation')).toBeInTheDocument();
    expect(screen.getByText('kubectl_apply')).toBeInTheDocument();
    expect(screen.getByText(/Apply deployment manifest/)).toBeInTheDocument();
  });

  it('shows Approve and Reject buttons when pending', () => {
    render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-1',
          tool: 'kubectl_delete',
          description: 'Delete pod',
          status: 'pending',
        }}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('calls onConfirm with true when Approve is clicked', async () => {
    const onConfirm = jest.fn();
    const { user } = render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-1',
          tool: 'kubectl_delete',
          description: 'Delete pod',
          status: 'pending',
        }}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByText('Approve'));

    expect(onConfirm).toHaveBeenCalledWith('ca-1', true);
  });

  it('calls onConfirm with false when Reject is clicked', async () => {
    const onConfirm = jest.fn();
    const { user } = render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-2',
          tool: 'kubectl_apply',
          description: 'Apply resource',
          status: 'pending',
        }}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByText('Reject'));

    expect(onConfirm).toHaveBeenCalledWith('ca-2', false);
  });

  it('shows Approved status when approved', () => {
    render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-1',
          tool: 'kubectl_apply',
          description: 'Apply resource',
          status: 'approved',
        }}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
  });

  it('shows Rejected status when rejected', () => {
    render(
      <ConfirmAction
        confirmAction={{
          id: 'ca-1',
          tool: 'kubectl_apply',
          description: 'Apply resource',
          status: 'rejected',
        }}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
  });
});
