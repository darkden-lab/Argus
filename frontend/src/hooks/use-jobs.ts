"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  compositeJobs,
  type CompositeJob,
  type K8sCronJob,
  type K8sJob,
} from "@/lib/abstractions";

interface UseJobsResult {
  jobs: CompositeJob[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useJobs(clusterId: string | null): UseJobsResult {
  const [jobs, setJobs] = useState<CompositeJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!clusterId) {
      setJobs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [cronJobsRes, jobsRes] = await Promise.allSettled([
        api.get<{ items: K8sCronJob[] }>(
          `/api/clusters/${clusterId}/resources/batch/v1/cronjobs`
        ),
        api.get<{ items: K8sJob[] }>(
          `/api/clusters/${clusterId}/resources/batch/v1/jobs`
        ),
      ]);

      const cronJobs =
        cronJobsRes.status === "fulfilled"
          ? cronJobsRes.value.items ?? []
          : [];
      const rawJobs =
        jobsRes.status === "fulfilled" ? jobsRes.value.items ?? [] : [];

      const composed = compositeJobs(cronJobs, rawJobs);
      setJobs(composed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
