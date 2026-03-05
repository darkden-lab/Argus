/**
 * Tests for the terminal line-buffering logic in use-terminal.ts.
 *
 * The hook now uses Socket.IO via getSocket/disconnectSocket.
 * We mock those to test the core smart-mode line buffer and raw-mode behavior.
 */
import { renderHook, act } from '@testing-library/react';
import { useTerminal, type TerminalMode } from '@/hooks/use-terminal';

// Mock socket.io-client via our socket lib
const mockEmit = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

let connectHandler: (() => void) | undefined;

const mockSocket = {
  on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    mockOn(event, handler);
    if (event === 'connect') {
      connectHandler = handler as () => void;
    }
  }),
  off: jest.fn(),
  emit: mockEmit,
  disconnect: jest.fn(),
  connected: false,
};

const mockGetSocket = jest.fn(() => mockSocket);
const mockDisconnectSocket = jest.fn();

jest.mock('@/lib/socket', () => ({
  getSocket: (...args: unknown[]) => mockGetSocket(...args),
  disconnectSocket: (...args: unknown[]) => mockDisconnectSocket(...args),
}));

// Provide a token so the hook connects
beforeEach(() => {
  localStorage.setItem('access_token', 'test-token');
  mockEmit.mockReset();
  mockOn.mockReset();
  mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    mockOn(event, handler);
    if (event === 'connect') {
      connectHandler = handler as () => void;
    }
  });
  mockGetSocket.mockReturnValue(mockSocket);
  mockDisconnectSocket.mockReset();
  connectHandler = undefined;
});

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('handleInput - smart mode', () => {
  function setup() {
    const writes: string[] = [];
    const writeFn = (s: string) => writes.push(s);

    const { result } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    return { result, writes, writeFn };
  }

  it('accumulates printable characters without sending messages', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('h', writeFn, 'smart');
      result.current.handleInput('e', writeFn, 'smart');
      result.current.handleInput('l', writeFn, 'smart');
      result.current.handleInput('l', writeFn, 'smart');
      result.current.handleInput('o', writeFn, 'smart');
    });

    // Characters should be echoed locally
    expect(writes).toEqual(['h', 'e', 'l', 'l', 'o']);

    // No input messages should have been emitted (command not submitted yet)
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls).toHaveLength(0);
  });

  it('sends complete command on Enter', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('l', writeFn, 'smart');
      result.current.handleInput('s', writeFn, 'smart');
    });

    // Simulate Enter
    act(() => {
      result.current.handleInput('\r', writeFn, 'smart');
    });

    // Should have echoed \r\n
    expect(writes).toContain('\r\n');

    // Socket should have emitted input with "ls"
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls.length).toBeGreaterThanOrEqual(1);
    const lastInput = inputCalls[inputCalls.length - 1];
    expect(lastInput[1]).toEqual({ data: 'ls' });
  });

  it('handles backspace by removing last character', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('a', writeFn, 'smart');
      result.current.handleInput('b', writeFn, 'smart');
      result.current.handleInput('\x7f', writeFn, 'smart');
    });

    // After 'a', 'b', backspace: buffer should have 'a'
    expect(writes.length).toBeGreaterThanOrEqual(3);

    // No input messages should be emitted
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls).toHaveLength(0);
  });

  it('handles Ctrl+C by cancelling current line', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('h', writeFn, 'smart');
      result.current.handleInput('i', writeFn, 'smart');
      result.current.handleInput('\x03', writeFn, 'smart');
    });

    // Should write ^C and new prompt
    expect(writes).toContain('^C\r\n$ ');
  });

  it('empty Enter shows new prompt without sending input', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('\r', writeFn, 'smart');
    });

    expect(writes).toContain('\r\n');
    expect(writes).toContain('$ ');

    // No input message emitted
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls).toHaveLength(0);
  });
});

describe('handleInput - raw mode', () => {
  it('sends characters directly without buffering', () => {
    const writes: string[] = [];
    const writeFn = (s: string) => writes.push(s);

    const { result } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'raw' as TerminalMode,
      })
    );

    act(() => {
      result.current.handleInput('h', writeFn, 'raw');
    });

    // In raw mode, nothing should be written locally (terminal handles echo)
    expect(writes).toHaveLength(0);

    // Socket should have emitted the character
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls.length).toBeGreaterThanOrEqual(1);
    expect(inputCalls[inputCalls.length - 1][1]).toEqual({ data: 'h' });
  });
});

describe('handleInput - history navigation', () => {
  it('navigates history with up/down arrows', () => {
    const writes: string[] = [];
    const writeFn = (s: string) => writes.push(s);

    const { result } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    // Submit two commands to build history
    act(() => {
      result.current.handleInput('f', writeFn, 'smart');
      result.current.handleInput('o', writeFn, 'smart');
      result.current.handleInput('o', writeFn, 'smart');
      result.current.handleInput('\r', writeFn, 'smart');
    });

    act(() => {
      result.current.handleInput('b', writeFn, 'smart');
      result.current.handleInput('a', writeFn, 'smart');
      result.current.handleInput('r', writeFn, 'smart');
      result.current.handleInput('\r', writeFn, 'smart');
    });

    // Press Up — should recall "bar"
    writes.length = 0;
    act(() => {
      result.current.handleInput('\x1b[A', writeFn, 'smart');
    });

    const upOutput = writes.join('');
    expect(upOutput).toContain('bar');

    // Press Up again — should recall "foo"
    writes.length = 0;
    act(() => {
      result.current.handleInput('\x1b[A', writeFn, 'smart');
    });

    const upOutput2 = writes.join('');
    expect(upOutput2).toContain('foo');

    // Press Down — should go back to "bar"
    writes.length = 0;
    act(() => {
      result.current.handleInput('\x1b[B', writeFn, 'smart');
    });

    const downOutput = writes.join('');
    expect(downOutput).toContain('bar');
  });
});

describe('Socket.IO lifecycle', () => {
  it('creates socket with /terminal namespace on mount', () => {
    renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    expect(mockGetSocket).toHaveBeenCalledWith('/terminal');
  });

  it('emits set_context on connect', () => {
    renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    // Simulate socket connect
    act(() => {
      connectHandler?.();
    });

    expect(mockEmit).toHaveBeenCalledWith('set_context', {
      cluster_id: 'c1',
      namespace: 'default',
    });
  });

  it('disconnects socket on unmount', () => {
    const { unmount } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    unmount();

    expect(mockDisconnectSocket).toHaveBeenCalledWith('/terminal');
  });

  it('cluster change reconnects with new socket', () => {
    const { rerender } = renderHook(
      ({ cluster, namespace, mode }: { cluster: string; namespace: string; mode: TerminalMode }) =>
        useTerminal({ cluster, namespace, mode }),
      { initialProps: { cluster: 'c1', namespace: 'default', mode: 'smart' as TerminalMode } }
    );

    const initialCallCount = mockGetSocket.mock.calls.length;

    // Change cluster — SHOULD reconnect
    rerender({ cluster: 'c2', namespace: 'default', mode: 'smart' as TerminalMode });

    // Should have disconnected old and created new
    expect(mockDisconnectSocket).toHaveBeenCalledWith('/terminal');
    expect(mockGetSocket.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('intentional disconnect does not auto-reconnect', () => {
    const { result } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    const callCountBefore = mockGetSocket.mock.calls.length;

    act(() => {
      result.current.disconnect();
    });

    expect(mockDisconnectSocket).toHaveBeenCalledWith('/terminal');

    // No new socket should have been created after disconnect
    expect(mockGetSocket.mock.calls.length).toBe(callCountBefore);
  });
});
