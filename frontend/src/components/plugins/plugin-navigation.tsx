"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Puzzle, Network, Activity, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePluginStore } from "@/stores/plugins";

// Maps icon string from manifest to a Lucide icon component
function PluginIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "network":
      return <Network className="h-4 w-4" />;
    case "activity":
      return <Activity className="h-4 w-4" />;
    case "shield":
      return <Shield className="h-4 w-4" />;
    default:
      return <Puzzle className="h-4 w-4" />;
  }
}

interface PluginNavigationProps {
  collapsed?: boolean;
}

export function PluginNavigation({ collapsed = false }: PluginNavigationProps) {
  const { plugins, fetchPlugins } = usePluginStore();
  const pathname = usePathname();

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Flatten all navigation items from all enabled plugins
  const navItems = plugins.flatMap((p) =>
    (p.frontend.navigation ?? []).map((nav) => ({
      label: nav.label,
      href: nav.path,
      icon: nav.icon,
      pluginId: p.id,
    }))
  );

  if (navItems.length === 0) return null;

  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="mb-1.5 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          <Puzzle className="h-3 w-3" />
          Plugins
        </p>
      )}
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
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
            <PluginIcon icon={item.icon} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
