"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardSkeleton } from "@/components/skeletons";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Search, FolderOpen, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSummary {
  name: string;
  namespaces: string[];
  workloads: number;
  podsRunning: number;
  podsTotal: number;
  health: "healthy" | "degraded" | "unknown";
}

interface ProjectsResponse {
  projects: ProjectSummary[];
}

const healthConfig = {
  healthy: { variant: "success" as const, label: "Healthy" },
  degraded: { variant: "warning" as const, label: "Degraded" },
  unknown: { variant: "secondary" as const, label: "Unknown" },
};

export default function ProjectsPage() {
  const router = useRouter();
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);
  const setSelectedProject = useClusterStore((s) => s.setSelectedProject);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function fetchProjects() {
    if (!selectedClusterId) return;
    setLoading(true);
    setError(null);
    api
      .get<ProjectsResponse>(
        `/api/clusters/${selectedClusterId}/projects`
      )
      .then((data) => setProjects(data.projects || []))
      .catch((err) => setError(err.message || "Failed to load projects"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClusterId]);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.namespaces.some((ns) => ns.toLowerCase().includes(q))
    );
  }, [projects, search]);

  if (!selectedClusterId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-sm font-medium">No cluster selected</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a cluster to view projects.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Logical groupings of workloads across namespaces.
          </p>
        </div>
        <CreateProjectDialog onCreated={fetchProjects} />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={fetchProjects}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium">No projects found</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Add the label{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              argus.darkden.net/projects=my-project
            </code>{" "}
            to your namespaces or workloads to group them into projects.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                onClick={() => {
                  setSelectedProject(project.name);
                  router.push(`/projects/${project.name}`);
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {projects.length} project(s)
          </p>
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}) {
  const { variant, label } = healthConfig[project.health];
  const podPercent =
    project.podsTotal > 0
      ? Math.round((project.podsRunning / project.podsTotal) * 100)
      : 0;
  const visibleNs = project.namespaces.slice(0, 3);
  const extraNs = project.namespaces.length - 3;

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{project.name}</CardTitle>
          <Badge variant={variant}>{label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{project.namespaces.length} namespace(s)</span>
          <span>{project.workloads} workload(s)</span>
        </div>

        {/* Pod progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pods</span>
            <span className="font-medium">
              {project.podsRunning}/{project.podsTotal}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                podPercent === 100 ? "bg-success" : podPercent > 0 ? "bg-warning" : "bg-muted-foreground"
              )}
              style={{ width: `${podPercent}%` }}
            />
          </div>
        </div>

        {/* Namespace badges */}
        <div className="flex flex-wrap gap-1">
          {visibleNs.map((ns) => (
            <Badge key={ns} variant="outline" className="text-[10px]">
              {ns}
            </Badge>
          ))}
          {extraNs > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              +{extraNs}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
