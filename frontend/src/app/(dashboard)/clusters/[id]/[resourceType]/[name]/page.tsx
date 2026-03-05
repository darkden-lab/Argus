"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { ResourceDetail } from "@/components/resources/resource-detail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { usePermission } from "@/hooks/use-permissions";

const resourceTypeToGVR: Record<string, string> = {
  pods: "_/v1/pods",
  services: "_/v1/services",
  configmaps: "_/v1/configmaps",
  secrets: "_/v1/secrets",
  persistentvolumeclaims: "_/v1/persistentvolumeclaims",
  persistentvolumes: "_/v1/persistentvolumes",
  deployments: "apps/v1/deployments",
  statefulsets: "apps/v1/statefulsets",
  daemonsets: "apps/v1/daemonsets",
  replicasets: "apps/v1/replicasets",
  ingresses: "networking.k8s.io/v1/ingresses",
  networkpolicies: "networking.k8s.io/v1/networkpolicies",
};

function resourceToOverview(resource: Record<string, unknown>): Array<{ key: string; value: string }> {
  const meta = resource.metadata as Record<string, unknown> | undefined;
  if (!meta) return [];

  const entries: Array<{ key: string; value: string }> = [
    { key: "Name", value: String(meta.name ?? "-") },
    { key: "Namespace", value: String(meta.namespace ?? "-") },
    { key: "UID", value: String(meta.uid ?? "-") },
    { key: "Created", value: String(meta.creationTimestamp ?? "-") },
  ];

  const labels = meta.labels as Record<string, string> | undefined;
  if (labels) {
    entries.push({
      key: "Labels",
      value: Object.entries(labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
    });
  }

  const annotations = meta.annotations as Record<string, string> | undefined;
  if (annotations) {
    entries.push({
      key: "Annotations",
      value: Object.entries(annotations)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
    });
  }

  const status = resource.status as Record<string, unknown> | undefined;
  if (status?.phase) {
    entries.push({ key: "Status", value: String(status.phase) });
  }

  return entries;
}

// Resource serialization uses JSON (the native K8s API format) to avoid
// data corruption that occurred with the previous custom YAML parser.
// JSON round-trips losslessly for all K8s resource structures.

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;
  const resourceType = params.resourceType as string;
  const resourceName = params.name as string;
  const [resource, setResource] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<{ type: string; reason: string; message: string; timestamp: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const gvr = resourceTypeToGVR[resourceType] ?? `_/v1/${resourceType}`;
  const kind = resourceType.charAt(0).toUpperCase() + resourceType.slice(1).replace(/s$/, "");
  const canDelete = usePermission("clusters", "delete", clusterId);

  const fetchResource = useCallback(() => {
    return api
      .get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`
      )
      .then(setResource)
      .catch(() => setResource(null));
  }, [clusterId, gvr, resourceName]);

  useEffect(() => {
    fetchResource().finally(() => setLoading(false));
  }, [fetchResource]);

  useEffect(() => {
    const meta = resource?.metadata as Record<string, unknown> | undefined;
    const ns = meta?.namespace as string | undefined;
    if (!ns) return;

    api
      .get<{ items?: Array<Record<string, unknown>> }>(
        `/api/clusters/${clusterId}/resources/_/v1/events?namespace=${encodeURIComponent(ns)}`
      )
      .then((data) => {
        const items = data.items ?? [];
        const filtered = items.filter((e) => {
          const involved = e.involvedObject as Record<string, unknown> | undefined;
          return involved?.name === resourceName;
        });
        setEvents(
          filtered.map((e) => ({
            type: (e.type as string) ?? "Normal",
            reason: (e.reason as string) ?? "",
            message: (e.message as string) ?? "",
            timestamp: ((e.metadata as Record<string, unknown>)?.creationTimestamp as string) ??
              (e.lastTimestamp as string) ?? "",
          }))
        );
      })
      .catch(() => setEvents([]));
  }, [clusterId, resource, resourceName]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.del(`/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`);
      router.push(`/clusters/${clusterId}/${resourceType}`);
    } catch {
      setDeleting(false);
    }
  }

  async function handleSaveYaml(json: string) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      await api.put(
        `/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`,
        parsed
      );
      await fetchResource();
      toast("Resource updated", { variant: "success", description: `${resourceName} saved successfully.` });
    } catch (err) {
      toast("Failed to save", {
        variant: "error",
        description: err instanceof Error ? err.message : "Could not update resource. Check JSON syntax.",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading resource...
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/clusters/${clusterId}/${resourceType}`)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <p className="text-center text-muted-foreground">Resource not found.</p>
      </div>
    );
  }

  const meta = resource.metadata as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/clusters/${clusterId}/${resourceType}`)}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to {resourceType}
      </Button>

      <ResourceDetail
        name={resourceName}
        kind={kind}
        namespace={meta?.namespace as string | undefined}
        overview={resourceToOverview(resource)}
        yaml={JSON.stringify(resource, null, 2)}
        events={events}
        onDelete={canDelete ? handleDelete : undefined}
        onSaveYaml={handleSaveYaml}
        deleting={deleting}
      />
    </div>
  );
}
