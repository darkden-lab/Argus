"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user: { email?: string; display_name?: string; id?: string } | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-20 w-20",
};

const textSizes = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-base",
  xl: "text-2xl",
};

async function sha256Hex(str: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(str.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getInitials(displayName?: string, email?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(" ");
    if (parts.length >= 2)
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return displayName[0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

function getAvatarColor(seed?: string): string {
  if (!seed) return "hsl(260, 50%, 50%)";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 45%)`;
}

function useGravatarUrl(email?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!email) return;
    sha256Hex(email).then((hash) => {
      setUrl(`https://gravatar.com/avatar/${hash}?d=404&s=200`);
    });
  }, [email]);
  return url;
}

export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  const gravatarUrl = useGravatarUrl(user?.email);
  const initials = getInitials(user?.display_name, user?.email);
  const bgColor = getAvatarColor(user?.id ?? user?.email);

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {gravatarUrl && (
        <AvatarImage src={gravatarUrl} alt={user?.display_name ?? "User"} />
      )}
      <AvatarFallback
        className={textSizes[size]}
        style={{ backgroundColor: bgColor, color: "white" }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
