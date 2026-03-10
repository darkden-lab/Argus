"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { usePermissionsStore } from "@/stores/permissions";
import { useOnboarding } from "@/hooks/use-onboarding";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "@/components/ui/toast";
import { ChatPanel, ChatToggleButton } from "@/components/ai/chat-panel";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const isLoaded = usePermissionsStore((s) => s.isLoaded);

  // Redirect to /onboarding if no clusters exist and onboarding not completed
  useOnboarding();

  useEffect(() => {
    if (!isLoaded) {
      fetchPermissions();
    }
  }, [fetchPermissions, isLoaded]);

  // K8s SSE connections are managed by the useK8sWatch hook when components mount.
  // No pre-connect needed — SSE clients auto-connect on first subscription.

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
