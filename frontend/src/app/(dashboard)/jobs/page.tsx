"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useJobs } from "@/hooks/use-jobs";
import { useClusterSelection } from "@/hooks/use-cluster-selection";
import { ClusterSelector } from "@/components/layout/cluster-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import {
  getStatusDot,
  truncateImage,
  formatAge,
  type CompositeJob,
} from "@/lib/abstractions";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Plus,
  Search,
  Timer,
} from "lucide-react";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "suspended", label: "Suspended" },
];

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "success" | "warning" | "outline" {
  switch (status) {
    case "completed":
      return "success";
    case "active":
      return "warning";
    case "failed":
      return "destructive";
    case "scheduled":
      return "secondary";
    case "suspended":
      return "outline";
    default:
      return "secondary";
  }
}

function JobCard({
  job,
  onClick,
}: {
  job: CompositeJob;
  onClick?: () => void;
}) {
  const dotStatus = getStatusDot(job.status);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:border-primary/50",
        "py-4"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={dotStatus} size="md" />
            <CardTitle className="text-sm truncate">{job.name}</CardTitle>
          </div>
          <Badge
            variant={getStatusBadgeVariant(job.status)}
            className="shrink-0 text-[10px]"
          >
            {job.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="text-xs text-muted-foreground">{job.namespace}</div>

        {/* Schedule (CronJob) */}
        {job.schedule && (
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono">{job.schedule}</span>
          </div>
        )}

        {/* Last run */}
        {job.lastRun && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Last run: {formatAge(job.lastRun)} ago</span>
          </div>
        )}

        {/* Completions */}
        <div className="flex items-center gap-1.5 text-xs">
          {job.completions.succeeded > 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>
            Completions: {job.completions.succeeded}/{job.completions.total}
          </span>
        </div>

        {/* Image */}
        {job.image && (
          <div className="text-xs text-muted-foreground font-mono truncate">
            {truncateImage(job.image)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const {
    clusters,
    selectedClusterId,
    setSelectedClusterId,
    loading: clustersLoading,
  } = useClusterSelection();
  const { jobs, loading, error } = useJobs(selectedClusterId || null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = jobs;

    if (statusFilter !== "all") {
      result = result.filter((j) => j.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.namespace.toLowerCase().includes(q)
      );
    }

    return result;
  }, [jobs, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground">
            View and manage Jobs and CronJobs across your clusters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ClusterSelector
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClusterChange={setSelectedClusterId}
            loading={clustersLoading}
          />
          <Button size="sm" disabled>
            <Plus className="mr-1.5 h-4 w-4" />
            Create Job
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <Badge
              key={filter.value}
              variant={statusFilter === filter.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading || clustersLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading jobs...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>Failed to load jobs: {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Timer className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">No jobs found</p>
          <p className="text-sm">
            {search || statusFilter !== "all"
              ? "Try adjusting your filters."
              : "No Jobs or CronJobs detected in this cluster."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {jobs.length} job(s)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() =>
                  router.push(
                    `/jobs/${encodeURIComponent(job.name)}?cluster=${selectedClusterId}&namespace=${encodeURIComponent(job.namespace)}&type=${job.cronJob ? "cronjob" : "job"}`
                  )
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
