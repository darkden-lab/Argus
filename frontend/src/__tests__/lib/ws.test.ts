import { k8sWs, type WatchEvent } from '@/lib/ws';

// Track all created MockWebSocket instances
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

describe('K8sWebSocket', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    wsInstances = [];
    k8sWs.disconnect();
  });

  afterEach(() => {
    k8sWs.disconnect();
    jest.useRealTimers();
  });

  it('connects with the provided token in URL', () => {
    k8sWs.connect('test-token');
    const ws = getLatestWs();
    expect(ws.url).toContain('token=test-token');
  });

  it('sends subscribe message when connection is open', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();
    k8sWs.subscribe('prod', 'pods', 'default');

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'subscribe',
        cluster: 'prod',
        resource: 'pods',
        namespace: 'default',
      })
    );
  });

  it('sends subscribe without namespace when omitted', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();
    k8sWs.subscribe('prod', 'pods');

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'subscribe',
        cluster: 'prod',
        resource: 'pods',
      })
    );
  });

  it('sends unsubscribe message', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();
    k8sWs.subscribe('prod', 'pods', 'default');
    k8sWs.unsubscribe('prod', 'pods', 'default');

    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        action: 'unsubscribe',
        cluster: 'prod',
        resource: 'pods',
        namespace: 'default',
      })
    );
  });

  it('notifies listeners on incoming messages', () => {
    const callback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.on('prod/pods/default', callback);
    k8sWs.subscribe('prod', 'pods', 'default');

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: 'default',
      type: 'ADDED',
      object: { metadata: { name: 'test-pod' } },
    };

    const ws = getLatestWs();
    ws.simulateMessage(event);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it('notifies wildcard listeners for any message', () => {
    const callback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.on('*', callback);

    const event: WatchEvent = {
      cluster: 'staging',
      resource: 'deployments',
      namespace: 'kube-system',
      type: 'MODIFIED',
      object: { metadata: { name: 'coredns' } },
    };

    const ws = getLatestWs();
    ws.simulateMessage(event);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it('does not notify unrelated listeners', () => {
    const podsCallback = jest.fn();
    const deploymentsCallback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.on('prod/pods/default', podsCallback);
    k8sWs.on('prod/deployments/default', deploymentsCallback);

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: 'default',
      type: 'ADDED',
      object: {},
    };

    getLatestWs().simulateMessage(event);

    expect(podsCallback).toHaveBeenCalledTimes(1);
    expect(deploymentsCallback).not.toHaveBeenCalled();
  });

  it('removes listener on unsubscribe callback', () => {
    const callback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    const unsubscribe = k8sWs.on('prod/pods/default', callback);
    unsubscribe();

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: 'default',
      type: 'ADDED',
      object: {},
    };

    getLatestWs().simulateMessage(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it('disconnects cleanly and stops reconnecting', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.disconnect();

    const ws = getLatestWs();
    expect(ws.close).toHaveBeenCalled();
  });

  it('re-subscribes after reconnection', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.subscribe('prod', 'pods', 'default');

    // Simulate disconnect and reconnect
    k8sWs.disconnect();
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'subscribe',
        cluster: 'prod',
        resource: 'pods',
        namespace: 'default',
      })
    );
  });

  it('queues subscriptions before connection opens', () => {
    k8sWs.subscribe('prod', 'pods', 'default');
    k8sWs.connect('test-token');

    // Before open, send should not be called for the subscribe
    const ws = getLatestWs();
    expect(ws.send).not.toHaveBeenCalled();

    // After open, queued subscriptions should be sent
    jest.runAllTimers();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'subscribe',
        cluster: 'prod',
        resource: 'pods',
        namespace: 'default',
      })
    );
  });

  it('ignores malformed messages without throwing', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();

    expect(() => {
      ws.onmessage?.({ data: 'not valid json' });
    }).not.toThrow();
  });

  it('replaces connection when connect is called again', () => {
    k8sWs.connect('token-1');
    jest.advanceTimersByTime(10);

    const ws1 = getLatestWs();

    k8sWs.connect('token-2');
    jest.advanceTimersByTime(10);

    expect(ws1.close).toHaveBeenCalled();
    const ws2 = getLatestWs();
    expect(ws2.url).toContain('token=token-2');
  });
});
