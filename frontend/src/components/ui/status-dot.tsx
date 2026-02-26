"use client"

import { cn } from "@/lib/utils"

type StatusType = "healthy" | "warning" | "error" | "info" | "unknown"
type SizeType = "sm" | "md" | "lg"

interface StatusDotProps {
  status: StatusType
  size?: SizeType
  pulse?: boolean
  className?: string
}

const statusColors: Record<StatusType, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  info: "bg-info",
  unknown: "bg-muted-foreground",
}

const pulseColors: Record<StatusType, string> = {
  healthy: "bg-success/60",
  warning: "bg-warning/60",
  error: "bg-destructive/60",
  info: "bg-info/60",
  unknown: "bg-muted-foreground/60",
}

const sizeMap: Record<SizeType, { dot: string; pulse: string }> = {
  sm: { dot: "h-1.5 w-1.5", pulse: "h-1.5 w-1.5" },
  md: { dot: "h-2.5 w-2.5", pulse: "h-2.5 w-2.5" },
  lg: { dot: "h-3.5 w-3.5", pulse: "h-3.5 w-3.5" },
}

function StatusDot({
  status,
  size = "md",
  pulse = true,
  className,
}: StatusDotProps) {
  const { dot, pulse: pulseSize } = sizeMap[size]

  return (
    <span
      data-slot="status-dot"
      data-status={status}
      className={cn("relative inline-flex shrink-0", dot, className)}
    >
      {pulse && status !== "unknown" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full animate-ping",
            pulseColors[status],
            pulseSize
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full",
          statusColors[status],
          dot
        )}
      />
    </span>
  )
}

export { StatusDot }
export type { StatusDotProps, StatusType, SizeType }
