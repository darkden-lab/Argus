"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  compositeDatabases,
  cnpgToDatabases,
  type Database,
  type K8sStatefulSet,
  type K8sPVC,
  type K8sService,
  type CNPGCluster,
} from "@/lib/abstractions";

interface UseDatabasesResult {
  databases: Database[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDatabases(clusterId: string | null): UseDatabasesResult {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabases = useCallback(async () => {
    if (!clusterId) {
      setDatabases([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [statefulSetsRes, pvcsRes, servicesRes] =
        await Promise.allSettled([
          api.get<{ items: K8sStatefulSet[] }>(
            `/api/clusters/${clusterId}/resources/apps/v1/statefulsets`
          ),
          api.get<{ items: K8sPVC[] }>(
            `/api/clusters/${clusterId}/resources/_/v1/persistentvolumeclaims`
          ),
          api.get<{ items: K8sService[] }>(
            `/api/clusters/${clusterId}/resources/_/v1/services`
          ),
        ]);

      const statefulSets =
        statefulSetsRes.status === "fulfilled"
          ? statefulSetsRes.value.items ?? []
          : [];
      const pvcs =
        pvcsRes.status === "fulfilled" ? pvcsRes.value.items ?? [] : [];
      const services =
        servicesRes.status === "fulfilled"
          ? servicesRes.value.items ?? []
          : [];

      const composed = compositeDatabases(statefulSets, pvcs, services);

      // Try to fetch CNPG clusters if the plugin is enabled
      let cnpgDbs: Database[] = [];
      try {
        const cnpgRes = await api.get<{ items?: CNPGCluster[] }>(
          `/api/plugins/cnpg/clusters?clusterID=${clusterId}`
        );
        if (cnpgRes.items && cnpgRes.items.length > 0) {
          cnpgDbs = cnpgToDatabases(cnpgRes.items);
        }
      } catch {
        // CNPG plugin not enabled or not available — ignore
      }

      // Merge, deduplicating by name+namespace (prefer CNPG entries)
      const cnpgKeys = new Set(cnpgDbs.map((d) => `${d.namespace}/${d.name}`));
      const filtered = composed.filter(
        (d) => !cnpgKeys.has(`${d.namespace}/${d.name}`)
      );
      setDatabases([...filtered, ...cnpgDbs]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch databases"
      );
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  return { databases, loading, error, refetch: fetchDatabases };
}
