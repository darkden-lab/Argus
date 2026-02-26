"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/hooks/use-command-palette";
import type { CommandItem } from "./command-groups";

export function CommandPalette() {
  const {
    open,
    setOpen,
    searchTerm,
    setSearchTerm,
    filteredGroups,
    executeCommand,
  } = useCommandPalette();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Flatten all visible items for keyboard navigation
  const allItems = filteredGroups.flatMap((g) => g.items);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      // Small delay to ensure the dialog is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < allItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : allItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex]) {
            executeCommand(allItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [allItems, selectedIndex, executeCommand, setOpen]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  let itemIndex = 0;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative mx-auto mt-[20vh] w-full max-w-lg">
        <div
          className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search commands, pages, clusters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2">
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id} className="mb-1">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const currentIndex = itemIndex++;
                    return (
                      <CommandItemRow
                        key={item.id}
                        item={item}
                        isSelected={currentIndex === selectedIndex}
                        dataIndex={currentIndex}
                        onSelect={() => executeCommand(item)}
                        onHover={() => setSelectedIndex(currentIndex)}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                ↵
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                ?
              </kbd>
              AI search
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandItemRow({
  item,
  isSelected,
  dataIndex,
  onSelect,
  onHover,
}: {
  item: CommandItem;
  isSelected: boolean;
  dataIndex: number;
  onSelect: () => void;
  onHover: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      data-index={dataIndex}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-accent/50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{item.label}</div>
        {item.description && (
          <div className="truncate text-xs text-muted-foreground">
            {item.description}
          </div>
        )}
      </div>
      {item.shortcut && (
        <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.shortcut}
        </kbd>
      )}
    </button>
  );
}
