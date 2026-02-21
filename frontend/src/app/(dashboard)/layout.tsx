"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { usePermissionsStore } from "@/stores/permissions";
import { k8sWs } from "@/lib/ws";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "@/components/ui/toast";
import { ChatPanel, ChatToggleButton } from "@/components/ai/chat-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const isLoaded = usePermissionsStore((s) => s.isLoaded);

  useEffect(() => {
    if (!isLoaded) {
      fetchPermissions();
    }
  }, [fetchPermissions, isLoaded]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      k8sWs.connect(token);
    }
    return () => {
      k8sWs.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <MainContent>
          <ErrorBoundary>{children}</ErrorBoundary>
        </MainContent>
      </div>
      <ToastContainer />
      <ChatPanel />
      <ChatToggleButton />
    </div>
  );
}
