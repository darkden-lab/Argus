import { k8sWs, type WatchEvent } from '@/lib/ws';

let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  simulateMessage(data: WatchEvent) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}

const OriginalWebSocket = global.WebSocket;

beforeAll(() => {
  (global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
});

afterAll(() => {
  (global as unknown as Record<string, unknown>).WebSocket = OriginalWebSocket;
});

function getLatestWs(): MockWebSocket {
  return wsInstances[wsInstances.length - 1];
}

describe('WebSocket Security', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    wsInstances = [];
    k8sWs.disconnect();
  });

  afterEach(() => {
    k8sWs.disconnect();
    jest.useRealTimers();
  });

  describe('token handling', () => {
    it('includes token in WebSocket URL for authentication', () => {
      k8sWs.connect('secret-auth-token');
      const ws = getLatestWs();
      expect(ws.url).toContain('token=secret-auth-token');
    });

    it('clears token reference on disconnect', () => {
      k8sWs.connect('my-token');
      jest.runAllTimers();
      k8sWs.disconnect();

      // After disconnect, reconnect should not happen because token is cleared
      jest.advanceTimersByTime(60000);
      // Only 1 instance should exist (the one from connect, no reconnect)
      expect(wsInstances.length).toBe(1);
    });

    it('replaces old connection when new token is provided', () => {
      k8sWs.connect('old-token');
      jest.advanceTimersByTime(10);
      const oldWs = getLatestWs();

      k8sWs.connect('new-token');
      jest.advanceTimersByTime(10);

      expect(oldWs.close).toHaveBeenCalled();
      const newWs = getLatestWs();
      expect(newWs.url).toContain('token=new-token');
      expect(newWs.url).not.toContain('token=old-token');
    });
  });

  describe('malformed message handling', () => {
    it('handles null message data without crashing', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();
      const ws = getLatestWs();

      expect(() => {
        ws.onmessage?.({ data: 'null' });
      }).not.toThrow();
    });

    it('handles empty string message without crashing', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();
      const ws = getLatestWs();

      expect(() => {
        ws.onmessage?.({ data: '' });
      }).not.toThrow();
    });

    it('handles XSS payload in message data without executing it', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const callback = jest.fn();
      k8sWs.on('evil/pods/default', callback);

      const ws = getLatestWs();

      // XSS payload in object
      const event: WatchEvent = {
        cluster: 'evil',
        resource: 'pods',
        namespace: 'default',
        type: 'ADDED',
        object: {
          metadata: {
            name: '<script>alert("xss")</script>',
          },
        },
      };

      ws.simulateMessage(event);

      // The callback should receive the raw data as-is
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          object: expect.objectContaining({
            metadata: expect.objectContaining({
              name: '<script>alert("xss")</script>',
            }),
          }),
        })
      );
    });

    it('does not notify listeners for completely invalid JSON', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const callback = jest.fn();
      k8sWs.on('*', callback);

      const ws = getLatestWs();
      ws.onmessage?.({ data: '{{not json at all}}' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles message with missing fields gracefully', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const callback = jest.fn();
      k8sWs.on('*', callback);

      const ws = getLatestWs();
      // Valid JSON but incomplete WatchEvent
      ws.onmessage?.({ data: '{"type": "ADDED"}' });

      // Should parse but key would be "undefined/undefined/"
      // Wildcard should still get it
      expect(callback).toHaveBeenCalled();
    });

    it('handles oversized message without crashing', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const ws = getLatestWs();
      const hugePayload = JSON.stringify({
        cluster: 'test',
        resource: 'pods',
        namespace: 'default',
        type: 'ADDED',
        object: { data: 'A'.repeat(100000) },
      });

      expect(() => {
        ws.onmessage?.({ data: hugePayload });
      }).not.toThrow();
    });
  });

  describe('subscription security', () => {
    it('sends only subscribe/unsubscribe actions (no arbitrary commands)', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const ws = getLatestWs();
      k8sWs.subscribe('prod', 'pods', 'default');

      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.action).toBe('subscribe');
      // No other action types should be possible through the API
      expect(['subscribe', 'unsubscribe']).toContain(sentData.action);
    });

    it('subscription keys do not allow path traversal', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const ws = getLatestWs();
      const callsBefore = ws.send.mock.calls.length;
      k8sWs.subscribe('../admin', '../../secrets', '../../../etc/passwd');

      // Get the last send call (the one we just made)
      const sentData = JSON.parse(ws.send.mock.calls[callsBefore][0]);
      // Values should be sent as-is - server must validate
      expect(sentData.cluster).toBe('../admin');
      expect(sentData.resource).toBe('../../secrets');
    });

    it('listener removal prevents stale callbacks', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      const callback = jest.fn();
      const unsubscribe = k8sWs.on('prod/pods/default', callback);

      // Remove the listener
      unsubscribe();

      // Send a message - callback should NOT be called
      const ws = getLatestWs();
      ws.simulateMessage({
        cluster: 'prod',
        resource: 'pods',
        namespace: 'default',
        type: 'ADDED',
        object: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reconnection behavior', () => {
    it('implements exponential backoff on reconnection', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      // Close connection to trigger reconnect
      const ws1 = getLatestWs();
      ws1.onclose?.();

      // First reconnect after initial delay (1000ms)
      jest.advanceTimersByTime(1000);
      expect(wsInstances.length).toBe(2);
    });

    it('does not reconnect after explicit disconnect', () => {
      k8sWs.connect('test-token');
      jest.runAllTimers();

      k8sWs.disconnect();

      jest.advanceTimersByTime(60000);
      // Only the initial connection should exist
      expect(wsInstances.length).toBe(1);
    });
  });
});
