"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Shield,
  KeyRound,
  Bell,
  Send,
  Brain,
  Puzzle,
  ClipboardList,
} from "lucide-react";

const settingsSections = [
  {
    label: "Users",
    description: "Manage user accounts and access",
    href: "/settings/users",
    icon: Users,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    label: "Roles & Permissions",
    description: "Configure RBAC roles and policies",
    href: "/settings/roles",
    icon: Shield,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    label: "OIDC / SSO",
    description: "Single sign-on and identity provider",
    href: "/settings/oidc",
    icon: KeyRound,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    label: "Notification Rules",
    description: "Configure alerts and notification triggers",
    href: "/settings/notifications",
    icon: Bell,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    label: "Notification Channels",
    description: "Email, Slack, Teams, Telegram, Webhook",
    href: "/settings/notification-channels",
    icon: Send,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
  {
    label: "AI Assistant",
    description: "LLM provider, model, and RAG settings",
    href: "/settings/ai",
    icon: Brain,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
  },
  {
    label: "Plugins",
    description: "Enable and configure cluster plugins",
    href: "/settings/plugins",
    icon: Puzzle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    label: "Audit Log",
    description: "Review system activity and changes",
    href: "/settings/audit",
    icon: ClipboardList,
    color: "text-slate-500",
    bg: "bg-slate-500/10",
  },
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your Argus instance configuration.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {settingsSections.map((section) => (
          <Card
            key={section.href}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
            onClick={() => router.push(section.href)}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${section.bg}`}
                >
                  <section.icon className={`h-5 w-5 ${section.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{section.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
