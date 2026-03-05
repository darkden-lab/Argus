"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

interface UseApiQueryOptions {
  staleTime?: number;
}

interface UseApiQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const lastFetchTime = new Map<string, number>();
const pendingRequests = new Map<string, Promise<unknown>>();

function deduplicatedGet<T>(path: string): Promise<T> {
  const existing = pendingRequests.get(path);
  if (existing) return existing as Promise<T>;

  const promise = api
    .get<T>(path)
    .finally(() => {
      pendingRequests.delete(path);
    });

  pendingRequests.set(path, promise);
  return promise;
}

export function useApiQuery<T>(
  path: string | null,
  options?: UseApiQueryOptions
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetch = useCallback(() => {
    if (!path) return;

    const staleTime = optionsRef.current?.staleTime;
    if (staleTime) {
      const lastTime = lastFetchTime.get(path) ?? 0;
      if (Date.now() - lastTime < staleTime) return;
    }

    setIsLoading(true);
    setError(null);
    deduplicatedGet<T>(path)
      .then((result) => {
        setData(result);
        setIsLoading(false);
        lastFetchTime.set(path, Date.now());
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
