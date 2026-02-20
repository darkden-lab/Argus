"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Settings,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RBACGate } from "@/components/auth/rbac-gate";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface SidebarProps {
  navItems?: NavItem[];
}

interface NavSection {
  title: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ReactNode;
  }>;
  rbac?: { resource: string; action: string };
}

const defaultNavSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      {
        label: "Clusters",
        href: "/clusters",
        icon: <Server className="h-4 w-4" />,
      },
      {
        label: "Terminal",
        href: "/terminal",
        icon: <TerminalSquare className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Configuration",
    rbac: { resource: "settings", action: "read" },
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: <Settings className="h-4 w-4" />,
      },
    ],
  },
];

export function Sidebar({ navItems = [] }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">
            Argus
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {defaultNavSections.map((section) => {
          const content = (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );

          if (section.rbac) {
            return (
              <RBACGate
                key={section.title}
                resource={section.rbac.resource}
                action={section.rbac.action}
              >
                {content}
              </RBACGate>
            );
          }

          return content;
        })}

        {/* Dynamic Plugins Section */}
        {navItems.length > 0 && (
          <div className="mb-4">
            <Separator className="mb-3 bg-sidebar-border" />
            {!collapsed && (
              <p className="mb-1.5 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                <Puzzle className="h-3 w-3" />
                Plugins
              </p>
            )}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon || <Puzzle className="h-4 w-4" />}
                  {!collapsed && (
                    <span className="flex flex-1 items-center justify-between">
                      {item.label}
                      {item.badge && (
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px] px-1.5 py-0"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <Separator className="bg-sidebar-border" />
      <div className="flex items-center justify-center p-3">
        {!collapsed && (
          <span className="text-[10px] text-sidebar-foreground/40">
            v0.1.0
          </span>
        )}
      </div>
    </aside>
  );
}
