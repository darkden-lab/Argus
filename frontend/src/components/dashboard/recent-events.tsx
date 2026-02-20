"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface K8sEvent {
  id: string;
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  object: string;
  timestamp: string;
}

interface RecentEventsProps {
  events: K8sEvent[];
}

export function RecentEvents({ events }: RecentEventsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Events</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">No recent events.</p>
          )}
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-lg border border-border/50 p-3"
            >
              <Badge
                variant="outline"
                className={
                  event.type === "Warning"
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
                    : "bg-blue-500/15 text-blue-500 border-blue-500/20"
                }
              >
                {event.type}
              </Badge>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{event.reason}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {event.timestamp}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{event.message}</p>
                <p className="text-xs font-mono text-muted-foreground/70">
                  {event.object}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
