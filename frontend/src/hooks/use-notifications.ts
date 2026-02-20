"use client";

import { useEffect, useRef } from "react";
import { useNotificationStore, type Notification } from "@/stores/notifications";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

/**
 * Hook that manages real-time notification updates via WebSocket
 * and initial data fetching for the notification system.
 */
export function useNotifications() {
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllRead,
    addRealtimeNotification,
  } = useNotificationStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) return;

    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/notifications?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const notification: Notification = JSON.parse(event.data);
          addRealtimeNotification(notification);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            30000
          );
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onopen = () => {
        reconnectDelayRef.current = 1000;
      };
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [addRealtimeNotification]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
    fetchNotifications,
  };
}
