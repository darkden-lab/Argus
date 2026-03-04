"use client";

import { useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Eye,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentTask } from "@/stores/ai-chat";

interface TaskProgressProps {
  tasks: AgentTask[];
  onCancelTask: (taskId: string) => void;
}

export function TaskProgress({ tasks, onCancelTask }: TaskProgressProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "pending");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const failedTasks = tasks.filter((t) => t.status === "failed");
  const cancelledTasks = tasks.filter((t) => t.status === "cancelled");

  if (tasks.length === 0) return null;

  return (
    <div className="border-b border-border">
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          Tasks
          {activeTasks.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {activeTasks.length} active
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {activeTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-border bg-muted/30 p-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate flex-1">
                  {task.title}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onCancelTask(task.id)}
                  title="Cancel task"
                  aria-label="Cancel task"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {task.current_step && (
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  {task.current_step}
                </p>
              )}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Number.isFinite(task.progress) ? Math.min(100, Math.max(0, task.progress)) : 0}%` }}
                />
              </div>
              {task.total_steps > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground text-right">
                  {task.completed_steps}/{task.total_steps} steps
                </p>
              )}
            </div>
          ))}

          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-green-500/20 bg-green-500/5 px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="text-xs truncate flex-1">{task.title}</span>
                {task.result && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    title="View result"
                    aria-label="View result"
                    onClick={() => setExpandedResult(expandedResult === task.id ? null : task.id)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {expandedResult === task.id && task.result && (
                <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                  {task.result}
                </p>
              )}
            </div>
          ))}

          {failedTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-xs truncate flex-1">{task.title}</span>
              </div>
              {task.error && (
                <p className="mt-0.5 ml-6 text-[10px] text-destructive/80 truncate">
                  {task.error}
                </p>
              )}
            </div>
          ))}

          {cancelledTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
            >
              <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs truncate flex-1 text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
