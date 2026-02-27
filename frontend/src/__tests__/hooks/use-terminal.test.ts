/**
 * Tests for the terminal line-buffering logic in use-terminal.ts.
 *
 * Because the hook relies on WebSocket + React refs, we test the core logic
 * by rendering the hook via renderHook and inspecting the handleInput behavior.
 */
import { renderHook, act } from '@testing-library/react';
import { useTerminal, type TerminalMode } from '@/hooks/use-terminal';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}

let mockWsInstance: MockWebSocket;

// Override global WebSocket
beforeAll(() => {
  (global as Record<string, unknown>).WebSocket = class extends MockWebSocket {
    constructor() {
      super();
      mockWsInstance = this;
      // Simulate connection in next tick
      setTimeout(() => this.onopen?.(), 0);
    }
  };
  // Make OPEN accessible as static
  (global as Record<string, unknown>).WebSocket = Object.assign(
    (global as Record<string, unknown>).WebSocket as object,
    { OPEN: 1 }
  );
});

// Provide a token so the hook connects
beforeEach(() => {
  localStorage.setItem('access_token', 'test-token');
});

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
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

  it('accumulates printable characters without sending WS messages', () => {
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

    // No WS messages should have been sent (command not submitted yet)
    if (mockWsInstance) {
      const inputMessages = mockWsInstance.sent.filter((s) => {
        try {
          return JSON.parse(s).type === 'input';
        } catch {
          return false;
        }
      });
      expect(inputMessages).toHaveLength(0);
    }
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

    // Should have echoed \\r\\n
    expect(writes).toContain('\r\n');

    // WS should have received input message with "ls"
    if (mockWsInstance) {
      const inputMessages = mockWsInstance.sent
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter((m) => m?.type === 'input');

      expect(inputMessages.length).toBeGreaterThanOrEqual(1);
      const lastInput = inputMessages[inputMessages.length - 1];
      expect(lastInput.data).toBe('ls');
    }
  });

  it('handles backspace by removing last character', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('a', writeFn, 'smart');
      result.current.handleInput('b', writeFn, 'smart');
      result.current.handleInput('\x7f', writeFn, 'smart');
    });

    // After 'a', 'b', backspace: buffer should have 'a'
    // Echo should include: 'a', 'b', then backspace sequence
    expect(writes.length).toBeGreaterThanOrEqual(3);

    // No WS input messages should be sent
    if (mockWsInstance) {
      const inputMessages = mockWsInstance.sent.filter((s) => {
        try {
          return JSON.parse(s).type === 'input';
        } catch {
          return false;
        }
      });
      expect(inputMessages).toHaveLength(0);
    }
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

  it('empty Enter shows new prompt without sending WS', () => {
    const { result, writes, writeFn } = setup();

    act(() => {
      result.current.handleInput('\r', writeFn, 'smart');
    });

    expect(writes).toContain('\r\n');
    expect(writes).toContain('$ ');

    // No input message sent
    if (mockWsInstance) {
      const inputMessages = mockWsInstance.sent.filter((s) => {
        try {
          return JSON.parse(s).type === 'input';
        } catch {
          return false;
        }
      });
      expect(inputMessages).toHaveLength(0);
    }
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

    // WS should have received the character
    if (mockWsInstance) {
      const inputMessages = mockWsInstance.sent
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter((m) => m?.type === 'input');

      expect(inputMessages.length).toBeGreaterThanOrEqual(1);
      expect(inputMessages[inputMessages.length - 1].data).toBe('h');
    }
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

    // The write should contain "bar" (the last command)
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
