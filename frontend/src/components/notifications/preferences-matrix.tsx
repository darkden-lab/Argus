"use client";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NotificationCategory } from "@/stores/notifications";

export type ChannelType = "in_app" | "email" | "slack" | "teams" | "telegram" | "webhook";
export type Frequency = "instant" | "hourly" | "daily" | "weekly" | "off";

export interface PreferenceEntry {
  category: NotificationCategory;
  channel: ChannelType;
  enabled: boolean;
  frequency: Frequency;
}

interface PreferencesMatrixProps {
  preferences: PreferenceEntry[];
  channels: ChannelType[];
  onToggle: (category: NotificationCategory, channel: ChannelType, enabled: boolean) => void;
  onFrequencyChange: (category: NotificationCategory, channel: ChannelType, frequency: Frequency) => void;
  disabled?: boolean;
}

const categoryLabels: Record<NotificationCategory, string> = {
  cluster: "Cluster Events",
  deployment: "Deployments",
  security: "Security Alerts",
  system: "System",
  health: "Health Checks",
};

const channelLabels: Record<ChannelType, string> = {
  in_app: "In-App",
  email: "Email",
  slack: "Slack",
  teams: "Teams",
  telegram: "Telegram",
  webhook: "Webhook",
};

const frequencyLabels: Record<Frequency, string> = {
  instant: "Instant",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  off: "Off",
};

const categories: NotificationCategory[] = [
  "cluster",
  "deployment",
  "security",
  "system",
  "health",
];

function findPreference(
  preferences: PreferenceEntry[],
  category: NotificationCategory,
  channel: ChannelType
): PreferenceEntry | undefined {
  return preferences.find(
    (p) => p.category === category && p.channel === channel
  );
}

export function PreferencesMatrix({
  preferences,
  channels,
  onToggle,
  onFrequencyChange,
  disabled = false,
}: PreferencesMatrixProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Category</TableHead>
            {channels.map((ch) => (
              <TableHead key={ch} className="text-center min-w-[120px]">
                {channelLabels[ch]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category}>
              <TableCell className="font-medium">
                {categoryLabels[category]}
              </TableCell>
              {channels.map((channel) => {
                const pref = findPreference(preferences, category, channel);
                const enabled = pref?.enabled ?? false;
                const frequency = pref?.frequency ?? "instant";

                return (
                  <TableCell key={channel} className="text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <Switch
                        size="sm"
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          onToggle(category, channel, !!checked)
                        }
                        disabled={disabled}
                      />
                      {enabled && channel !== "in_app" && (
                        <Select
                          value={frequency}
                          onValueChange={(val) =>
                            onFrequencyChange(
                              category,
                              channel,
                              val as Frequency
                            )
                          }
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-6 w-[80px] text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(frequencyLabels).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
