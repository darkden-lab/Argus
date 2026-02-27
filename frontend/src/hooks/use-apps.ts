"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  compositeApps,
  type App,
  type K8sDeployment,
  type K8sService,
  type K8sIngress,
  type K8sHTTPRoute,
} from "@/lib/abstractions";

interface UseAppsResult {
  apps: App[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApps(clusterId: string | null): UseAppsResult {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    if (!clusterId) {
      setApps([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [deploymentsRes, servicesRes, ingressesRes, httproutesRes] =
        await Promise.allSettled([
          api.get<{ items: K8sDeployment[] }>(
            `/api/clusters/${clusterId}/resources/apps/v1/deployments`
          ),
          api.get<{ items: K8sService[] }>(
            `/api/clusters/${clusterId}/resources/_/v1/services`
          ),
          api.get<{ items: K8sIngress[] }>(
            `/api/clusters/${clusterId}/resources/networking.k8s.io/v1/ingresses`
          ),
          api.get<{ items: K8sHTTPRoute[] }>(
            `/api/clusters/${clusterId}/resources/gateway.networking.k8s.io/v1/httproutes`
          ),
        ]);

      const deployments =
        deploymentsRes.status === "fulfilled"
          ? deploymentsRes.value.items ?? []
          : [];
      const services =
        servicesRes.status === "fulfilled"
          ? servicesRes.value.items ?? []
          : [];
      const ingresses =
        ingressesRes.status === "fulfilled"
          ? ingressesRes.value.items ?? []
          : [];
      const httproutes =
        httproutesRes.status === "fulfilled"
          ? httproutesRes.value.items ?? []
          : [];

      const composed = compositeApps(deployments, services, ingresses, httproutes);
      setApps(composed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch apps");
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  return { apps, loading, error, refetch: fetchApps };
}
