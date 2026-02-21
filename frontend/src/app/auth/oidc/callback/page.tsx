"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  display_name: string;
  auth_provider: string;
}

function parseFragment(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function OidcCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Tokens are passed in the URL fragment (#) to avoid exposure in Referer
    // headers and server logs. Fall back to query params for compatibility.
    const fragment = parseFragment(window.location.hash);
    const accessToken = fragment.get("access_token") || searchParams.get("access_token");
    const refreshToken = fragment.get("refresh_token") || searchParams.get("refresh_token");
    const errorParam = searchParams.get("error");

    // Clear fragment from URL to remove tokens from browser history
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (!accessToken) {
      setError("No access token received from OIDC provider.");
      return;
    }

    localStorage.setItem("access_token", accessToken);
    document.cookie = `access_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    if (refreshToken) {
      localStorage.setItem("refresh_token", refreshToken);
    }

    api
      .get<User>("/api/auth/me")
      .then((user) => {
        useAuthStore.setState({
          user,
          isAuthenticated: true,
        });
        router.replace("/dashboard");
      })
      .catch(() => {
        setError("Failed to fetch user profile after OIDC login.");
      });
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold text-destructive">
            Authentication Failed
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/login" className="text-sm text-primary underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">
        Completing authentication...
      </p>
    </div>
  );
}

export default function OidcCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <OidcCallbackContent />
    </Suspense>
  );
}
