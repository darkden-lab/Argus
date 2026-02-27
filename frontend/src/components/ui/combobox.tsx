"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface ComboboxProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  loading?: boolean
  className?: string
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyMessage = "No results found.",
  loading = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

  // Keep input in sync with value when the popover is closed
  React.useEffect(() => {
    if (!open) {
      setInputValue(value)
    }
  }, [value, open])

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setInputValue(selectedValue)
    setOpen(false)
  }

  const handleInputChange = (newInputValue: string) => {
    setInputValue(newInputValue)
    onChange(newInputValue)
    if (!open) {
      setOpen(true)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-listbox"
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <CommandPrimitive
          shouldFilter={false}
          className="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
        >
          <div className="flex items-center border-b px-3">
            <CommandPrimitive.Input
              value={inputValue}
              onValueChange={handleInputChange}
              placeholder={placeholder}
              className="flex h-9 w-full rounded-md bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandPrimitive.List id="combobox-listbox" className="max-h-[200px] overflow-y-auto overflow-x-hidden p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {options
                  .filter((option) =>
                    option.toLowerCase().includes(inputValue.toLowerCase())
                  )
                  .length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {emptyMessage}
                  </p>
                )}
                {options
                  .filter((option) =>
                    option.toLowerCase().includes(inputValue.toLowerCase())
                  )
                  .map((option) => (
                    <CommandPrimitive.Item
                      key={option}
                      value={option}
                      onSelect={() => handleSelect(option)}
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          value === option ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option}
                    </CommandPrimitive.Item>
                  ))}
              </>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
