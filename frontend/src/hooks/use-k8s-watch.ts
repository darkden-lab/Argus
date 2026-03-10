"use client";

import { useEffect, useRef, useState } from "react";
import { SSEClient, getToken } from "@/lib/sse-client";
import { api } from "@/lib/api";

export interface WatchEvent {
  cluster: string;
  resource: string;
  namespace: string;
  type: "ADDED" | "MODIFIED" | "DELETED";
  object: unknown;
}

// Singleton SSE client for K8s events (shared between all hooks)
let k8sSSE: SSEClient | null = null;
let k8sRefCount = 0;
const watchCallbacks = new Map<string, Set<(event: WatchEvent) => void>>();
const wildcardCallbacks = new Set<(event: WatchEvent) => void>();

function resubscribeAll(): void {
  // Re-subscribe all active watch keys after SSE reconnect (C2 fix)
  for (const key of watchCallbacks.keys()) {
    const parts = key.split("/");
    const [cluster, resource, ...nsParts] = parts;
    const namespace = nsParts.join("/");
    api
      .post("/api/k8s/watch/subscribe", { cluster, resource, namespace })
      .catch(() => {});
  }
}

function ensureK8sSSE(): SSEClient {
  if (!k8sSSE) {
    k8sSSE = new SSEClient({
      url: "/api/k8s/events",
      getToken,
      onEvent: (_type, data) => {
        const event = data as WatchEvent;
        const key = `${event.cluster}/${event.resource}/${event.namespace || ""}`;

        // Targeted callbacks
        const cbs = watchCallbacks.get(key);
        if (cbs) {
          for (const cb of cbs) cb(event);
        }

        // Wildcard callbacks
        for (const cb of wildcardCallbacks) cb(event);
      },
      onOpen: () => {
        // Re-subscribe all active watches on reconnect
        resubscribeAll();
      },
    });
    k8sSSE.connect();
  }
  k8sRefCount++;
  return k8sSSE;
}

function releaseK8sSSE(): void {
  k8sRefCount--;
  if (k8sRefCount <= 0 && k8sSSE) {
    k8sSSE.disconnect();
    k8sSSE = null;
    k8sRefCount = 0;
  }
}

interface UseK8sWatchOptions {
  cluster: string;
  resource: string;
  namespace?: string;
  onEvent?: (event: WatchEvent) => void;
}

export function useK8sWatch({
  cluster,
  resource,
  namespace,
  onEvent,
}: UseK8sWatchOptions) {
  const [lastEvent, setLastEvent] = useState<WatchEvent | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const client = ensureK8sSSE();
    const subKey = `${cluster}/${resource}/${namespace || ""}`;

    // Connection tracking
    const checkConnected = () => setIsConnected(client.connected);
    checkConnected();
    const connInterval = setInterval(checkConnected, 2000);

    // Register callback
    const handler = (data: WatchEvent) => {
      setLastEvent(data);
      setLastUpdated(new Date());
      callbackRef.current?.(data);
    };

    if (!watchCallbacks.has(subKey)) {
      watchCallbacks.set(subKey, new Set());
    }
    watchCallbacks.get(subKey)!.add(handler);

    // Subscribe via REST
    api
      .post("/api/k8s/watch/subscribe", {
        cluster,
        resource,
        namespace: namespace || "",
      })
      .catch(() => {});

    return () => {
      clearInterval(connInterval);

      // Unsubscribe via REST
      api
        .post("/api/k8s/watch/unsubscribe", {
          cluster,
          resource,
          namespace: namespace || "",
        })
        .catch(() => {});

      // Remove callback
      const cbs = watchCallbacks.get(subKey);
      if (cbs) {
        cbs.delete(handler);
        if (cbs.size === 0) watchCallbacks.delete(subKey);
      }

      setIsConnected(false);
      releaseK8sSSE();
    };
  }, [cluster, resource, namespace]);

  return { lastEvent, lastUpdated, isConnected };
}

interface UseK8sWildcardOptions {
  onEvent: (event: WatchEvent) => void;
}

export function useK8sWildcard({ onEvent }: UseK8sWildcardOptions) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const client = ensureK8sSSE();

    const checkConnected = () => setIsConnected(client.connected);
    checkConnected();
    const connInterval = setInterval(checkConnected, 2000);

    const handler = (data: WatchEvent) => {
      setLastUpdated(new Date());
      callbackRef.current(data);
    };

    wildcardCallbacks.add(handler);

    return () => {
      clearInterval(connInterval);
      wildcardCallbacks.delete(handler);
      setIsConnected(false);
      releaseK8sSSE();
    };
  }, []);

  return { lastUpdated, isConnected };
}

export function useRelativeTime(date: Date | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [date]);

  if (!date) return "Never";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
