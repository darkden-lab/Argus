"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/ui";

interface Cluster {
  id: string;
  name: string;
}

export function useOnboarding() {
  const router = useRouter();
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted);
  const setOnboardingCompleted = useUIStore((s) => s.setOnboardingCompleted);
  const [checking, setChecking] = useState(true);
  const [hasClusters, setHasClusters] = useState(false);

  useEffect(() => {
    // Skip check if onboarding was already completed
    if (onboardingCompleted) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function checkClusters() {
      try {
        const clusters = await api.get<Cluster[]>("/api/clusters");
        if (cancelled) return;

        if (clusters.length > 0) {
          setHasClusters(true);
          setOnboardingCompleted(true);
        } else {
          setHasClusters(false);
          // Redirect to onboarding if no clusters and not already there
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/onboarding")) {
            router.push("/onboarding");
          }
        }
      } catch {
        // If API fails, skip onboarding check (user might not be authenticated)
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    checkClusters();

    return () => {
      cancelled = true;
    };
  }, [onboardingCompleted, setOnboardingCompleted, router]);

  return {
    checking,
    hasClusters,
    onboardingCompleted,
    setOnboardingCompleted,
  };
}
