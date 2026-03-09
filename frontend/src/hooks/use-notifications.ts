"use client";

import { useEffect, useRef } from "react";
import { useNotificationStore, type Notification } from "@/stores/notifications";
import { SSEClient, getToken } from "@/lib/sse-client";

/**
 * Hook that manages real-time notification updates via SSE
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

  const clientRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const client = new SSEClient({
      url: "/api/notifications/stream",
      getToken,
      onEvent: (_type, data) => {
        try {
          const notification: Notification =
            typeof data === "string" ? JSON.parse(data) : (data as Notification);
          addRealtimeNotification(notification);
        } catch {
          // Ignore malformed messages
        }
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
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
