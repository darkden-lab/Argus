"use client";

import { useEffect, useRef } from "react";
import { useNotificationStore, type Notification } from "@/stores/notifications";
import { getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

/**
 * Hook that manages real-time notification updates via Socket.IO
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

  const socketRef = useRef<Socket | null>(null);

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

    const socket = getSocket("/notifications");
    socketRef.current = socket;

    socket.on("notification", (data: Notification | string) => {
      try {
        const notification: Notification =
          typeof data === "string" ? JSON.parse(data) : data;
        addRealtimeNotification(notification);
      } catch {
        // Ignore malformed messages
      }
    });

    return () => {
      disconnectSocket("/notifications");
      socketRef.current = null;
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
