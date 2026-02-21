"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
}

function getInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const label = segment.charAt(0).toUpperCase() + segment.slice(1);
        return (
          <span key={segment} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-muted-foreground/40">/</span>}
            <span
              className={
                isLast ? "font-medium text-foreground" : "text-muted-foreground"
              }
            >
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

export function Header() {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const logout = useAuthStore((s) => s.logout);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>("");

  const loadClusters = useCallback(async () => {
    try {
      const data = await api.get<Cluster[]>("/api/clusters");
      setClusters(data);
      if (data.length > 0 && !selectedCluster) {
        setSelectedCluster(data[0].id);
      }
    } catch {
      // API error is handled by the api client (toast + redirect on 401)
    }
  }, [selectedCluster]);

  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  useEffect(() => {
    loadClusters();
  }, [loadClusters]);

  const initials = user?.display_name ? getInitials(user.display_name) : "?";
  const displayName = user?.display_name || "User";
  const email = user?.email || "";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-4">
        <Breadcrumbs />
      </div>

      {/* Right: Notifications + Cluster selector + User menu */}
      <div className="flex items-center gap-3">
        {/* Notification Bell */}
        <NotificationBell />

        {/* Cluster Selector */}
        <Select
          value={selectedCluster}
          onValueChange={setSelectedCluster}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder={clusters.length === 0 ? "No clusters" : "Select cluster"} />
          </SelectTrigger>
          <SelectContent>
            {clusters.map((cluster) => (
              <SelectItem key={cluster.id} value={cluster.id}>
                {cluster.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-6" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-8 w-8 rounded-full"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
