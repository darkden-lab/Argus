"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Filter,
  CheckCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  Notification,
  NotificationCategory,
  NotificationSeverity,
} from "@/stores/notifications";
import { useNotificationStore } from "@/stores/notifications";

interface NotificationsResponse {
  notifications: Notification[] | null;
  total: number;
  limit: number;
  offset: number;
}

const severityConfig: Record<
  NotificationSeverity,
  { icon: typeof Info; className: string; label: string }
> = {
  info: { icon: Info, className: "text-blue-500", label: "Info" },
  warning: {
    icon: AlertTriangle,
    className: "text-yellow-500",
    label: "Warning",
  },
  error: {
    icon: AlertTriangle,
    className: "text-destructive",
    label: "Error",
  },
  critical: {
    icon: AlertOctagon,
    className: "text-destructive",
    label: "Critical",
  },
};

const categoryOptions: { value: NotificationCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "cluster", label: "Cluster" },
  { value: "deployment", label: "Deployment" },
  { value: "security", label: "Security" },
  { value: "system", label: "System" },
  { value: "health", label: "Health" },
];

const severityOptions: { value: NotificationSeverity | "all"; label: string }[] = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const perPage = 20;

  const fetchUnreadCount = useNotificationStore(
    (state) => state.fetchUnreadCount
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * perPage;
      let url = `/api/notifications?limit=${perPage}&offset=${offset}`;
      if (categoryFilter !== "all") url += `&category=${categoryFilter}`;
      if (severityFilter !== "all") url += `&severity=${severityFilter}`;

      const data = await api.get<NotificationsResponse>(url);
      setNotifications(data.notifications ?? []);
      setTotal(data.total);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, severityFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleMarkRead(id: string) {
    try {
      await api.put(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      fetchUnreadCount();
    } catch {
      // handled by api
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.put("/api/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      fetchUnreadCount();
    } catch {
      // handled by api
    }
  }

  const totalPages = Math.ceil(total / perPage);
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            View and manage all your notifications.
          </p>
        </div>
        {hasUnread && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {severityOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-lg font-medium text-muted-foreground">
            No notifications
          </p>
          <p className="text-sm text-muted-foreground/60">
            {categoryFilter !== "all" || severityFilter !== "all"
              ? "Try adjusting your filters."
              : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const config = severityConfig[notification.severity];
            const Icon = config.icon;

            return (
              <div
                key={notification.id}
                className={cn(
                  "flex gap-4 rounded-lg border p-4 transition-colors",
                  !notification.read && "bg-accent/20 border-accent"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <Icon className={cn("h-5 w-5", config.className)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm",
                          !notification.read && "font-semibold"
                        )}
                      >
                        {notification.title}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {notification.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(notification.created_at)}
                      </span>
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleMarkRead(notification.id)}
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {notification.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
