"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LogOut, Settings, User, ChevronRight, Wifi, WifiOff } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

// --- Route label mapping ---

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  apps: "Apps",
  databases: "Databases",
  jobs: "Jobs",
  clusters: "Clusters",
  networking: "Networking",
  storage: "Storage",
  monitoring: "Monitoring",
  terminal: "Terminal",
  settings: "Settings",
  plugins: "Plugins",
  notifications: "Notifications",
  ai: "AI Settings",
  audit: "Audit Log",
  oidc: "OIDC",
  roles: "Roles",
  users: "Users",
  "notification-channels": "Channels",
  profile: "Profile",
};

function getRouteLabel(segment: string): string {
  return routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
}

// --- Breadcrumbs ---

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const href = "/" + segments.slice(0, index + 1).join("/");
        const label = getRouteLabel(segment);

        return (
          <span key={href} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            )}
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// --- Header ---

export function Header() {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const logout = useAuthStore((s) => s.logout);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const socketStatus = useUIStore((s) => s.socketStatus);

  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  const displayName = user?.display_name || "User";
  const email = user?.email || "";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center">
        <Breadcrumbs />
      </div>

      {/* Center: Search trigger (opens command palette) */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-4 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
          {typeof navigator !== "undefined" &&
          /Mac|iPod|iPhone|iPad/.test(navigator.platform)
            ? "\u2318K"
            : "Ctrl+K"}
        </kbd>
      </button>

      {/* Right: Socket status + Notifications + User avatar */}
      <div className="flex items-center gap-2">
        {socketStatus === "reconnecting" && (
          <div className="flex items-center gap-1 text-xs text-yellow-500">
            <Wifi className="h-3.5 w-3.5 animate-pulse" />
            <span className="hidden sm:inline">Reconnecting...</span>
          </div>
        )}
        {socketStatus === "disconnected" && (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <WifiOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Disconnected</span>
          </div>
        )}
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-8 w-8 rounded-full"
              aria-label="User menu"
            >
              <UserAvatar user={user} size="md" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <UserAvatar user={user} size="md" />
              <div className="flex flex-col min-w-0">
                <span className="truncate text-sm font-medium">
                  {displayName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
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
