"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import { NetworkMap } from "@/components/networking/network-map";
import {
  Globe,
  ArrowRightLeft,
  Shield,
  Loader2,
  ExternalLink,
  Route,
  DoorOpen,
  Map,
} from "lucide-react";

interface K8sMeta {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
}

interface Service {
  metadata: K8sMeta;
  spec?: {
    type?: string;
    clusterIP?: string;
    ports?: Array<{ port: number; targetPort?: number | string; protocol?: string }>;
    selector?: Record<string, string>;
  };
}

interface Ingress {
  metadata: K8sMeta;
  spec?: {
    rules?: Array<{
      host?: string;
      http?: {
        paths?: Array<{
          path?: string;
          backend?: { service?: { name: string; port?: { number?: number } } };
        }>;
      };
    }>;
    tls?: Array<{ hosts?: string[] }>;
  };
}

interface NetworkPolicy {
  metadata: K8sMeta;
  spec?: {
    podSelector?: { matchLabels?: Record<string, string> };
    policyTypes?: string[];
  };
}

interface HTTPRoute {
  metadata: K8sMeta;
  spec?: {
    hostnames?: string[];
    parentRefs?: Array<{ name: string; namespace?: string; sectionName?: string }>;
    rules?: Array<{
      matches?: Array<{
        path?: { type?: string; value?: string };
        headers?: Array<{ name: string; value: string }>;
        method?: string;
      }>;
      backendRefs?: Array<{ name: string; namespace?: string; port?: number; weight?: number }>;
    }>;
  };
}

interface Gateway {
  metadata: K8sMeta;
  spec?: {
    gatewayClassName?: string;
    listeners?: Array<{
      name: string;
      port: number;
      protocol: string;
      hostname?: string;
    }>;
    addresses?: Array<{ type?: string; value: string }>;
  };
  status?: {
    conditions?: Array<{ type: string; status: string; message?: string }>;
    addresses?: Array<{ type?: string; value: string }>;
  };
}

export default function NetworkingPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
  const [networkPolicies, setNetworkPolicies] = useState<NetworkPolicy[]>([]);
  const [httpRoutes, setHttpRoutes] = useState<HTTPRoute[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const { clusters, selectedClusterId } = useClusterStore();
  const [loading, setLoading] = useState(true);

  const selectedCluster = selectedClusterId || "";

  const fetchData = useCallback(async () => {
    if (!selectedCluster) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [svcRes, ingRes, npRes, hrRes, gwRes] = await Promise.allSettled([
      api.get<{ items: Service[] }>(`/api/clusters/${selectedCluster}/resources/_/v1/services`),
      api.get<{ items: Ingress[] }>(`/api/clusters/${selectedCluster}/resources/networking.k8s.io/v1/ingresses`),
      api.get<{ items: NetworkPolicy[] }>(`/api/clusters/${selectedCluster}/resources/networking.k8s.io/v1/networkpolicies`),
      api.get<{ items: HTTPRoute[] }>(`/api/clusters/${selectedCluster}/resources/gateway.networking.k8s.io/v1/httproutes`),
      api.get<{ items: Gateway[] }>(`/api/clusters/${selectedCluster}/resources/gateway.networking.k8s.io/v1/gateways`),
    ]);

    setServices(svcRes.status === "fulfilled" ? svcRes.value.items ?? [] : []);
    setIngresses(ingRes.status === "fulfilled" ? ingRes.value.items ?? [] : []);
    setNetworkPolicies(npRes.status === "fulfilled" ? npRes.value.items ?? [] : []);
    setHttpRoutes(hrRes.status === "fulfilled" ? hrRes.value.items ?? [] : []);
    setGateways(gwRes.status === "fulfilled" ? gwRes.value.items ?? [] : []);
    setLoading(false);
  }, [selectedCluster]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Networking</h1>
          <p className="text-sm text-muted-foreground">
            Services, Ingresses, Network Policies, HTTPRoutes, Gateways, and Network Map.
          </p>
        </div>
        {clusters.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Cluster: {clusters.find((c) => c.id === selectedCluster)?.name ?? selectedCluster}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="services">
          <TabsList className="flex-wrap">
            <TabsTrigger value="services" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Services ({services.length})
            </TabsTrigger>
            <TabsTrigger value="ingresses" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Ingresses ({ingresses.length})
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Policies ({networkPolicies.length})
            </TabsTrigger>
            <TabsTrigger value="httproutes" className="gap-1.5">
              <Route className="h-3.5 w-3.5" /> HTTPRoutes ({httpRoutes.length})
            </TabsTrigger>
            <TabsTrigger value="gateways" className="gap-1.5">
              <DoorOpen className="h-3.5 w-3.5" /> Gateways ({gateways.length})
            </TabsTrigger>
            <TabsTrigger value="network-map" className="gap-1.5">
              <Map className="h-3.5 w-3.5" /> Network Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {services.map((svc) => (
                <Card key={`${svc.metadata.namespace}/${svc.metadata.name}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{svc.metadata.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        {svc.spec?.type ?? "ClusterIP"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{svc.metadata.namespace}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cluster IP</span>
                        <span className="font-mono">{svc.spec?.clusterIP ?? "-"}</span>
                      </div>
                      {svc.spec?.ports?.map((p, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-muted-foreground">Port</span>
                          <span className="font-mono">
                            {p.port}:{p.targetPort ?? p.port}/{p.protocol ?? "TCP"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {services.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-8">No services found.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ingresses" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {ingresses.map((ing) => (
                <Card key={`${ing.metadata.namespace}/${ing.metadata.name}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{ing.metadata.name}</CardTitle>
                      {ing.spec?.tls?.length ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">TLS</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">HTTP</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{ing.metadata.namespace}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {ing.spec?.rules?.map((rule, i) => (
                        <div key={i} className="text-xs">
                          <div className="flex items-center gap-1">
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono">{rule.host ?? "*"}</span>
                          </div>
                          {rule.http?.paths?.map((path, j) => (
                            <div key={j} className="ml-4 text-muted-foreground">
                              {path.path ?? "/"} -&gt; {path.backend?.service?.name}:{path.backend?.service?.port?.number}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {ingresses.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-8">No ingresses found.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="policies" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {networkPolicies.map((np) => (
                <Card key={`${np.metadata.namespace}/${np.metadata.name}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{np.metadata.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{np.metadata.namespace}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-1.5 flex-wrap">
                      {np.spec?.policyTypes?.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                    {np.spec?.podSelector?.matchLabels && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Selector: {Object.entries(np.spec.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(", ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
              {networkPolicies.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-8">No network policies found.</p>
              )}
            </div>
          </TabsContent>

          {/* HTTPRoutes tab */}
          <TabsContent value="httproutes" className="mt-4">
            {httpRoutes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No HTTPRoutes found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead>Hostnames</TableHead>
                    <TableHead>Parent Refs</TableHead>
                    <TableHead>Rules</TableHead>
                    <TableHead>Matches</TableHead>
                    <TableHead>Backend Refs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {httpRoutes.map((hr) => {
                    const allMatches = (hr.spec?.rules ?? []).flatMap(
                      (r) => r.matches ?? []
                    );
                    const allBackendRefs = (hr.spec?.rules ?? []).flatMap(
                      (r) => r.backendRefs ?? []
                    );
                    return (
                      <TableRow key={`${hr.metadata.namespace}/${hr.metadata.name}`}>
                        <TableCell className="font-medium text-xs">
                          {hr.metadata.name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {hr.metadata.namespace}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {hr.spec?.hostnames?.join(", ") || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {hr.spec?.parentRefs
                            ?.map(
                              (p) =>
                                `${p.namespace ? p.namespace + "/" : ""}${p.name}${p.sectionName ? ":" + p.sectionName : ""}`
                            )
                            .join(", ") || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {hr.spec?.rules?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-xs">
                          {allMatches.length > 0
                            ? allMatches
                                .map(
                                  (m) =>
                                    `${m.method ?? ""}${m.path?.value ?? ""}`.trim() || "match"
                                )
                                .join(", ")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {allBackendRefs.length > 0
                            ? allBackendRefs
                                .map(
                                  (b) =>
                                    `${b.name}${b.port ? ":" + b.port : ""}${b.weight !== undefined ? " w:" + b.weight : ""}`
                                )
                                .join(", ")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Gateways tab */}
          <TabsContent value="gateways" className="mt-4">
            {gateways.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No gateways found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead>Gateway Class</TableHead>
                    <TableHead>Listeners</TableHead>
                    <TableHead>Addresses</TableHead>
                    <TableHead>Conditions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gateways.map((gw) => {
                    const addresses =
                      gw.status?.addresses ?? gw.spec?.addresses ?? [];
                    const conditions = gw.status?.conditions ?? [];
                    return (
                      <TableRow key={`${gw.metadata.namespace}/${gw.metadata.name}`}>
                        <TableCell className="font-medium text-xs">
                          {gw.metadata.name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {gw.metadata.namespace}
                        </TableCell>
                        <TableCell className="text-xs">
                          {gw.spec?.gatewayClassName ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {gw.spec?.listeners
                            ?.map(
                              (l) =>
                                `${l.name} (${l.protocol}:${l.port}${l.hostname ? " " + l.hostname : ""})`
                            )
                            .join(", ") || "-"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {addresses.map((a) => a.value).join(", ") || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1 flex-wrap">
                            {conditions.length > 0
                              ? conditions.map((c, i) => (
                                  <Badge
                                    key={i}
                                    variant={
                                      c.status === "True"
                                        ? "outline"
                                        : "destructive"
                                    }
                                    className="text-[9px]"
                                  >
                                    {c.type}
                                  </Badge>
                                ))
                              : "-"}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Network Map tab */}
          <TabsContent value="network-map" className="mt-4">
            {selectedCluster ? (
              <NetworkMap clusterID={selectedCluster} />
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                Select a cluster to view the network map.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
