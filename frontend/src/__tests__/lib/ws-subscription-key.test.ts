/**
 * WS Subscription Key Order Tests
 *
 * The subscription key in k8sWs uses the order cluster/resource/namespace
 * matching the backend hub.go subscriptionKey(clusterID, resource, namespace).
 *
 * These tests verify:
 * 1. subscribe() stores keys in cluster/resource/namespace order
 * 2. incoming messages are keyed in cluster/resource/namespace order
 * 3. listeners registered with cluster/resource/namespace receive messages
 * 4. on reconnect, stored keys are correctly split and re-subscribed
 */

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
    // Simulate async open
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
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

describe('WS subscription key order', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    wsInstances = [];
    k8sWs.disconnect();
  });

  afterEach(() => {
    k8sWs.disconnect();
    jest.useRealTimers();
  });

  it('should route incoming messages to listener registered as cluster/resource/namespace', () => {
    // Canonical key format: cluster/resource/namespace (matches backend hub.go)
    const callback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    // Register listener with key cluster/resource/namespace
    k8sWs.on('prod/pods/default', callback);
    k8sWs.subscribe('prod', 'pods', 'default');

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: 'default',
      type: 'ADDED',
      object: { metadata: { name: 'my-pod' } },
    };

    getLatestWs().onmessage?.({ data: JSON.stringify(event) });

    // The listener MUST be called: key from message == cluster/resource/namespace
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(event);
  });

  it('should NOT route messages if listener key order is cluster/namespace/resource (wrong order)', () => {
    // If a listener was registered with the WRONG order cluster/namespace/resource
    // it should NOT receive messages (message key is cluster/resource/namespace).
    const wrongCallback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    // Register with WRONG order (namespace before resource)
    k8sWs.on('prod/default/pods', wrongCallback);

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: 'default',
      type: 'ADDED',
      object: {},
    };

    getLatestWs().onmessage?.({ data: JSON.stringify(event) });

    // Message key is 'prod/pods/default' (cluster/resource/namespace)
    // listener key is 'prod/default/pods' (cluster/namespace/resource) — MISMATCH
    expect(wrongCallback).not.toHaveBeenCalled();
  });

  it('should store subscription with cluster/resource/namespace order and re-subscribe correctly on reconnect', () => {
    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.subscribe('staging', 'deployments', 'kube-system');

    // Disconnect and reconnect
    k8sWs.disconnect();
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();

    // On reconnect, the stored key 'staging/deployments/kube-system' is split:
    // [cluster='staging', resource='deployments', namespace='kube-system']
    // sendSubscribe(cluster, resource, namespace) is called correctly.
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'subscribe',
        cluster: 'staging',
        resource: 'deployments',
        namespace: 'kube-system',
      })
    );
  });

  it('should handle subscription without namespace using empty string in key', () => {
    const callback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    // Subscribe without namespace — key becomes 'prod/pods/'
    k8sWs.on('prod/pods/', callback);
    k8sWs.subscribe('prod', 'pods');

    const event: WatchEvent = {
      cluster: 'prod',
      resource: 'pods',
      namespace: '',
      type: 'DELETED',
      object: {},
    };

    getLatestWs().onmessage?.({ data: JSON.stringify(event) });

    // Message key: 'prod/pods/' (namespace is '' so || '' gives '')
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should send subscribe message with correct wire format cluster/resource/namespace', () => {
    // The WIRE format (what is sent to the server) is:
    // { action: 'subscribe', cluster, resource, namespace }
    // The STORAGE key is: cluster/resource/namespace
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();
    k8sWs.subscribe('prod', 'pods', 'default');

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentMessage.action).toBe('subscribe');
    expect(sentMessage.cluster).toBe('prod');
    expect(sentMessage.resource).toBe('pods');
    expect(sentMessage.namespace).toBe('default');
  });

  it('should deliver messages with different namespaces only to matching listeners', () => {
    const devCallback = jest.fn();
    const prodCallback = jest.fn();

    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.on('cluster-1/pods/dev', devCallback);
    k8sWs.on('cluster-1/pods/prod', prodCallback);

    const devEvent: WatchEvent = {
      cluster: 'cluster-1',
      resource: 'pods',
      namespace: 'dev',
      type: 'ADDED',
      object: {},
    };

    getLatestWs().onmessage?.({ data: JSON.stringify(devEvent) });

    // Only dev listener should fire (key = 'cluster-1/pods/dev')
    expect(devCallback).toHaveBeenCalledTimes(1);
    expect(prodCallback).not.toHaveBeenCalled();
  });

  it('should correctly split stored key on reconnect for subscriptions without namespace', () => {
    // Start fresh: connect and subscribe only to 'nodes' (no namespace)
    k8sWs.connect('test-token');
    jest.runAllTimers();

    k8sWs.subscribe('prod', 'nodes');

    // Capture the send calls count before reconnect to isolate our subscribe
    k8sWs.disconnect();
    k8sWs.connect('test-token');
    jest.runAllTimers();

    const ws = getLatestWs();

    // Find the subscribe message for 'nodes' among all send calls.
    // (k8sWs is a singleton so previous test subscriptions may also be re-sent)
    const nodesSendCall = ws.send.mock.calls.find((call) => {
      const msg = JSON.parse(call[0]);
      return msg.resource === 'nodes';
    });

    if (!nodesSendCall) {
      throw new Error('Expected a subscribe message for "nodes" but found none');
    }

    // Stored key is 'prod/nodes/', split gives ['prod', 'nodes', '']
    // sendSubscribe('prod', 'nodes', '') — namespace is '' so it should not be sent
    const sentMessage = JSON.parse(nodesSendCall[0]);
    expect(sentMessage.cluster).toBe('prod');
    expect(sentMessage.resource).toBe('nodes');
    expect(sentMessage.namespace).toBeUndefined(); // empty namespace omitted
  });
});
