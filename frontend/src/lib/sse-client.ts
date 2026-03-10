/**
 * SSE client using fetch + ReadableStream.
 * Supports custom headers (unlike EventSource), auto-reconnect with
 * exponential backoff, and keepalive detection.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface SSEClientOptions {
  url: string;
  getToken: () => string | null;
  onEvent: (type: string, data: unknown) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  reconnectDelay?: number;
  reconnectDelayMax?: number;
}

export class SSEClient {
  private controller: AbortController | null = null;
  private _connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private opts: Required<SSEClientOptions>;
  private destroyed = false;

  constructor(opts: SSEClientOptions) {
    this.opts = {
      reconnect: true,
      reconnectDelay: 1000,
      reconnectDelayMax: 30000,
      onError: () => {},
      onOpen: () => {},
      onClose: () => {},
      ...opts,
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.destroyed) return;
    this.cleanup();

    const token = this.opts.getToken();
    if (!token) {
      this.opts.onError!(new Error('Not authenticated'));
      return;
    }

    this.controller = new AbortController();
    const url = `${API_URL}${this.opts.url}`;

    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: this.controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`SSE connection failed: ${res.status}`);
        }
        if (!res.body) {
          throw new Error('SSE response has no body');
        }

        this._connected = true;
        this.reconnectAttempts = 0;
        this.opts.onOpen!();

        return this.readStream(res.body);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        this._connected = false;
        this.opts.onError!(err);
        this.scheduleReconnect();
      });
  }

  disconnect(): void {
    this.destroyed = true;
    this.cleanup();
    this._connected = false;
    this.opts.onClose!();
  }

  private cleanup(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        // Keep the last incomplete chunk in buffer
        buffer = events.pop() || '';

        for (const eventStr of events) {
          this.parseEvent(eventStr);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    } finally {
      reader.releaseLock();
    }

    // Stream ended (server closed)
    this._connected = false;
    this.opts.onClose!();
    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  }

  private parseEvent(raw: string): void {
    const lines = raw.split('\n');
    let eventType = 'message';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        data += line.slice(6);
      } else if (line.startsWith(':')) {
        // Comment (keepalive) — skip this line, continue parsing
        continue;
      }
    }

    if (!data) return;

    try {
      const parsed = JSON.parse(data);
      this.opts.onEvent(eventType, parsed);
    } catch {
      // Non-JSON data — pass as string
      this.opts.onEvent(eventType, data);
    }
  }

  private scheduleReconnect(): void {
    if (!this.opts.reconnect || this.destroyed) return;

    const delay = Math.min(
      this.opts.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.opts.reconnectDelayMax
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.connect();
      }
    }, delay);
  }
}

/** Helper: get access token from localStorage. */
export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('access_token')
    : null;
}
