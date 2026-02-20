"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { usePermissionsStore } from "@/stores/permissions";

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

  return (
    <div className="flex h-screen overflow-hidden dark">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}
