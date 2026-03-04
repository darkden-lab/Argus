import { io, Socket } from "socket.io-client";
import { useUIStore } from "@/stores/ui";

function resolveBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) return apiUrl;
  return "";
}

const BASE_URL = resolveBaseUrl();

function getToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;
}

export type Namespace = "/k8s" | "/ai" | "/terminal" | "/notifications";

const sockets = new Map<Namespace, Socket>();

function updateSocketStatus(): void {
  const allSockets = Array.from(sockets.values());
  if (allSockets.length === 0) {
    useUIStore.getState().setSocketStatus("disconnected");
    return;
  }
  if (allSockets.some((s) => s.connected)) {
    useUIStore.getState().setSocketStatus("connected");
  } else if (allSockets.some((s) => s.active && !s.connected)) {
    useUIStore.getState().setSocketStatus("reconnecting");
  } else {
    useUIStore.getState().setSocketStatus("disconnected");
  }
}

/**
 * Get or create a Socket.IO connection for a given namespace.
 * Auth token is passed in the handshake `auth` object (not in the URL).
 * Uses exponential backoff: 1s → ~1.5s → ~2.3s → ... → 30s max (with jitter).
 */
export function getSocket(namespace: Namespace): Socket {
  const existing = sockets.get(namespace);
  if (existing && !existing.disconnected) return existing;

  // Disconnect stale socket if exists
  if (existing) {
    existing.disconnect();
    sockets.delete(namespace);
  }

  const token = getToken();
  const socket = io(`${BASE_URL}${namespace}`, {
    auth: { token: token || "" },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    autoConnect: true,
  });

  socket.on("connect", updateSocketStatus);
  socket.on("disconnect", updateSocketStatus);
  socket.io.on("reconnect_attempt", () => {
    useUIStore.getState().setSocketStatus("reconnecting");
  });

  sockets.set(namespace, socket);
  return socket;
}

/**
 * Disconnect a specific namespace socket.
 */
export function disconnectSocket(namespace: Namespace): void {
  const socket = sockets.get(namespace);
  if (socket) {
    socket.disconnect();
    sockets.delete(namespace);
  }
}

/**
 * Disconnect all Socket.IO connections.
 */
export function disconnectAll(): void {
  for (const [ns, socket] of sockets) {
    socket.disconnect();
    sockets.delete(ns);
  }
}

// Re-export WatchEvent type for compatibility
export interface WatchEvent {
  cluster: string;
  resource: string;
  namespace: string;
  type: "ADDED" | "MODIFIED" | "DELETED";
  object: unknown;
}

// Re-export WS_URL for backwards compatibility with any code still using it
export const WS_URL = BASE_URL.replace(/^http/, "ws");
