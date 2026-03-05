"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { usePermissionsStore } from "@/stores/permissions";
import { useAuthStore } from "@/stores/auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "@/components/ui/toast";
import { ChatPanel, ChatToggleButton } from "@/components/ai/chat-panel";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const isLoaded = usePermissionsStore((s) => s.isLoaded);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Redirect to /onboarding if no clusters exist and onboarding not completed
  useOnboarding();

  useEffect(() => {
    if (!isLoaded) {
      fetchPermissions();
    }
  }, [fetchPermissions, isLoaded]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("access_token");
    if (token) {
      // Pre-connect the K8s Socket.IO namespace so watch events are ready
      getSocket("/k8s");
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "access_token" && e.newValue) {
        // Reconnect with new token
        disconnectSocket("/k8s");
        getSocket("/k8s");
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      disconnectSocket("/k8s");
    };
  }, [isAuthenticated]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <MainContent>
          <ErrorBoundary>{children}</ErrorBoundary>
        </MainContent>
      </div>
      <CommandPalette />
      <ToastContainer />
      <ChatPanel />
      <ChatToggleButton />
      <TerminalPanel />
    </div>
  );
}
