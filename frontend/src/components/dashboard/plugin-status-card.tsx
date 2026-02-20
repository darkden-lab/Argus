"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Puzzle } from "lucide-react";

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

interface PluginStatusCardProps {
  plugins: PluginInfo[];
}

export function PluginStatusCard({ plugins }: PluginStatusCardProps) {
  const enabled = plugins.filter((p) => p.enabled);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Active Plugins</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {enabled.length === 0 && (
            <p className="text-sm text-muted-foreground">No plugins enabled.</p>
          )}
          {enabled.map((plugin) => (
            <div
              key={plugin.id}
              className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{plugin.name}</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                v{plugin.version}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
