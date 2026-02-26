"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface GlowCardProps {
  children: React.ReactNode
  className?: string
  glowColor?: string
}

function GlowCard({
  children,
  className,
  glowColor = "oklch(0.65 0.24 260)",
}: GlowCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    card.style.setProperty("--glow-x", `${x}px`)
    card.style.setProperty("--glow-y", `${y}px`)
  }

  function handleMouseLeave() {
    const card = cardRef.current
    if (!card) return
    card.style.removeProperty("--glow-x")
    card.style.removeProperty("--glow-y")
  }

  return (
    <div
      ref={cardRef}
      data-slot="glow-card"
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm",
        "transition-shadow duration-300",
        className
      )}
      style={
        {
          "--glow-color": glowColor,
        } as React.CSSProperties
      }
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Glow effect layer */}
      <div
        className={cn(
          "pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300",
          "group-hover:opacity-100"
        )}
        style={{
          background: `radial-gradient(400px circle at var(--glow-x, 50%) var(--glow-y, 50%), var(--glow-color, ${glowColor}) / 15%, transparent 60%)`,
        }}
      />
      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  )
}

export { GlowCard }
export type { GlowCardProps }
