"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface UseApiQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(path: string | null): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!path) return;
    setIsLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((result) => {
        setData(result);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      });
  }, [path]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
