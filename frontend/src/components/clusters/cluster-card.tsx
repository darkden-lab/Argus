"use client";

import { useRouter } from "next/navigation";
import {
  Bot,
  FileKey2,
  Server,
  ExternalLink,
  Terminal,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ConnectionType = "kubeconfig" | "agent";

interface ClusterCardProps {
  cluster: {
    id: string;
    name: string;
    api_server_url: string;
    status: string;
    connection_type?: ConnectionType;
    agent_status?: string;
    labels: Record<string, string>;
    last_health: string;
    node_count?: number;
  };
}

function getStatusDotType(
  status: string
): "healthy" | "warning" | "error" | "unknown" {
  const s = status.toLowerCase();
  if (
    s === "connected" ||
    s === "active" ||
    s === "ready" ||
    s === "running"
  ) {
    return "healthy";
  }
  if (s === "reconnecting" || s === "pending" || s === "waiting") {
    return "warning";
  }
  if (s === "offline" || s === "error" || s === "failed") {
    return "error";
  }
  return "unknown";
}

export function ClusterCard({ cluster }: ClusterCardProps) {
  const router = useRouter();
  const statusType = getStatusDotType(cluster.status);
  const isAgent = cluster.connection_type === "agent";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        "transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer"
      )}
      onClick={() => router.push(`/clusters/${cluster.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/clusters/${cluster.id}`);
        }
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight">
              {cluster.name}
            </h3>
            <p className="truncate text-xs text-muted-foreground mt-0.5">
              {cluster.api_server_url}
            </p>
          </div>
        </div>
        <StatusDot status={statusType} size="md" pulse={statusType === "healthy"} />
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 px-4 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0">
                {isAgent ? (
                  <Bot className="h-3 w-3 text-blue-500" />
                ) : (
                  <FileKey2 className="h-3 w-3 text-muted-foreground" />
                )}
                {isAgent ? "Agent" : "Kubeconfig"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {isAgent ? "Connected via Agent" : "Connected via Kubeconfig"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Badge
          variant={statusType === "healthy" ? "success" : statusType === "warning" ? "warning" : statusType === "error" ? "destructive" : "secondary"}
          className="text-[10px] px-1.5 py-0"
        >
          {cluster.status}
        </Badge>

        {isAgent && cluster.agent_status && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              cluster.agent_status === "connected" && "border-green-500 text-green-600",
              cluster.agent_status === "reconnecting" && "border-yellow-500 text-yellow-600",
              cluster.agent_status === "offline" && "border-destructive text-destructive"
            )}
          >
            {cluster.agent_status}
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 px-4 py-2 border-t border-border/50">
        <div className="text-center">
          <p className="text-lg font-semibold">{cluster.node_count ?? "-"}</p>
          <p className="text-[10px] text-muted-foreground">Nodes</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground truncate mt-1">
            {cluster.last_health || "N/A"}
          </p>
          <p className="text-[10px] text-muted-foreground">Last Health</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border/50">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/clusters/${cluster.id}`);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View details</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push("/terminal");
                }}
              >
                <Terminal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open terminal</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(cluster.api_server_url, "_blank");
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open API Server</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
