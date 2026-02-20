"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, Layers, Globe, Container } from "lucide-react";

export interface ResourceCounts {
  pods: number;
  deployments: number;
  services: number;
  namespaces: number;
}

interface ResourceSummaryProps {
  resources: ResourceCounts;
}

const resourceItems = [
  { key: "pods" as const, label: "Pods", icon: Box },
  { key: "deployments" as const, label: "Deployments", icon: Layers },
  { key: "services" as const, label: "Services", icon: Globe },
  { key: "namespaces" as const, label: "Namespaces", icon: Container },
];

export function ResourceSummary({ resources }: ResourceSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Resource Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {resourceItems.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{resources[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
