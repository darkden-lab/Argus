import * as React from "react"
import { cn } from "@/lib/utils"

interface StatCardTrend {
  value: string
  direction: "up" | "down" | "neutral"
}

interface StatCardProps {
  icon: React.ReactNode
  value: string | number
  label: string
  trend?: StatCardTrend
  className?: string
}

const trendIcons: Record<StatCardTrend["direction"], string> = {
  up: "\u2191",
  down: "\u2193",
  neutral: "\u2192",
}

const trendColors: Record<StatCardTrend["direction"], string> = {
  up: "text-success",
  down: "text-destructive",
  neutral: "text-muted-foreground",
}

function StatCard({ icon, value, label, trend, className }: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "relative flex items-center gap-4 rounded-xl border px-4 py-3",
        "bg-card text-card-foreground shadow-sm",
        "dark:bg-card/60 dark:backdrop-blur-md dark:border-border/50",
        "transition-shadow duration-[var(--transition-fast)]",
        "hover:shadow-md",
        className
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight truncate">
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trendColors[trend.direction]
              )}
            >
              <span>{trendIcons[trend.direction]}</span>
              {trend.value}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
    </div>
  )
}

export { StatCard }
export type { StatCardProps, StatCardTrend }
