"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface CommandItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  onSelect: () => void
}

interface CommandGroup {
  heading: string
  items: CommandItem[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: CommandGroup[]
}

function CommandPalette({ open, onOpenChange, groups }: CommandPaletteProps) {
  const [search, setSearch] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Filter groups based on search
  const filteredGroups = React.useMemo(() => {
    if (!search.trim()) return groups

    const query = search.toLowerCase()
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, search])

  // Flat list for keyboard navigation
  const flatItems = React.useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups]
  )

  // Reset state on open/close and search change
  React.useEffect(() => {
    if (open) {
      setSearch("")
      setActiveIndex(0)
    }
  }, [open])

  React.useEffect(() => {
    setActiveIndex(0)
  }, [search])

  // Global keyboard shortcut
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // Scroll active item into view
  React.useEffect(() => {
    if (!listRef.current) return
    const activeElement = listRef.current.querySelector(
      `[data-index="${activeIndex}"]`
    )
    if (activeElement) {
      activeElement.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((prev) =>
          prev < flatItems.length - 1 ? prev + 1 : 0
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : flatItems.length - 1
        )
        break
      case "Enter":
        e.preventDefault()
        if (flatItems[activeIndex]) {
          flatItems[activeIndex].onSelect()
          onOpenChange(false)
        }
        break
      case "Escape":
        e.preventDefault()
        onOpenChange(false)
        break
    }
  }

  let itemCounter = 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex items-center border-b px-3">
          <svg
            className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>
        <div
          ref={listRef}
          className="max-h-[300px] overflow-y-auto p-2"
          role="listbox"
        >
          {filteredGroups.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.heading} className="mb-2 last:mb-0">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {group.heading}
              </div>
              {group.items.map((item) => {
                const currentIndex = itemCounter++
                const isActive = currentIndex === activeIndex

                return (
                  <button
                    key={item.id}
                    data-index={currentIndex}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent/50"
                    )}
                    onClick={() => {
                      item.onSelect()
                      onOpenChange(false)
                    }}
                    onMouseEnter={() => setActiveIndex(currentIndex)}
                  >
                    {item.icon && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate text-left">
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <kbd className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
                        {item.shortcut.split("+").map((key, i) => (
                          <span
                            key={i}
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px]"
                          >
                            {key}
                          </span>
                        ))}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { CommandPalette }
export type { CommandPaletteProps, CommandGroup, CommandItem }
