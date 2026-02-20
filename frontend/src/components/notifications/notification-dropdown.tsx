"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertOctagon,
  Server,
  Shield,
  Settings2,
  Activity,
  Rocket,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Notification, NotificationCategory, NotificationSeverity } from "@/stores/notifications";

function severityIcon(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return <AlertOctagon className="h-4 w-4 text-destructive" />;
    case "error":
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "info":
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function categoryIcon(category: NotificationCategory) {
  switch (category) {
    case "cluster":
      return <Server className="h-3.5 w-3.5" />;
    case "deployment":
      return <Rocket className="h-3.5 w-3.5" />;
    case "security":
      return <Shield className="h-3.5 w-3.5" />;
    case "health":
      return <Activity className="h-3.5 w-3.5" />;
    case "system":
    default:
      return <Settings2 className="h-3.5 w-3.5" />;
  }
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
        !notification.read && "bg-accent/30"
      )}
      onClick={() => {
        if (!notification.read) {
          onMarkRead(notification.id);
        }
      }}
    >
      <div className="mt-0.5 shrink-0">
        {severityIcon(notification.severity)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-sm truncate", !notification.read && "font-medium")}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {notification.body}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {categoryIcon(notification.category)}
            {notification.category}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(notification.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

interface NotificationDropdownProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

export function NotificationDropdown({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: NotificationDropdownProps) {
  const recent = notifications.slice(0, 10);
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pb-2">
        <h4 className="text-sm font-semibold">Notifications</h4>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs text-muted-foreground"
            onClick={onMarkAllRead}
          >
            Mark all read
          </Button>
        )}
      </div>
      <Separator />
      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">All caught up!</p>
          <p className="text-xs text-muted-foreground/60">No new notifications</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[360px]">
          <div className="flex flex-col gap-0.5 py-1">
            {recent.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      <Separator />
      <div className="px-3 py-2">
        <Link
          href="/notifications"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
