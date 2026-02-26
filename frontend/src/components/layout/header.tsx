"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LogOut, Settings, User, ChevronRight } from "lucide-react";
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
};

function getRouteLabel(segment: string): string {
  return routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
}

function getInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
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

  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  const initials = user?.display_name ? getInitials(user.display_name) : "?";
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

      {/* Right: Notifications + User avatar */}
      <div className="flex items-center gap-2">
        <NotificationBell />

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
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
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
