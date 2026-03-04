"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClusterStore } from "@/stores/cluster";
import { api } from "@/lib/api";

interface ProjectSummary {
  name: string;
  namespaces: string[];
  workloads: number;
  podsRunning: number;
  podsTotal: number;
  health: string;
}

interface ProjectsResponse {
  projects: ProjectSummary[];
}

const MAX_VISIBLE = 6;

export function SidebarProjects({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const setSelectedProject = useClusterStore((s) => s.setSelectedProject);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!selectedClusterId) {
      setProjects([]);
      return;
    }
    api
      .get<ProjectsResponse>(
        `/api/clusters/${selectedClusterId}/projects`
      )
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]));
  }, [selectedClusterId]);

  if (collapsed || projects.length === 0) return null;

  const visible = projects.slice(0, MAX_VISIBLE);
  const hasMore = projects.length > MAX_VISIBLE;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Projects
      </button>

      {expanded && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {visible.map((project) => {
            const href = `/projects/${project.name}`;
            const isActive = pathname === href;

            return (
              <Link
                key={project.name}
                href={href}
                onClick={() => setSelectedProject(project.name)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{project.name}</span>
                <span
                  className={cn(
                    "ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
                    project.health === "healthy"
                      ? "bg-success"
                      : project.health === "degraded"
                        ? "bg-warning"
                        : "bg-muted-foreground"
                  )}
                />
              </Link>
            );
          })}

          {hasMore && (
            <Link
              href="/projects"
              className="block px-3 py-1 text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
            >
              View all &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
