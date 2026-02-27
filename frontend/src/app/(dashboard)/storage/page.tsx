"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HardDrive, Database, Loader2, FolderOpen, Plus } from "lucide-react";
import { CreatePVCWizard } from "@/components/resources/create-pvc-wizard";

interface K8sMeta {
  name: string;
  namespace?: string;
}

interface PVC {
  metadata: K8sMeta;
  spec?: {
    accessModes?: string[];
    resources?: { requests?: { storage?: string } };
    storageClassName?: string;
  };
  status?: {
    phase?: string;
    capacity?: { storage?: string };
  };
}

interface StorageClass {
  metadata: K8sMeta;
  provisioner?: string;
  reclaimPolicy?: string;
  volumeBindingMode?: string;
  allowVolumeExpansion?: boolean;
}

interface PV {
  metadata: K8sMeta;
  spec?: {
    capacity?: { storage?: string };
    accessModes?: string[];
    storageClassName?: string;
    persistentVolumeReclaimPolicy?: string;
  };
  status?: { phase?: string };
}

const phaseColors: Record<string, string> = {
  Bound: "border-emerald-500/30 text-emerald-500",
  Available: "border-blue-500/30 text-blue-500",
  Pending: "border-yellow-500/30 text-yellow-500",
  Released: "border-muted-foreground/30 text-muted-foreground",
  Failed: "border-red-500/30 text-red-500",
};

export default function StoragePage() {
  const [pvcs, setPVCs] = useState<PVC[]>([]);
  const [storageClasses, setStorageClasses] = useState<StorageClass[]>([]);
  const [pvs, setPVs] = useState<PV[]>([]);
  const [clusters, setClusters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showCreatePVC, setShowCreatePVC] = useState(false);

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
    if (!selectedCluster) { setLoading(false); return; }
    setLoading(true);
    const [pvcRes, scRes, pvRes] = await Promise.allSettled([
      api.get<{ items: PVC[] }>(`/api/clusters/${selectedCluster}/resources/_/v1/persistentvolumeclaims`),
      api.get<{ items: StorageClass[] }>(`/api/clusters/${selectedCluster}/resources/storage.k8s.io/v1/storageclasses`),
      api.get<{ items: PV[] }>(`/api/clusters/${selectedCluster}/resources/_/v1/persistentvolumes`),
    ]);
    setPVCs(pvcRes.status === "fulfilled" ? pvcRes.value.items ?? [] : []);
    setStorageClasses(scRes.status === "fulfilled" ? scRes.value.items ?? [] : []);
    setPVs(pvRes.status === "fulfilled" ? pvRes.value.items ?? [] : []);
    setLoading(false);
  }, [selectedCluster]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage</h1>
          <p className="text-sm text-muted-foreground">Persistent Volumes, PVCs, and Storage Classes.</p>
        </div>
        <div className="flex items-center gap-2">
          {clusters.length > 1 && (
            <select value={selectedCluster} onChange={(e) => setSelectedCluster(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm">
              {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {selectedCluster && (
            <Button size="sm" onClick={() => setShowCreatePVC(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create PVC
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="pvcs">
          <TabsList>
            <TabsTrigger value="pvcs" className="gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> PVCs ({pvcs.length})
            </TabsTrigger>
            <TabsTrigger value="storageclasses" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> Storage Classes ({storageClasses.length})
            </TabsTrigger>
            <TabsTrigger value="pvs" className="gap-1.5">
              <HardDrive className="h-3.5 w-3.5" /> PVs ({pvs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pvcs" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pvcs.map((pvc) => (
                <Card key={`${pvc.metadata.namespace}/${pvc.metadata.name}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{pvc.metadata.name}</CardTitle>
                      <Badge variant="outline" className={cn("text-[10px]", phaseColors[pvc.status?.phase ?? ""])}>
                        {pvc.status?.phase ?? "Unknown"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{pvc.metadata.namespace}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Size</span>
                        <span>{pvc.status?.capacity?.storage ?? pvc.spec?.resources?.requests?.storage ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Class</span>
                        <span>{pvc.spec?.storageClassName ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Access</span>
                        <span>{pvc.spec?.accessModes?.join(", ") ?? "-"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pvcs.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-8">No PVCs found.</p>}
            </div>
          </TabsContent>

          <TabsContent value="storageclasses" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {storageClasses.map((sc) => (
                <Card key={sc.metadata.name}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{sc.metadata.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Provisioner</span>
                        <span className="font-mono text-[11px]">{sc.provisioner ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reclaim</span>
                        <span>{sc.reclaimPolicy ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Binding</span>
                        <span>{sc.volumeBindingMode ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expandable</span>
                        <span>{sc.allowVolumeExpansion ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {storageClasses.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-8">No storage classes found.</p>}
            </div>
          </TabsContent>

          <TabsContent value="pvs" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pvs.map((pv) => (
                <Card key={pv.metadata.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium truncate">{pv.metadata.name}</CardTitle>
                      <Badge variant="outline" className={cn("text-[10px]", phaseColors[pv.status?.phase ?? ""])}>
                        {pv.status?.phase ?? "Unknown"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Capacity</span>
                        <span>{pv.spec?.capacity?.storage ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Class</span>
                        <span>{pv.spec?.storageClassName ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reclaim</span>
                        <span>{pv.spec?.persistentVolumeReclaimPolicy ?? "-"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pvs.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-8">No PVs found.</p>}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {selectedCluster && (
        <CreatePVCWizard
          open={showCreatePVC}
          onOpenChange={setShowCreatePVC}
          clusterId={selectedCluster}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}
