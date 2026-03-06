"use client";

import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BreadcrumbNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function BreadcrumbNav({ currentPath, onNavigate }: BreadcrumbNavProps) {
  const segments = currentPath.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 shrink-0"
        onClick={() => onNavigate("/")}
      >
        <Home className="h-3.5 w-3.5" />
      </Button>
      {segments.map((segment, i) => {
        const path = "/" + segments.slice(0, i + 1).join("/");
        return (
          <span key={path} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onNavigate(path)}
            >
              {segment}
            </Button>
          </span>
        );
      })}
    </nav>
  );
}
