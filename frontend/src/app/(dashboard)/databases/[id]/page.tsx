"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  compositeDatabases,
  type Database,
  type K8sStatefulSet,
  type K8sPVC,
  type K8sService,
  getStatusDot,
  formatAge,
} from "@/lib/abstractions";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Box,
  Database as DatabaseIcon,
  HardDrive,
  Loader2,
  Network,
  RefreshCw,
} from "lucide-react";

export default function DatabaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const dbName = decodeURIComponent(params.id as string);
  const clusterId = searchParams.get("cluster") ?? "";
  const namespace = searchParams.get("namespace") ?? "default";

  const [database, setDatabase] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabase = useCallback(async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const [stsRes, pvcsRes, svcsRes] = await Promise.allSettled([
        api.get<{ items: K8sStatefulSet[] }>(
          `/api/clusters/${clusterId}/resources/apps/v1/statefulsets?namespace=${namespace}`
        ),
        api.get<{ items: K8sPVC[] }>(
          `/api/clusters/${clusterId}/resources/_/v1/persistentvolumeclaims?namespace=${namespace}`
        ),
        api.get<{ items: K8sService[] }>(
          `/api/clusters/${clusterId}/resources/_/v1/services?namespace=${namespace}`
        ),
      ]);

      const statefulSets =
        stsRes.status === "fulfilled" ? stsRes.value.items ?? [] : [];
      const pvcs =
        pvcsRes.status === "fulfilled" ? pvcsRes.value.items ?? [] : [];
      const services =
        svcsRes.status === "fulfilled" ? svcsRes.value.items ?? [] : [];

      const dbs = compositeDatabases(statefulSets, pvcs, services);
      const found = dbs.find((d) => d.name === dbName);

      if (found) {
        setDatabase(found);
      } else {
        setError("Database not found");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load database"
      );
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, dbName]);

  useEffect(() => {
    fetchDatabase();
  }, [fetchDatabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading database details...</span>
        </div>
      </div>
    );
  }

  if (error || !database) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/databases")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Databases
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>{error ?? "Database not found"}</p>
        </div>
      </div>
    );
  }

  const dotStatus = getStatusDot(database.status);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/databases")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Databases
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={dotStatus} size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {database.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {database.namespace} -- Created {formatAge(database.createdAt)}{" "}
              ago
            </p>
          </div>
          <Badge
            variant={
              database.status === "running"
                ? "success"
                : database.status === "failing"
                  ? "destructive"
                  : "warning"
            }
            className="ml-2"
          >
            {database.status}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchDatabase}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Engine</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="h-5 w-5 text-primary" />
                  <span className="text-xl font-bold capitalize">
                    {database.engine}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  {database.isCNPG && (
                    <Badge variant="outline">CNPG Operator</Badge>
                  )}
                  {database.isMariaDB && (
                    <Badge variant="outline">MariaDB Operator</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs font-mono text-muted-foreground break-all">
                  {database.image}
                </p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Replicas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {database.replicas.ready}
                  </span>
                  <span className="text-muted-foreground">
                    / {database.replicas.desired}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      database.replicas.ready === database.replicas.desired
                        ? "bg-green-500"
                        : database.replicas.ready > 0
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{
                      width: `${database.replicas.desired > 0 ? (database.replicas.ready / database.replicas.desired) * 100 : 0}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xl font-bold">{database.storage}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {database.pvcs.length} PVC(s) attached
                </p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {database.services.length > 0 ? (
                  database.services.map((svc) => (
                    <div
                      key={svc.metadata.uid ?? svc.metadata.name}
                      className="text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {svc.metadata.name}
                        </span>
                      </div>
                      <p className="pl-6 text-xs text-muted-foreground">
                        {svc.spec?.clusterIP ?? "None"}
                        {svc.spec?.ports
                          ? " : " +
                            svc.spec.ports.map((p) => p.port).join(", ")
                          : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No services found
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Resources tab */}
        <TabsContent value="resources" className="space-y-4">
          {database.statefulSet && (
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">StatefulSet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    {database.statefulSet.metadata.name}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Namespace:</span>{" "}
                    {database.statefulSet.metadata.namespace}
                  </p>
                  <p>
                    <span className="text-muted-foreground">UID:</span>{" "}
                    <span className="font-mono text-xs">
                      {database.statefulSet.metadata.uid}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    {database.statefulSet.metadata.creationTimestamp}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {database.pvcs.length > 0 && (
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  PersistentVolumeClaims ({database.pvcs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {database.pvcs.map((pvc) => (
                  <div
                    key={pvc.metadata.uid ?? pvc.metadata.name}
                    className="rounded-md border p-3 space-y-1 text-sm"
                  >
                    <p className="font-medium">{pvc.metadata.name}</p>
                    <p className="text-muted-foreground">
                      Status: {pvc.status?.phase ?? "Unknown"} | Storage:{" "}
                      {pvc.status?.capacity?.storage ??
                        pvc.spec?.resources?.requests?.storage ??
                        "N/A"}
                    </p>
                    <p className="text-muted-foreground">
                      Access Modes: {pvc.spec?.accessModes?.join(", ") ?? "N/A"}{" "}
                      | Storage Class: {pvc.spec?.storageClassName ?? "default"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {database.services.length > 0 && (
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  Services ({database.services.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {database.services.map((svc) => (
                  <div
                    key={svc.metadata.uid ?? svc.metadata.name}
                    className="rounded-md border p-3 space-y-1 text-sm"
                  >
                    <p className="font-medium">{svc.metadata.name}</p>
                    <p className="text-muted-foreground">
                      Type: {svc.spec?.type ?? "ClusterIP"} | ClusterIP:{" "}
                      {svc.spec?.clusterIP ?? "None"}
                    </p>
                    {svc.spec?.ports && (
                      <p className="text-muted-foreground">
                        Ports:{" "}
                        {svc.spec.ports
                          .map(
                            (p) =>
                              `${p.port}${p.targetPort ? ":" + p.targetPort : ""}/${p.protocol ?? "TCP"}`
                          )
                          .join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
