"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui";
import { useAiChatStore } from "@/stores/ai-chat";
import {
  allCommandGroups,
  type CommandGroup,
  type CommandItem,
} from "@/components/command-palette/command-groups";

interface UseCommandPaletteReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredGroups: CommandGroup[];
  executeCommand: (item: CommandItem) => void;
}

export function useCommandPalette(): UseCommandPaletteReturn {
  const router = useRouter();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openAiChat = useAiChatStore((s) => s.open);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset search term when palette closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
    }
  }, [open]);

  // Global keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const executeCommand = useCallback(
    (item: CommandItem) => {
      // If it has a custom action, run it
      if (item.action) {
        item.action();
        setOpen(false);
        return;
      }

      // If it is the AI assistant, open the chat
      if (item.id === "action-ai") {
        openAiChat();
        setOpen(false);
        return;
      }

      // Otherwise, navigate to the href
      if (item.href) {
        router.push(item.href);
        setOpen(false);
      }
    },
    [router, setOpen, openAiChat]
  );

  const filteredGroups = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return allCommandGroups;

    // If the user types "?" prefix, treat it as an AI query hint
    if (term.startsWith("?")) {
      const aiItem = allCommandGroups
        .flatMap((g) => g.items)
        .find((i) => i.id === "action-ai");
      if (aiItem) {
        return [
          {
            id: "ai-search",
            label: "AI Assistant",
            items: [
              {
                ...aiItem,
                description: `Ask: "${term.slice(1).trim()}"`,
              },
            ],
          },
        ];
      }
    }

    return allCommandGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchable = [
            item.label,
            item.description || "",
            ...(item.keywords || []),
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(term);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [searchTerm]);

  return {
    open,
    setOpen,
    searchTerm,
    setSearchTerm,
    filteredGroups,
    executeCommand,
  };
}
