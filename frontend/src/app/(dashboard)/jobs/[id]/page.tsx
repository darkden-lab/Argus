"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  compositeJobs,
  type CompositeJob,
  type K8sCronJob,
  type K8sJob,
  getStatusDot,
  formatAge,
} from "@/lib/abstractions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

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

function getJobRunStatusBadge(job: K8sJob) {
  if (job.status?.succeeded) return { label: "Succeeded", variant: "success" as const };
  if (job.status?.failed) return { label: "Failed", variant: "destructive" as const };
  if (job.status?.active) return { label: "Running", variant: "warning" as const };
  return { label: "Unknown", variant: "secondary" as const };
}

export default function JobDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const jobName = decodeURIComponent(params.id as string);
  const clusterId = searchParams.get("cluster") ?? "";
  const namespace = searchParams.get("namespace") ?? "default";

  const [compositeJob, setCompositeJob] = useState<CompositeJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const [cronJobsRes, jobsRes] = await Promise.allSettled([
        api.get<{ items: K8sCronJob[] }>(
          `/api/clusters/${clusterId}/resources/batch/v1/cronjobs?namespace=${namespace}`
        ),
        api.get<{ items: K8sJob[] }>(
          `/api/clusters/${clusterId}/resources/batch/v1/jobs?namespace=${namespace}`
        ),
      ]);

      const cronJobs =
        cronJobsRes.status === "fulfilled"
          ? cronJobsRes.value.items ?? []
          : [];
      const rawJobs =
        jobsRes.status === "fulfilled" ? jobsRes.value.items ?? [] : [];

      const allJobs = compositeJobs(cronJobs, rawJobs);
      const found = allJobs.find((j) => j.name === jobName);

      if (found) {
        setCompositeJob(found);
      } else {
        setError("Job not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, jobName]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading job details...</span>
        </div>
      </div>
    );
  }

  if (error || !compositeJob) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/jobs")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Jobs
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>{error ?? "Job not found"}</p>
        </div>
      </div>
    );
  }

  const dotStatus = getStatusDot(compositeJob.status);
  const isCronJob = !!compositeJob.cronJob;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/jobs")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Jobs
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={dotStatus} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {compositeJob.name}
              </h1>
              <Badge variant="outline" className="text-[10px]">
                {isCronJob ? "CronJob" : "Job"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {compositeJob.namespace} -- Created{" "}
              {formatAge(compositeJob.createdAt)} ago
            </p>
          </div>
          <Badge
            variant={getStatusBadgeVariant(compositeJob.status)}
            className="ml-2"
          >
            {compositeJob.status}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchJob}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Run History</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Schedule */}
            {isCronJob && compositeJob.schedule && (
              <Card className="py-4">
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm">Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="text-xl font-bold font-mono">
                      {compositeJob.schedule}
                    </span>
                  </div>
                  {compositeJob.cronJob?.spec?.suspend && (
                    <Badge variant="outline" className="mt-2">
                      Suspended
                    </Badge>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Last Run */}
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Last Run</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-lg font-medium">
                    {compositeJob.lastRun
                      ? `${formatAge(compositeJob.lastRun)} ago`
                      : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Completions */}
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Completions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">
                    {compositeJob.completions.succeeded}
                  </span>
                  <span className="text-muted-foreground">
                    / {compositeJob.completions.total} runs
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Image */}
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Container Image</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm break-all">
                  {compositeJob.image || "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="space-y-4">
          <Card className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">
                Run History ({compositeJob.jobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {compositeJob.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No job runs recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {compositeJob.jobs
                    .sort((a, b) => {
                      const ta = a.metadata.creationTimestamp ?? "";
                      const tb = b.metadata.creationTimestamp ?? "";
                      return tb.localeCompare(ta);
                    })
                    .map((job, i) => {
                      const runStatus = getJobRunStatusBadge(job);
                      return (
                        <div
                          key={job.metadata.uid ?? i}
                          className="flex items-center justify-between rounded-md border p-3 text-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {runStatus.label === "Succeeded" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : runStatus.label === "Failed" ? (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            ) : (
                              <Play className="h-4 w-4 text-yellow-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {job.metadata.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Started:{" "}
                                {job.status?.startTime
                                  ? formatAge(job.status.startTime) + " ago"
                                  : "N/A"}
                                {job.status?.completionTime &&
                                  ` -- Completed: ${formatAge(job.status.completionTime)} ago`}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={runStatus.variant}
                            className="text-[10px] shrink-0"
                          >
                            {runStatus.label}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
