"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Globe,
  ArrowRightLeft,
  Shield,
  Loader2,
  ExternalLink,
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

export default function NetworkingPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
  const [networkPolicies, setNetworkPolicies] = useState<NetworkPolicy[]>([]);
  const [clusters, setClusters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Array<{ id: string; name: string; status: string }>>("/api/clusters")
      .then((data) => {
        setClusters(data);
        const connected = data.find((c) => c.status === "connected" || c.status === "healthy");
        if (connected) setSelectedCluster(connected.id);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedCluster) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [svcRes, ingRes, npRes] = await Promise.allSettled([
      api.get<{ items: Service[] }>(`/api/clusters/${selectedCluster}/resources/_/v1/services`),
      api.get<{ items: Ingress[] }>(`/api/clusters/${selectedCluster}/resources/networking.k8s.io/v1/ingresses`),
      api.get<{ items: NetworkPolicy[] }>(`/api/clusters/${selectedCluster}/resources/networking.k8s.io/v1/networkpolicies`),
    ]);

    setServices(svcRes.status === "fulfilled" ? svcRes.value.items ?? [] : []);
    setIngresses(ingRes.status === "fulfilled" ? ingRes.value.items ?? [] : []);
    setNetworkPolicies(npRes.status === "fulfilled" ? npRes.value.items ?? [] : []);
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
            Services, Ingresses, and Network Policies.
          </p>
        </div>
        {clusters.length > 1 && (
          <select
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Services ({services.length})
            </TabsTrigger>
            <TabsTrigger value="ingresses" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Ingresses ({ingresses.length})
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Policies ({networkPolicies.length})
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
        </Tabs>
      )}
    </div>
  );
}
