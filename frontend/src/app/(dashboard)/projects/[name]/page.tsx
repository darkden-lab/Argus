"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton } from "@/components/skeletons";
import {
  ArrowLeft,
  Layers,
  Box,
  Container,
  Globe,
  RefreshCw,
} from "lucide-react";

interface ProjectResource {
  kind: string;
  name: string;
  namespace: string;
}

interface ProjectDetail {
  name: string;
  namespaces: string[];
  resources: ProjectResource[];
}

const healthConfig = {
  healthy: { variant: "success" as const, label: "Healthy" },
  degraded: { variant: "warning" as const, label: "Degraded" },
  unknown: { variant: "secondary" as const, label: "Unknown" },
};

export default function ProjectDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchProject() {
    if (!selectedClusterId || !params.name) return;
    setLoading(true);
    setError(null);
    api
      .get<ProjectDetail>(
        `/api/clusters/${selectedClusterId}/projects/${params.name}`
      )
      .then(setProject)
      .catch((err) => setError(err.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClusterId, params.name]);

  if (!selectedClusterId) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No cluster selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={fetchProject}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!project) return null;

  const deployments = project.resources.filter((r) => r.kind === "Deployment");
  const statefulSets = project.resources.filter(
    (r) => r.kind === "StatefulSet"
  );
  const services = project.resources.filter((r) => r.kind === "Service");
  const workloadCount = deployments.length + statefulSets.length;

  // Determine health from resource presence
  const health = workloadCount > 0 ? "healthy" : "unknown";
  const { variant, label } = healthConfig[health];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {project.name}
          </h1>
          <Badge variant={variant}>{label}</Badge>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          value={project.namespaces.length}
          label="Namespaces"
        />
        <StatCard
          icon={<Box className="h-5 w-5" />}
          value={workloadCount}
          label="Workloads"
        />
        <StatCard
          icon={<Container className="h-5 w-5" />}
          value={deployments.length}
          label="Deployments"
        />
        <StatCard
          icon={<Globe className="h-5 w-5" />}
          value={services.length}
          label="Services"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">
            Deployments ({deployments.length})
          </TabsTrigger>
          <TabsTrigger value="statefulsets">
            StatefulSets ({statefulSets.length})
          </TabsTrigger>
          <TabsTrigger value="services">
            Services ({services.length})
          </TabsTrigger>
          <TabsTrigger value="namespaces">
            Namespaces ({project.namespaces.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deployments">
          <ResourceList resources={deployments} emptyMessage="No deployments in this project." />
        </TabsContent>

        <TabsContent value="statefulsets">
          <ResourceList resources={statefulSets} emptyMessage="No StatefulSets in this project." />
        </TabsContent>

        <TabsContent value="services">
          <ResourceList resources={services} emptyMessage="No services in this project." />
        </TabsContent>

        <TabsContent value="namespaces">
          {project.namespaces.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No namespaces associated.
            </p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">
                      Namespace
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.namespaces.map((ns) => (
                    <tr key={ns} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Badge variant="outline">{ns}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResourceList({
  resources,
  emptyMessage,
}: {
  resources: ProjectResource[];
  emptyMessage: string;
}) {
  if (resources.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="px-4 py-2 text-left font-medium">Namespace</th>
            <th className="px-4 py-2 text-left font-medium">Kind</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={`${r.kind}-${r.namespace}-${r.name}`} className="border-b last:border-0">
              <td className="px-4 py-2 font-medium">{r.name}</td>
              <td className="px-4 py-2">
                <Badge variant="outline" className="text-[10px]">
                  {r.namespace}
                </Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
