"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { getStatusDot, type Database } from "@/lib/abstractions";
import { cn } from "@/lib/utils";
import { Box, HardDrive, Database as DatabaseIcon } from "lucide-react";

interface DatabaseCardProps {
  database: Database;
  onClick?: () => void;
}

function getEngineColor(engine: string): string {
  switch (engine) {
    case "postgresql":
      return "text-blue-500";
    case "mariadb":
    case "mysql":
      return "text-orange-500";
    case "redis":
      return "text-red-500";
    case "mongodb":
      return "text-green-500";
    default:
      return "text-muted-foreground";
  }
}

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "success" | "warning" {
  switch (status) {
    case "running":
      return "success";
    case "creating":
      return "warning";
    case "failing":
      return "destructive";
    default:
      return "secondary";
  }
}

export function DatabaseCard({ database, onClick }: DatabaseCardProps) {
  const dotStatus = getStatusDot(database.status);
  const engineColor = getEngineColor(database.engine);

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
            <CardTitle className="text-sm truncate">{database.name}</CardTitle>
          </div>
          <Badge
            variant={getStatusBadgeVariant(database.status)}
            className="shrink-0 text-[10px]"
          >
            {database.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="text-xs text-muted-foreground">{database.namespace}</div>

        {/* Engine */}
        <div className="flex items-center gap-1.5 text-xs">
          <DatabaseIcon className={cn("h-3.5 w-3.5", engineColor)} />
          <span className="font-medium capitalize">{database.engine}</span>
          {database.isCNPG && (
            <Badge variant="outline" className="text-[10px] ml-1">
              CNPG
            </Badge>
          )}
          {database.isMariaDB && (
            <Badge variant="outline" className="text-[10px] ml-1">
              Operator
            </Badge>
          )}
        </div>

        {/* Replicas */}
        <div className="flex items-center gap-1.5 text-xs">
          <Box className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            Replicas:{" "}
            <span
              className={cn(
                "font-medium",
                database.replicas.ready === database.replicas.desired
                  ? "text-green-500"
                  : "text-yellow-500"
              )}
            >
              {database.replicas.ready}/{database.replicas.desired}
            </span>
          </span>
        </div>

        {/* Storage */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" />
          <span>{database.storage}</span>
        </div>
      </CardContent>
    </Card>
  );
}
