"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  MessageSquare,
  Send,
  Webhook,
  Plus,
  Trash2,
  TestTube,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/stores/toast";
import { RBACGate } from "@/components/auth/rbac-gate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ChannelType } from "@/components/notifications/preferences-matrix";

interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: Record<string, string>;
  created_at: string;
}

const channelTypeConfig: Record<
  Exclude<ChannelType, "in_app">,
  { icon: typeof Mail; label: string; fields: { key: string; label: string; type: string; placeholder: string }[] }
> = {
  email: {
    icon: Mail,
    label: "Email (SMTP)",
    fields: [
      { key: "smtp_host", label: "SMTP Host", type: "text", placeholder: "smtp.example.com" },
      { key: "smtp_port", label: "SMTP Port", type: "text", placeholder: "587" },
      { key: "smtp_user", label: "Username", type: "text", placeholder: "user@example.com" },
      { key: "smtp_pass", label: "Password", type: "password", placeholder: "..." },
      { key: "from_address", label: "From Address", type: "email", placeholder: "noreply@example.com" },
    ],
  },
  slack: {
    icon: MessageSquare,
    label: "Slack",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/..." },
      { key: "channel", label: "Channel", type: "text", placeholder: "#alerts" },
    ],
  },
  teams: {
    icon: MessageSquare,
    label: "Microsoft Teams",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://outlook.office.com/webhook/..." },
    ],
  },
  telegram: {
    icon: Send,
    label: "Telegram",
    fields: [
      { key: "bot_token", label: "Bot Token", type: "text", placeholder: "123456:ABC-DEF..." },
      { key: "chat_id", label: "Chat ID", type: "text", placeholder: "-1001234567890" },
    ],
  },
  webhook: {
    icon: Webhook,
    label: "Generic Webhook",
    fields: [
      { key: "url", label: "Webhook URL", type: "url", placeholder: "https://api.example.com/webhook" },
      { key: "secret", label: "Secret (HMAC)", type: "password", placeholder: "Optional signing secret" },
    ],
  },
};

export default function NotificationChannelsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<Exclude<ChannelType, "in_app">>("email");
  const [formName, setFormName] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<NotificationChannel[]>("/api/notifications/channels")
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setFormType("email");
    setFormName("");
    setFormConfig({});
  }

  async function handleAdd() {
    setAdding(true);
    try {
      const created = await api.post<NotificationChannel>(
        "/api/notifications/channels",
        {
          name: formName,
          type: formType,
          config: formConfig,
        }
      );
      setChannels((prev) => [...prev, created]);
      setDialogOpen(false);
      resetForm();
      toast("Channel added", {
        description: `${formName} has been configured.`,
        variant: "success",
      });
    } catch {
      // handled by api
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/api/notifications/channels/${id}`);
      setChannels((prev) => prev.filter((c) => c.id !== id));
      toast("Channel removed", { variant: "success" });
    } catch {
      // handled by api
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await api.put(`/api/notifications/channels/${id}`, { enabled });
      setChannels((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enabled } : c))
      );
    } catch {
      // handled by api
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      await api.post(`/api/notifications/channels/${id}/test`);
      toast("Test sent", {
        description: "A test notification was sent through this channel.",
        variant: "success",
      });
    } catch {
      // handled by api
    } finally {
      setTestingId(null);
    }
  }

  const typeConfig = channelTypeConfig[formType];

  return (
    <RBACGate
      resource="notification_channels"
      action="write"
      fallback={
        <div className="text-center py-12 text-muted-foreground">
          You do not have permission to manage notification channels.
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Notification Channels
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure external delivery channels for notifications.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Notification Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Channel Type</Label>
                  <Select
                    value={formType}
                    onValueChange={(v) => {
                      setFormType(v as Exclude<ChannelType, "in_app">);
                      setFormConfig({});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(channelTypeConfig).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          {cfg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel-name">Display Name</Label>
                  <Input
                    id="channel-name"
                    placeholder="e.g., Production Alerts Slack"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                {typeConfig.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formConfig[field.key] || ""}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={adding || !formName}
                >
                  {adding ? "Adding..." : "Add Channel"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Webhook className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No channels configured
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add a channel to start sending notifications externally.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((channel) => {
              const cfg =
                channelTypeConfig[
                  channel.type as Exclude<ChannelType, "in_app">
                ];
              if (!cfg) return null;
              const Icon = cfg.icon;

              return (
                <Card key={channel.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm">
                          {channel.name}
                        </CardTitle>
                      </div>
                      <Switch
                        size="sm"
                        checked={channel.enabled}
                        onCheckedChange={(checked) =>
                          handleToggle(channel.id, !!checked)
                        }
                      />
                    </div>
                    <CardDescription className="text-xs">
                      {cfg.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={channel.enabled ? "default" : "secondary"}
                      >
                        {channel.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleTest(channel.id)}
                          disabled={testingId === channel.id || !channel.enabled}
                        >
                          {testingId === channel.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <TestTube className="mr-1 h-3 w-3" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteId(channel.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete Channel"
        description="Are you sure you want to delete this notification channel? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deletingId !== null}
        onConfirm={() => {
          if (confirmDeleteId) {
            handleDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
      />
    </RBACGate>
  );
}
