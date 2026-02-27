"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { getStatusDot, truncateImage, type App } from "@/lib/abstractions";
import { cn } from "@/lib/utils";
import { Globe, Lock, Network, Box, Route } from "lucide-react";
import type { HostSource } from "@/lib/abstractions";

interface AppCardProps {
  app: App;
  onClick?: () => void;
}

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
    case "deploying":
    case "scaling":
      return "warning";
    case "failing":
      return "destructive";
    default:
      return "secondary";
  }
}

export function AppCard({ app, onClick }: AppCardProps) {
  const dotStatus = getStatusDot(app.status);
  const imageTag = truncateImage(app.image);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:border-primary/50",
        "py-4"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={dotStatus} size="md" />
            <CardTitle className="text-sm truncate">{app.name}</CardTitle>
          </div>
          <Badge variant={getStatusBadgeVariant(app.status)} className="shrink-0 text-[10px]">
            {app.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="text-xs text-muted-foreground">
          {app.namespace}
        </div>

        {/* Replicas */}
        <div className="flex items-center gap-1.5 text-xs">
          <Box className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            Replicas:{" "}
            <span
              className={cn(
                "font-medium",
                app.replicas.ready === app.replicas.desired
                  ? "text-green-500"
                  : "text-yellow-500"
              )}
            >
              {app.replicas.ready}/{app.replicas.desired}
            </span>
          </span>
        </div>

        {/* Image tag */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Network className="h-3.5 w-3.5" />
          <span className="truncate font-mono">{imageTag}</span>
        </div>

        {/* Endpoints / Hosts */}
        {app.hostSources && app.hostSources.length > 0 ? (
          <div className="space-y-1">
            {app.hostSources.slice(0, 3).map((hs: HostSource) => (
              <div key={`${hs.source}-${hs.hostname}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {hs.source === "httproute" ? (
                  <Route className="h-3.5 w-3.5 text-blue-500" />
                ) : app.hasTLS ? (
                  <Lock className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{hs.hostname}</span>
              </div>
            ))}
            {app.hostSources.length > 3 && (
              <div className="text-xs text-muted-foreground pl-5">
                +{app.hostSources.length - 3} more
              </div>
            )}
          </div>
        ) : app.endpoints.length > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            <span className="truncate">{app.endpoints.join(", ")}</span>
          </div>
        ) : null}

        {/* Service type badge */}
        {app.serviceType !== "None" && (
          <Badge variant="outline" className="text-[10px]">
            {app.serviceType}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
