"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface Cluster {
  id: string;
  name: string;
  status: string;
  api_server_url: string;
}

interface UseClusterSelectionResult {
  clusters: Cluster[];
  selectedClusterId: string;
  setSelectedClusterId: (id: string) => void;
  selectedCluster: Cluster | undefined;
  loading: boolean;
}

export function useClusterSelection(): UseClusterSelectionResult {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Cluster[]>("/api/clusters")
      .then((data) => {
        setClusters(data);
        const healthy = data.find(
          (c) => c.status === "connected" || c.status === "healthy"
        );
        if (healthy && !selectedClusterId) {
          setSelectedClusterId(healthy.id);
        } else if (data.length > 0 && !selectedClusterId) {
          setSelectedClusterId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetClusterId = useCallback((id: string) => {
    setSelectedClusterId(id);
  }, []);

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);

  return {
    clusters,
    selectedClusterId,
    setSelectedClusterId: handleSetClusterId,
    selectedCluster,
    loading,
  };
}
