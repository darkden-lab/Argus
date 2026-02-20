import React from 'react';
import { render, screen, waitFor } from '../test-utils';

// Mock xterm and addons before importing component
jest.mock('@xterm/xterm', () => {
  const writeln = jest.fn();
  const write = jest.fn();
  return {
    Terminal: jest.fn().mockImplementation(() => ({
      open: jest.fn(),
      writeln,
      write,
      onData: jest.fn(),
      dispose: jest.fn(),
      loadAddon: jest.fn(),
      cols: 80,
      rows: 24,
      clear: jest.fn(),
      getSelection: jest.fn().mockReturnValue(''),
    })),
  };
});

jest.mock('@xterm/addon-fit', () => ({
  FitAddon: jest.fn().mockImplementation(() => ({
    fit: jest.fn(),
  })),
}));

jest.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: jest.fn().mockImplementation(() => ({})),
}));

// Mock CSS import
jest.mock('@xterm/xterm/css/xterm.css', () => ({}));

// Mock the terminal hook
const mockSendInput = jest.fn();
const mockSendResize = jest.fn();
const mockSendModeChange = jest.fn();
const mockSendContextChange = jest.fn();
const mockConnect = jest.fn();

jest.mock('@/hooks/use-terminal', () => ({
  useTerminal: () => ({
    isConnected: false,
    sendInput: mockSendInput,
    sendResize: mockSendResize,
    sendModeChange: mockSendModeChange,
    sendContextChange: mockSendContextChange,
    connect: mockConnect,
  }),
}));

// Mock the api module
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue([]),
  },
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  cb(0);
  return 0;
});

import { WebTerminal } from '@/components/terminal/web-terminal';

describe('WebTerminal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the terminal component', () => {
    render(<WebTerminal />);

    // Should show mode toggle button (defaults to "Smart")
    expect(screen.getByText('Smart')).toBeInTheDocument();
  });

  it('displays disconnected status when not connected', () => {
    render(<WebTerminal />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders cluster and namespace selectors', () => {
    render(<WebTerminal />);

    expect(screen.getByText('Select cluster')).toBeInTheDocument();
  });

  it('shows mode toggle button', () => {
    render(<WebTerminal />);

    const modeButton = screen.getByText('Smart');
    expect(modeButton).toBeInTheDocument();
  });

  it('fetches clusters on mount', async () => {
    const { api } = require('@/lib/api');
    api.get.mockResolvedValueOnce([
      { id: 'c1', name: 'production' },
      { id: 'c2', name: 'staging' },
    ]);

    render(<WebTerminal />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/clusters');
    });
  });
});

describe('WebTerminal - connected state', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Override the hook mock to return connected state
    jest.spyOn(require('@/hooks/use-terminal'), 'useTerminal').mockReturnValue({
      isConnected: true,
      sendInput: mockSendInput,
      sendResize: mockSendResize,
      sendModeChange: mockSendModeChange,
      sendContextChange: mockSendContextChange,
      connect: mockConnect,
    });
  });

  it('displays connected status', () => {
    render(<WebTerminal />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
