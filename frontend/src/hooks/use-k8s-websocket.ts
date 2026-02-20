"use client";

import { useEffect, useRef, useState } from "react";
import { k8sWs, type WatchEvent } from "@/lib/ws";

interface UseK8sWebSocketOptions {
  cluster: string;
  resource: string;
  namespace?: string;
  onEvent?: (event: WatchEvent) => void;
}

export function useK8sWebSocket({
  cluster,
  resource,
  namespace,
  onEvent,
}: UseK8sWebSocketOptions) {
  const [lastEvent, setLastEvent] = useState<WatchEvent | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) return;

    k8sWs.connect(token);
    setIsConnected(true);

    k8sWs.subscribe(cluster, resource, namespace);

    const eventKey = `${cluster}/${resource}/${namespace || ""}`;
    const unsubscribeListener = k8sWs.on(eventKey, (event) => {
      setLastEvent(event);
      setLastUpdated(new Date());
      callbackRef.current?.(event);
    });

    return () => {
      unsubscribeListener();
      k8sWs.unsubscribe(cluster, resource, namespace);
      setIsConnected(false);
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
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) return;

    k8sWs.connect(token);
    setIsConnected(true);

    const unsubscribeListener = k8sWs.on("*", (event) => {
      setLastUpdated(new Date());
      callbackRef.current(event);
    });

    return () => {
      unsubscribeListener();
      setIsConnected(false);
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
