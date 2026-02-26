"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { usePermissionsStore } from "@/stores/permissions";
import { useAuthStore } from "@/stores/auth";
import { k8sWs } from "@/lib/ws";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "@/components/ui/toast";
import { ChatPanel, ChatToggleButton } from "@/components/ai/chat-panel";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const isLoaded = usePermissionsStore((s) => s.isLoaded);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isLoaded) {
      fetchPermissions();
    }
  }, [fetchPermissions, isLoaded]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("access_token");
    if (token) {
      k8sWs.connect(token);
    }
    return () => {
      k8sWs.disconnect();
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
