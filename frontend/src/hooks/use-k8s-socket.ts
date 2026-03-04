"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket, type WatchEvent } from "@/lib/socket";

interface UseK8sSocketOptions {
  cluster: string;
  resource: string;
  namespace?: string;
  onEvent?: (event: WatchEvent) => void;
}

export function useK8sSocket({
  cluster,
  resource,
  namespace,
  onEvent,
}: UseK8sSocketOptions) {
  const [lastEvent, setLastEvent] = useState<WatchEvent | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const socket = getSocket("/k8s");

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleWatchEvent = (data: WatchEvent) => {
      const eventKey = `${data.cluster}/${data.resource}/${data.namespace || ""}`;
      const subKey = `${cluster}/${resource}/${namespace || ""}`;
      if (eventKey === subKey) {
        setLastEvent(data);
        setLastUpdated(new Date());
        callbackRef.current?.(data);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("watch_event", handleWatchEvent);

    if (socket.connected) setIsConnected(true);

    // Subscribe to resource
    socket.emit("subscribe", { cluster, resource, namespace: namespace || "" });

    return () => {
      socket.emit("unsubscribe", { cluster, resource, namespace: namespace || "" });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("watch_event", handleWatchEvent);
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
    const socket = getSocket("/k8s");

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleWatchEvent = (data: WatchEvent) => {
      setLastUpdated(new Date());
      callbackRef.current(data);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("watch_event", handleWatchEvent);

    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("watch_event", handleWatchEvent);
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
