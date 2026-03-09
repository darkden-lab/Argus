/**
 * Tests for the terminal line-buffering logic in use-terminal-ws.ts.
 *
 * The hook now uses a native WebSocket via getToken from sse-client.
 * We mock WebSocket and getToken to test the core smart-mode line buffer and raw-mode behavior.
 */
import { renderHook, act } from '@testing-library/react';
import { useTerminal, type TerminalMode } from '@/hooks/use-terminal-ws';

// Mock the SSE client module (only getToken is used by the terminal hook)
const mockEmit = jest.fn();
const mockOn = jest.fn();

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send = jest.fn((data: string) => {
    const parsed = JSON.parse(data);
    mockEmit(parsed.type, parsed);
  });
  close = jest.fn();

  constructor() {
    // Store reference so tests can trigger events
    mockWsInstance = this; // eslint-disable-line @typescript-eslint/no-this-alias
  }
}

let mockWsInstance: MockWebSocket | null = null;
const mockWsConstructor = jest.fn(() => new MockWebSocket());

// @ts-expect-error - mock WebSocket globally
global.WebSocket = mockWsConstructor as unknown as typeof WebSocket;

jest.mock('@/lib/sse-client', () => ({
  SSEClient: jest.fn(),
  getToken: jest.fn(() => 'test-token'),
}));

// Provide a token so the hook connects
beforeEach(() => {
  localStorage.setItem('access_token', 'test-token');
  mockEmit.mockReset();
  mockOn.mockReset();
  mockWsConstructor.mockClear();
  mockWsInstance = null;
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

    // WebSocket should have sent input with "ls"
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls.length).toBeGreaterThanOrEqual(1);
    const lastInput = inputCalls[inputCalls.length - 1];
    expect(lastInput[1]).toEqual({ type: 'input', data: 'ls' });
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

    // WebSocket should have sent the character
    const inputCalls = mockEmit.mock.calls.filter(
      ([event]: string[]) => event === 'input'
    );
    expect(inputCalls.length).toBeGreaterThanOrEqual(1);
    expect(inputCalls[inputCalls.length - 1][1]).toEqual({ type: 'input', data: 'h' });
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

describe('WebSocket lifecycle', () => {
  it('creates WebSocket connection on mount', () => {
    renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    expect(mockWsConstructor).toHaveBeenCalled();
    const url = mockWsConstructor.mock.calls[0][0] as string;
    expect(url).toContain('/ws/terminal');
  });

  it('sends set_context on open', () => {
    renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    // Simulate WebSocket open
    act(() => {
      mockWsInstance?.onopen?.();
    });

    expect(mockEmit).toHaveBeenCalledWith('set_context', {
      type: 'set_context',
      cluster_id: 'c1',
      namespace: 'default',
    });
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    unmount();

    expect(mockWsInstance?.close).toHaveBeenCalled();
  });

  it('cluster change reconnects with new WebSocket', () => {
    const { rerender } = renderHook(
      ({ cluster, namespace, mode }: { cluster: string; namespace: string; mode: TerminalMode }) =>
        useTerminal({ cluster, namespace, mode }),
      { initialProps: { cluster: 'c1', namespace: 'default', mode: 'smart' as TerminalMode } }
    );

    const initialCallCount = mockWsConstructor.mock.calls.length;

    // Change cluster — SHOULD reconnect
    rerender({ cluster: 'c2', namespace: 'default', mode: 'smart' as TerminalMode });

    // Should have created a new WebSocket
    expect(mockWsConstructor.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('intentional disconnect does not auto-reconnect', () => {
    const { result } = renderHook(() =>
      useTerminal({
        cluster: 'c1',
        namespace: 'default',
        mode: 'smart' as TerminalMode,
      })
    );

    const callCountBefore = mockWsConstructor.mock.calls.length;

    act(() => {
      result.current.disconnect();
    });

    expect(mockWsInstance?.close).toHaveBeenCalled();

    // No new WebSocket should have been created after disconnect
    expect(mockWsConstructor.mock.calls.length).toBe(callCountBefore);
  });
});
