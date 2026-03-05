"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, Users, Shield, Puzzle, KeyRound, ScrollText, Bell, Bot, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SettingsNavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

const settingsNavItems: SettingsNavItem[] = [
  { key: "profile", href: "/settings/profile", icon: User },
  { key: "users", href: "/settings/users", icon: Users },
  { key: "roles", href: "/settings/roles", icon: Shield },
  { key: "plugins", href: "/settings/plugins", icon: Puzzle },
  { key: "oidc", href: "/settings/oidc", icon: KeyRound },
  { key: "audit", href: "/settings/audit", icon: ScrollText },
  { key: "notifications", href: "/settings/notifications", icon: Bell },
  { key: "channels", href: "/settings/notification-channels", icon: Radio },
  { key: "ai", href: "/settings/ai", icon: Bot },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex gap-6">
        <nav className="flex w-48 shrink-0 flex-col gap-1">
          {settingsNavItems.map(({ key, href, icon: Icon }) => {
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
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
