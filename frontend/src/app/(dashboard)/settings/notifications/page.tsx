"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/stores/toast";
import {
  PreferencesMatrix,
  type PreferenceEntry,
  type ChannelType,
  type Frequency,
} from "@/components/notifications/preferences-matrix";
import type { NotificationCategory } from "@/stores/notifications";

interface PreferencesResponse {
  preferences: PreferenceEntry[];
  available_channels: ChannelType[];
}

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<PreferenceEntry[]>([]);
  const [channels, setChannels] = useState<ChannelType[]>(["in_app"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<PreferencesResponse>("/api/notifications/preferences")
      .then((data) => {
        setPreferences(data.preferences);
        setChannels(
          data.available_channels.length > 0
            ? data.available_channels
            : ["in_app"]
        );
      })
      .catch(() => {
        // Use defaults if API not ready
        setPreferences(buildDefaultPreferences(["in_app"]));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(
    (category: NotificationCategory, channel: ChannelType, enabled: boolean) => {
      setPreferences((prev) => {
        const existing = prev.find(
          (p) => p.category === category && p.channel === channel
        );
        if (existing) {
          return prev.map((p) =>
            p.category === category && p.channel === channel
              ? { ...p, enabled }
              : p
          );
        }
        return [
          ...prev,
          { category, channel, enabled, frequency: "instant" as Frequency },
        ];
      });
    },
    []
  );

  const handleFrequencyChange = useCallback(
    (category: NotificationCategory, channel: ChannelType, frequency: Frequency) => {
      setPreferences((prev) =>
        prev.map((p) =>
          p.category === category && p.channel === channel
            ? { ...p, frequency }
            : p
        )
      );
    },
    []
  );

  async function handleSave() {
    setSaving(true);
    try {
      await api.put("/api/notifications/preferences", { preferences });
      toast("Preferences saved", {
        description: "Your notification preferences have been updated.",
        variant: "success",
      });
    } catch {
      // Error already handled by api client
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Choose how you want to be notified for each event category.
            Toggle channels on/off and set delivery frequency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PreferencesMatrix
            preferences={preferences}
            channels={channels}
            onToggle={handleToggle}
            onFrequencyChange={handleFrequencyChange}
            disabled={saving}
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildDefaultPreferences(channels: ChannelType[]): PreferenceEntry[] {
  const categories: NotificationCategory[] = [
    "cluster",
    "deployment",
    "security",
    "system",
    "health",
  ];
  const prefs: PreferenceEntry[] = [];
  for (const category of categories) {
    for (const channel of channels) {
      prefs.push({
        category,
        channel,
        enabled: channel === "in_app",
        frequency: "instant",
      });
    }
  }
  return prefs;
}
