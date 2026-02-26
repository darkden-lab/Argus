import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressStep {
  label: string
  description?: string
}

interface ProgressStepsProps {
  steps: ProgressStep[]
  currentStep: number
  className?: string
}

function ProgressSteps({ steps, currentStep, className }: ProgressStepsProps) {
  return (
    <div
      data-slot="progress-steps"
      className={cn("flex w-full items-start", className)}
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isUpcoming = index > currentStep
        const isLast = index === steps.length - 1

        return (
          <div
            key={index}
            className={cn(
              "flex flex-1 items-start",
              isLast && "flex-none"
            )}
          >
            <div className="flex flex-col items-center gap-1.5">
              {/* Step circle */}
              <div
                data-state={
                  isCompleted ? "completed" : isCurrent ? "current" : "upcoming"
                }
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-[var(--transition-spring)]",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-primary bg-primary/10 text-primary",
                  isUpcoming &&
                    "border-muted-foreground/30 bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {/* Step label */}
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span
                  className={cn(
                    "text-xs font-medium leading-tight",
                    isCurrent && "text-primary",
                    isCompleted && "text-foreground",
                    isUpcoming && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="text-[10px] text-muted-foreground leading-tight max-w-[100px]">
                    {step.description}
                  </span>
                )}
              </div>
            </div>
            {/* Connecting line */}
            {!isLast && (
              <div className="mt-4 flex-1 px-2">
                <div
                  className={cn(
                    "h-0.5 w-full rounded-full transition-colors duration-[var(--transition-fast)]",
                    isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { ProgressSteps }
export type { ProgressStepsProps, ProgressStep }
