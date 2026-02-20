const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export interface WatchEvent {
  cluster: string;
  resource: string;
  namespace: string;
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: unknown;
}

interface SubscribeMessage {
  action: 'subscribe' | 'unsubscribe';
  cluster: string;
  resource: string;
  namespace?: string;
}

type EventCallback = (event: WatchEvent) => void;

class K8sWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: Set<string> = new Set();
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private token: string | null = null;

  connect(token: string): void {
    this.token = token;
    this.reconnectDelay = 1000;

    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(`${WS_URL}/ws?token=${token}`);

    this.ws.onopen = () => {
      // Re-subscribe to all active subscriptions
      for (const sub of this.subscriptions) {
        const [cluster, resource, namespace] = sub.split('/');
        this.sendSubscribe(cluster, resource, namespace);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data: WatchEvent = JSON.parse(event.data);
        const key = `${data.cluster}/${data.resource}/${data.namespace || ''}`;

        const callbacks = this.listeners.get(key);
        if (callbacks) {
          for (const cb of callbacks) {
            cb(data);
          }
        }

        // Also notify wildcard listeners
        const wildcardCallbacks = this.listeners.get('*');
        if (wildcardCallbacks) {
          for (const cb of wildcardCallbacks) {
            cb(data);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.reconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.token = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(cluster: string, resource: string, namespace?: string): void {
    const key = `${cluster}/${resource}/${namespace || ''}`;
    this.subscriptions.add(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(cluster, resource, namespace);
    }
  }

  unsubscribe(cluster: string, resource: string, namespace?: string): void {
    const key = `${cluster}/${resource}/${namespace || ''}`;
    this.subscriptions.delete(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: SubscribeMessage = {
        action: 'unsubscribe',
        cluster,
        resource,
        ...(namespace ? { namespace } : {}),
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(eventKey: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventKey)) {
      this.listeners.set(eventKey, new Set());
    }
    this.listeners.get(eventKey)!.add(callback);

    return () => {
      this.listeners.get(eventKey)?.delete(callback);
    };
  }

  private sendSubscribe(cluster: string, resource: string, namespace?: string): void {
    const msg: SubscribeMessage = {
      action: 'subscribe',
      cluster,
      resource,
      ...(namespace ? { namespace } : {}),
    };
    this.ws?.send(JSON.stringify(msg));
  }

  private reconnect(): void {
    if (!this.token) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      if (this.token) {
        this.connect(this.token);
      }
    }, this.reconnectDelay);
  }
}

export const k8sWs = new K8sWebSocket();
