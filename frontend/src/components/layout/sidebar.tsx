"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Rocket,
  Database,
  Timer,
  Network,
  Wifi,
  HardDrive,
  Activity,
  Terminal,
  Sparkles,
  Settings,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { usePluginStore } from "@/stores/plugins";
import { useAiChatStore } from "@/stores/ai-chat";
import { useClusterStore } from "@/stores/cluster";
import type { LucideIcon } from "lucide-react";

// --- Types ---

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// --- Navigation definition ---

const mainSection: NavSection = {
  title: "Main",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
    { label: "Apps", href: "/apps", icon: Rocket },
    { label: "Databases", href: "/databases", icon: Database },
    { label: "Jobs", href: "/jobs", icon: Timer },
  ],
};

const infrastructureSection: NavSection = {
  title: "Infrastructure",
  items: [
    { label: "Clusters", href: "/clusters", icon: Network },
    { label: "Networking", href: "/networking", icon: Wifi },
    { label: "Storage", href: "/storage", icon: HardDrive },
    { label: "Monitoring", href: "/monitoring", icon: Activity },
  ],
};

const toolsSection: NavSection = {
  title: "Tools",
  items: [
    { label: "Terminal", href: "/terminal", icon: Terminal },
  ],
};

const bottomItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
];

const navSections: NavSection[] = [mainSection, infrastructureSection];

// --- Helpers ---

function getInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// --- Component ---

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openAiChat = useAiChatStore((s) => s.open);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const plugins = usePluginStore((s) => s.plugins);
  const fetchPlugins = usePluginStore((s) => s.fetchPlugins);

  const clusters = useClusterStore((s) => s.clusters);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId) ?? "";
  const setSelectedClusterId = useClusterStore((s) => s.setSelectedClusterId);
  const fetchClusters = useClusterStore((s) => s.fetchClusters);

  useEffect(() => {
    fetchPlugins();
    fetchClusters();
  }, [fetchPlugins, fetchClusters]);

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);
  const initials = user?.display_name ? getInitials(user.display_name) : "?";
  const displayName = user?.display_name || "User";
  const email = user?.email || "";

  // Build plugin nav items
  const pluginItems: NavItem[] = plugins.flatMap((p) =>
    (p.frontend?.navigation || []).map((nav) => ({
      label: nav.label,
      href: nav.path,
      icon: Puzzle,
    }))
  );

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        {/* Logo + Collapse toggle */}
        <div className="flex h-14 items-center justify-between px-3">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  A
                </span>
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Argus
              </span>
            </Link>
          )}
          {collapsed && (
            <Link
              href="/dashboard"
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary"
            >
              <span className="text-sm font-bold text-primary-foreground">
                A
              </span>
            </Link>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navSections.map((section, sectionIdx) => (
            <div key={section.title} className="mb-3">
              {!collapsed && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {section.title}
                </p>
              )}
              {collapsed && sectionIdx > 0 && (
                <Separator className="mx-auto mb-2 w-8 bg-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    isActive={
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/")
                    }
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Tools section: Terminal + AI Assistant */}
          <div className="mb-3">
            {!collapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Tools
              </p>
            )}
            {collapsed && (
              <Separator className="mx-auto mb-2 w-8 bg-sidebar-border" />
            )}
            <div className="space-y-0.5">
              {toolsSection.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  isActive={
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/")
                  }
                  collapsed={collapsed}
                />
              ))}
              {/* AI Assistant (action, not a route) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={openAiChat}
                    aria-label="AI Assistant"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>AI Assistant</span>}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">AI Assistant</TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Settings + Plugins */}
          <div className="mt-3 space-y-0.5">
            {bottomItems.map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                isActive={
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/")
                }
                collapsed={collapsed}
              />
            ))}

            {/* Plugin nav items */}
            {pluginItems.length > 0 && (
              <>
                {pluginItems.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    isActive={
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/")
                    }
                    collapsed={collapsed}
                  />
                ))}
              </>
            )}

            {/* Plugins link (always visible) */}
            <SidebarItem
              item={{
                label: "Plugins",
                href: "/settings/plugins",
                icon: Puzzle,
              }}
              isActive={pathname === "/settings/plugins"}
              collapsed={collapsed}
            />
          </div>
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* Cluster selector (footer) */}
        <div className="px-2 py-2">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Select cluster"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/10">
                      <Network className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    {!collapsed && (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-medium">
                            {selectedCluster?.name || "No cluster"}
                          </p>
                          <p className="truncate text-[10px] text-sidebar-foreground/50">
                            {selectedCluster?.status || "Select a cluster"}
                          </p>
                        </div>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">
                  {selectedCluster?.name || "Select cluster"}
                </TooltipContent>
              )}
            </Tooltip>
            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align="start"
              className="w-[220px]"
            >
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Switch cluster
              </div>
              <DropdownMenuSeparator />
              {clusters.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No clusters available
                </div>
              ) : (
                clusters.map((cluster) => (
                  <DropdownMenuItem
                    key={cluster.id}
                    onClick={() => setSelectedClusterId(cluster.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{cluster.name}</span>
                    {cluster.id === selectedClusterId && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* User profile (footer) */}
        <div className="px-2 py-2">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="User menu"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/50",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {!collapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium">
                          {displayName}
                        </p>
                        <p className="truncate text-[10px] text-sidebar-foreground/50">
                          {email}
                        </p>
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">{displayName}</TooltipContent>
              )}
            </Tooltip>
            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align="start"
              className="w-[200px]"
            >
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

          {/* Collapse button when collapsed */}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="mt-1 h-7 w-full text-sidebar-foreground/50 hover:text-sidebar-foreground"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

// --- Sidebar item with tooltip in collapsed mode + active accent bar ---

function SidebarItem({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          className={cn(
            "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {/* Active accent bar on left side */}
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">{item.label}</TooltipContent>
      )}
    </Tooltip>
  );
}
