"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
}

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  loading = false,
  disabled = false,
  className,
  allowCustomValue = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
    );
  }, [options, search]);

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  const selectedLabel =
    options.find((o) => o.value === value)?.label || value || "";

  function select(val: string) {
    onValueChange(val);
    setOpen(false);
    setSearch("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        select(filtered[highlightIndex].value);
      } else if (allowCustomValue && search.trim()) {
        select(search.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </span>
          ) : selectedLabel ? (
            <span className="truncate">{selectedLabel}</span>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2" onKeyDown={handleKeyDown}>
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div
          ref={listRef}
          className="max-h-[200px] overflow-y-auto px-1 pb-1"
          role="listbox"
        >
          {filtered.length === 0 && !loading && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {allowCustomValue && search.trim()
                ? `Press Enter to use "${search.trim()}"`
                : emptyMessage}
            </p>
          )}
          {filtered.map((option, i) => (
            <button
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-none",
                i === highlightIndex && "bg-accent text-accent-foreground",
                option.value === value && "font-medium"
              )}
              onClick={() => select(option.value)}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  option.value === value ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex flex-col items-start">
                <span>{option.label}</span>
                {option.description && (
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
export type { ComboboxProps };
