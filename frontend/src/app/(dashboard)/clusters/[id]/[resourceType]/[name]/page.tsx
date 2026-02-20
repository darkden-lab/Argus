"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
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

function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === "string") return `${pad}${obj}`;
  if (typeof obj === "number" || typeof obj === "boolean") return `${pad}${obj}`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]`;
    return obj.map((item) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, val]) => {
        if (val && typeof val === "object") {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${val === null ? "null" : String(val)}`;
      })
      .join("\n");
  }
  return `${pad}${String(obj)}`;
}

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;
  const resourceType = params.resourceType as string;
  const resourceName = params.name as string;
  const [resource, setResource] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const gvr = resourceTypeToGVR[resourceType] ?? `_/v1/${resourceType}`;
  const kind = resourceType.charAt(0).toUpperCase() + resourceType.slice(1).replace(/s$/, "");
  const canDelete = usePermission("clusters", "delete", clusterId);

  useEffect(() => {
    api
      .get<Record<string, unknown>>(
        `/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`
      )
      .then(setResource)
      .catch(() => setResource(null))
      .finally(() => setLoading(false));
  }, [clusterId, gvr, resourceName]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.del(`/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`);
      router.push(`/clusters/${clusterId}/${resourceType}`);
    } catch {
      setDeleting(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleSaveYaml(_yaml: string) {
    // In a real implementation, this would parse YAML and PUT to the API
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
        yaml={toYaml(resource)}
        events={[]}
        onDelete={canDelete ? handleDelete : undefined}
        onSaveYaml={handleSaveYaml}
        deleting={deleting}
      />
    </div>
  );
}
