"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import {
  compositeApps,
  type App,
  type K8sDeployment,
  type K8sService,
  type K8sIngress,
  truncateImage,
  getStatusDot,
  formatAge,
} from "@/lib/abstractions";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Box,
  Globe,
  Lock,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  RotateCcw,
  Scale,
  Shield,
} from "lucide-react";

interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  metadata?: { name: string; creationTimestamp?: string };
  firstTimestamp?: string;
  lastTimestamp?: string;
  involvedObject?: { kind: string; name: string };
  count?: number;
}

export default function AppDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const appName = decodeURIComponent(params.id as string);
  const clusterId = searchParams.get("cluster") ?? "";
  const namespace = searchParams.get("namespace") ?? "default";

  const [app, setApp] = useState<App | null>(null);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scale dialog
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleValue, setScaleValue] = useState(1);
  const [scaling, setScaling] = useState(false);

  // Restart dialog
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const fetchApp = useCallback(async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const [deploymentsRes, servicesRes, ingressesRes] =
        await Promise.allSettled([
          api.get<{ items: K8sDeployment[] }>(
            `/api/clusters/${clusterId}/resources/apps/v1/deployments?namespace=${namespace}`
          ),
          api.get<{ items: K8sService[] }>(
            `/api/clusters/${clusterId}/resources/_/v1/services?namespace=${namespace}`
          ),
          api.get<{ items: K8sIngress[] }>(
            `/api/clusters/${clusterId}/resources/networking.k8s.io/v1/ingresses?namespace=${namespace}`
          ),
        ]);

      const deployments =
        deploymentsRes.status === "fulfilled"
          ? deploymentsRes.value.items ?? []
          : [];
      const services =
        servicesRes.status === "fulfilled"
          ? servicesRes.value.items ?? []
          : [];
      const ingresses =
        ingressesRes.status === "fulfilled"
          ? ingressesRes.value.items ?? []
          : [];

      const apps = compositeApps(deployments, services, ingresses);
      const found = apps.find((a) => a.name === appName);

      if (found) {
        setApp(found);
        setScaleValue(found.replicas.desired);
      } else {
        setError("App not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load app");
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, appName]);

  const fetchEvents = useCallback(async () => {
    if (!clusterId) return;
    try {
      const res = await api.get<{ items: K8sEvent[] }>(
        `/api/clusters/${clusterId}/resources/_/v1/events?namespace=${namespace}`
      );
      const filtered = (res.items ?? []).filter(
        (e) =>
          e.involvedObject?.kind === "Deployment" &&
          e.involvedObject?.name === appName
      );
      setEvents(filtered);
    } catch {
      // Events are non-critical
    }
  }, [clusterId, namespace, appName]);

  useEffect(() => {
    fetchApp();
    fetchEvents();
  }, [fetchApp, fetchEvents]);

  async function handleScale() {
    if (!clusterId || !app) return;
    setScaling(true);
    try {
      await api.patch(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${namespace}`,
        { spec: { replicas: scaleValue } }
      );
      toast("Scaled successfully", {
        description: `${app.name} scaled to ${scaleValue} replicas`,
        variant: "success",
      });
      setScaleOpen(false);
      fetchApp();
    } catch {
      // Handled by api client
    } finally {
      setScaling(false);
    }
  }

  async function handleRestart() {
    if (!clusterId || !app) return;
    setRestarting(true);
    try {
      await api.patch(
        `/api/clusters/${clusterId}/resources/apps/v1/deployments/${app.name}?namespace=${namespace}`,
        {
          spec: {
            template: {
              metadata: {
                annotations: {
                  "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
                },
              },
            },
          },
        }
      );
      toast("Restart initiated", {
        description: `Rolling restart of ${app.name} started`,
        variant: "success",
      });
      setRestartOpen(false);
      fetchApp();
    } catch {
      // Handled by api client
    } finally {
      setRestarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading app details...</span>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/apps")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Apps
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>{error ?? "App not found"}</p>
        </div>
      </div>
    );
  }

  const dotStatus = getStatusDot(app.status);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/apps")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Apps
      </Button>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={dotStatus} size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
            <p className="text-sm text-muted-foreground">
              {app.namespace} -- Created {formatAge(app.createdAt)} ago
            </p>
          </div>
          <Badge
            variant={
              app.status === "healthy"
                ? "success"
                : app.status === "failing"
                  ? "destructive"
                  : "warning"
            }
            className="ml-2"
          >
            {app.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setScaleValue(app.replicas.desired);
              setScaleOpen(true);
            }}
          >
            <Scale className="mr-1.5 h-4 w-4" />
            Scale
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRestartOpen(true)}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Restart
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchApp}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Replicas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {app.replicas.ready}
                  </span>
                  <span className="text-muted-foreground">
                    / {app.replicas.desired}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      app.replicas.ready === app.replicas.desired
                        ? "bg-green-500"
                        : app.replicas.ready > 0
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{
                      width: `${app.replicas.desired > 0 ? (app.replicas.ready / app.replicas.desired) * 100 : 0}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Container Image</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm break-all">{app.image}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {truncateImage(app.image)}
                </p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Networking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Service Type:{" "}
                    <span className="font-medium">{app.serviceType}</span>
                  </span>
                </div>
                {app.ports.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Maximize2 className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Ports:{" "}
                      {app.ports
                        .map((p) => `${p.port}/${p.protocol}`)
                        .join(", ")}
                    </span>
                  </div>
                )}
                {app.endpoints.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>Endpoints: {app.endpoints.join(", ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">Ingress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {app.hosts.length > 0 ? (
                  <>
                    {app.hosts.map((host) => (
                      <div key={host} className="flex items-center gap-2 text-sm">
                        {app.hasTLS ? (
                          <Lock className="h-4 w-4 text-green-500" />
                        ) : (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-mono">{host}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-sm">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span>TLS: {app.hasTLS ? "Enabled" : "Disabled"}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No ingress configured
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Resources tab */}
        <TabsContent value="resources" className="space-y-4">
          <Card className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Deployment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Name:</span>{" "}
                  {app.deployment.metadata.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Namespace:</span>{" "}
                  {app.deployment.metadata.namespace}
                </p>
                <p>
                  <span className="text-muted-foreground">UID:</span>{" "}
                  <span className="font-mono text-xs">
                    {app.deployment.metadata.uid}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  {app.deployment.metadata.creationTimestamp}
                </p>
              </div>
            </CardContent>
          </Card>

          {app.services.length > 0 && (
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  Services ({app.services.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {app.services.map((svc) => (
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

          {app.ingresses.length > 0 && (
            <Card className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  Ingresses ({app.ingresses.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {app.ingresses.map((ing) => (
                  <div
                    key={ing.metadata.uid ?? ing.metadata.name}
                    className="rounded-md border p-3 space-y-1 text-sm"
                  >
                    <p className="font-medium">{ing.metadata.name}</p>
                    {ing.spec?.rules?.map((rule, i) => (
                      <p key={i} className="text-muted-foreground">
                        Host: {rule.host ?? "*"} | Paths:{" "}
                        {rule.http?.paths?.map((p) => p.path).join(", ") ??
                          "/"}
                      </p>
                    ))}
                    {ing.spec?.tls && ing.spec.tls.length > 0 && (
                      <p className="text-muted-foreground">
                        TLS: {ing.spec.tls.map((t) => t.secretName).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Events tab */}
        <TabsContent value="events" className="space-y-4">
          <Card className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">
                Events ({events.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events found for this deployment.
                </p>
              ) : (
                <div className="space-y-2">
                  {events.map((event, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm"
                    >
                      <Badge
                        variant={
                          event.type === "Warning" ? "destructive" : "secondary"
                        }
                        className="shrink-0 text-[10px]"
                      >
                        {event.type}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{event.reason}</p>
                        <p className="text-muted-foreground truncate">
                          {event.message}
                        </p>
                        {event.lastTimestamp && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {event.lastTimestamp}
                            {event.count && event.count > 1
                              ? ` (${event.count}x)`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Scale Dialog */}
      <Dialog open={scaleOpen} onOpenChange={setScaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale {app.name}</DialogTitle>
            <DialogDescription>
              Adjust the number of replicas for this deployment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="replicas">Replicas</Label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  id="replicas"
                  min={0}
                  max={20}
                  value={scaleValue}
                  onChange={(e) => setScaleValue(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={scaleValue}
                  onChange={(e) => setScaleValue(Number(e.target.value))}
                  className="w-20"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {app.replicas.desired} replicas. New: {scaleValue}{" "}
                replicas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScale} disabled={scaling}>
              {scaling ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Scaling...
                </>
              ) : (
                "Apply"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart Dialog */}
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Restart {app.name}</DialogTitle>
            <DialogDescription>
              This will trigger a rolling restart of all pods in the deployment.
              Existing traffic will not be interrupted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRestart} disabled={restarting}>
              {restarting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Restarting...
                </>
              ) : (
                "Restart"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
