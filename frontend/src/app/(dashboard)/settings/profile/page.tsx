"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  Lock,
  Sun,
  Moon,
  Monitor,
  Brain,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";

export default function ProfilePage() {
  const t = useTranslations("settings.profile");
  const user = useAuthStore((s) => s.user);
  const preferences = useAuthStore((s) => s.preferences);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const updatePreferences = useAuthStore((s) => s.updatePreferences);

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [savingPrefs, setSavingPrefs] = useState(false);
  const { setTheme } = useTheme();

  const isLocal = user?.auth_provider === "local";

  // Sync theme preference with ThemeProvider when preferences load
  useEffect(() => {
    if (preferences?.theme) {
      setTheme(preferences.theme as "dark" | "light" | "system");
    }
  }, [preferences?.theme, setTheme]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await updateProfile({ display_name: displayName });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (e: unknown) {
      setPasswordError(
        e instanceof Error ? e.message : "Failed to change password"
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function handlePrefChange(prefs: Parameters<typeof updatePreferences>[0]) {
    setSavingPrefs(true);
    try {
      // Apply theme change immediately for instant feedback
      if (prefs.theme) {
        setTheme(prefs.theme as "dark" | "light" | "system");
      }
      await updatePreferences(prefs);
    } finally {
      setSavingPrefs(false);
    }
  }

  const theme = preferences?.theme ?? "system";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>{t("account")}</CardTitle>
          <CardDescription>{t("account_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar user={user} size="xl" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{user?.display_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {user?.auth_provider} account
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <div>
              <Label htmlFor="display-name">{t("display_name")}</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" value={user?.email ?? ""} disabled />
              {!isLocal && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("email_oidc_note")}
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile || displayName === user?.display_name}
            size="sm"
          >
            {savingProfile ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : profileSaved ? (
              <Check className="h-4 w-4 mr-1" />
            ) : null}
            {profileSaved ? t("saved") : t("save")}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      {isLocal && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t("security")}
            </CardTitle>
            <CardDescription>{t("security_description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="current-pw">{t("current_password")}</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-pw">{t("new_password")}</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
              size="sm"
            >
              {savingPassword ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : passwordSaved ? (
                <Check className="h-4 w-4 mr-1" />
              ) : null}
              {passwordSaved ? t("password_changed") : t("change_password")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>{t("preferences")}</CardTitle>
          <CardDescription>
            {t("preferences_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme */}
          <div className="space-y-2">
            <Label>{t("theme")}</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "system", icon: Monitor, labelKey: "theme_system" },
                  { value: "light", icon: Sun, labelKey: "theme_light" },
                  { value: "dark", icon: Moon, labelKey: "theme_dark" },
                ] as const
              ).map(({ value, icon: Icon, labelKey }) => (
                <Button
                  key={value}
                  variant={theme === value ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    handlePrefChange({ theme: value })
                  }
                  disabled={savingPrefs}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </div>

          {/* Sidebar compact */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("sidebar_compact")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("sidebar_compact_description")}
              </p>
            </div>
            <Switch
              checked={preferences?.sidebar_compact ?? false}
              onCheckedChange={(checked) =>
                handlePrefChange({ sidebar_compact: checked })
              }
              disabled={savingPrefs}
            />
          </div>

          {/* Animations */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("animations")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("animations_description")}
              </p>
            </div>
            <Switch
              checked={preferences?.animations_enabled ?? true}
              onCheckedChange={(checked) =>
                handlePrefChange({ animations_enabled: checked })
              }
              disabled={savingPrefs}
            />
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
          <CardDescription>{t("language_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences?.language ?? "en"}
            onValueChange={(v) => handlePrefChange({ language: v })}
            disabled={savingPrefs}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("language_en")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* AI Memories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            {t("ai_memories")}
          </CardTitle>
          <CardDescription>
            {t("ai_memories_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/ai/memories">
              {t("manage_ai_memories")}
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
