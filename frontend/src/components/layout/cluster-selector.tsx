"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Network } from "lucide-react";

interface Cluster {
  id: string;
  name: string;
  status: string;
}

interface ClusterSelectorProps {
  clusters: Cluster[];
  selectedClusterId: string;
  onClusterChange: (clusterId: string) => void;
  loading?: boolean;
}

export function ClusterSelector({
  clusters,
  selectedClusterId,
  onClusterChange,
  loading,
}: ClusterSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Network className="h-4 w-4" />
        <span>Loading clusters...</span>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Network className="h-4 w-4" />
        <span>No clusters available</span>
      </div>
    );
  }

  return (
    <Select value={selectedClusterId} onValueChange={onClusterChange}>
      <SelectTrigger className="w-[200px]" size="sm">
        <div className="flex items-center gap-2">
          <Network className="h-3.5 w-3.5" />
          <SelectValue placeholder="Select cluster" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {clusters.map((cluster) => (
          <SelectItem key={cluster.id} value={cluster.id}>
            <span>{cluster.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
