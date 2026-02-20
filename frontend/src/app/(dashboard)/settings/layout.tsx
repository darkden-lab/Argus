"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Shield, Puzzle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsNav = [
  { label: "Users", href: "/settings/users", icon: Users },
  { label: "Roles", href: "/settings/roles", icon: Shield },
  { label: "Plugins", href: "/settings/plugins", icon: Puzzle },
  { label: "OIDC", href: "/settings/oidc", icon: KeyRound },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage users, roles, plugins, and authentication.
        </p>
      </div>

      <div className="flex gap-6">
        <nav className="flex w-48 shrink-0 flex-col gap-1">
          {settingsNav.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
