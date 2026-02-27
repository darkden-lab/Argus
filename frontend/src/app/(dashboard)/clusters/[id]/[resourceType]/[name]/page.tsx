"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

function resourceToOverview(resource: Record<string, unknown>, resourceType: string): Array<{ key: string; value: string }> {
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

  // Generic metadata fields
  if (meta.resourceVersion != null) {
    entries.push({ key: "Resource Version", value: String(meta.resourceVersion) });
  }
  if (meta.generation != null) {
    entries.push({ key: "Generation", value: String(meta.generation) });
  }

  const ownerReferences = meta.ownerReferences as Array<Record<string, unknown>> | undefined;
  if (ownerReferences?.length) {
    entries.push({
      key: "Owner References",
      value: ownerReferences.map((ref) => `${ref.kind}/${ref.name}`).join(", "),
    });
  }

  const finalizers = meta.finalizers as string[] | undefined;
  if (finalizers?.length) {
    entries.push({ key: "Finalizers", value: finalizers.join(", ") });
  }

  // Extract the kind from the last segment of the resourceType (GVR format like "apps/v1/deployments")
  const kindSegment = resourceType.split("/").pop()?.toLowerCase() ?? "";

  const spec = resource.spec as Record<string, unknown> | undefined;

  // Type-specific fields
  switch (kindSegment) {
    case "pods": {
      if (status?.podIP != null) {
        entries.push({ key: "Pod IP", value: String(status.podIP) });
      }
      if (status?.hostIP != null) {
        entries.push({ key: "Host IP", value: String(status.hostIP) });
      }
      if (spec?.nodeName != null) {
        entries.push({ key: "Node Name", value: String(spec.nodeName) });
      }
      if (spec?.restartPolicy != null) {
        entries.push({ key: "Restart Policy", value: String(spec.restartPolicy) });
      }
      const containers = spec?.containers as unknown[] | undefined;
      if (containers?.length != null) {
        entries.push({ key: "Containers", value: String(containers.length) });
      }
      const containerStatuses = status?.containerStatuses as Array<Record<string, unknown>> | undefined;
      if (containerStatuses?.length) {
        const totalRestarts = containerStatuses.reduce(
          (sum, cs) => sum + (Number(cs.restartCount) || 0),
          0
        );
        entries.push({ key: "Total Restarts", value: String(totalRestarts) });
      }
      break;
    }

    case "deployments": {
      if (spec?.replicas != null) {
        entries.push({ key: "Replicas", value: String(spec.replicas) });
      }
      if (status?.readyReplicas != null) {
        entries.push({ key: "Ready Replicas", value: String(status.readyReplicas) });
      }
      if (status?.availableReplicas != null) {
        entries.push({ key: "Available Replicas", value: String(status.availableReplicas) });
      }
      const strategy = spec?.strategy as Record<string, unknown> | undefined;
      if (strategy?.type != null) {
        entries.push({ key: "Strategy", value: String(strategy.type) });
      }
      break;
    }

    case "services": {
      if (spec?.type != null) {
        entries.push({ key: "Type", value: String(spec.type) });
      }
      if (spec?.clusterIP != null) {
        entries.push({ key: "Cluster IP", value: String(spec.clusterIP) });
      }
      const ports = spec?.ports as Array<Record<string, unknown>> | undefined;
      if (ports?.length) {
        entries.push({
          key: "Ports",
          value: ports.map((p) => `${p.port}/${p.protocol ?? "TCP"}`).join(", "),
        });
      }
      const selector = spec?.selector as Record<string, string> | undefined;
      if (selector && Object.keys(selector).length) {
        entries.push({
          key: "Selector",
          value: Object.entries(selector)
            .map(([k, v]) => `${k}=${v}`)
            .join(", "),
        });
      }
      break;
    }

    case "ingresses": {
      const rules = spec?.rules as Array<Record<string, unknown>> | undefined;
      if (rules?.length) {
        const hosts = rules
          .map((r) => r.host as string | undefined)
          .filter(Boolean)
          .join(", ");
        if (hosts) {
          entries.push({ key: "Hosts", value: hosts });
        }
      }
      const tls = spec?.tls as Array<Record<string, unknown>> | undefined;
      if (tls?.length) {
        const tlsHosts = tls
          .flatMap((t) => (t.hosts as string[] | undefined) ?? [])
          .join(", ");
        if (tlsHosts) {
          entries.push({ key: "TLS Hosts", value: tlsHosts });
        }
      }
      break;
    }

    case "configmaps": {
      const data = resource.data as Record<string, unknown> | undefined;
      if (data) {
        entries.push({ key: "Data Keys", value: String(Object.keys(data).length) });
      }
      break;
    }

    case "secrets": {
      const data = resource.data as Record<string, unknown> | undefined;
      if (data) {
        entries.push({ key: "Data Keys", value: String(Object.keys(data).length) });
      }
      if (resource.type != null) {
        entries.push({ key: "Type", value: String(resource.type) });
      }
      break;
    }

    case "statefulsets": {
      if (spec?.replicas != null) {
        entries.push({ key: "Replicas", value: String(spec.replicas) });
      }
      if (status?.readyReplicas != null) {
        entries.push({ key: "Ready Replicas", value: String(status.readyReplicas) });
      }
      if (spec?.serviceName != null) {
        entries.push({ key: "Service Name", value: String(spec.serviceName) });
      }
      break;
    }

    case "daemonsets": {
      if (status?.desiredNumberScheduled != null) {
        entries.push({ key: "Desired", value: String(status.desiredNumberScheduled) });
      }
      if (status?.currentNumberScheduled != null) {
        entries.push({ key: "Current", value: String(status.currentNumberScheduled) });
      }
      if (status?.numberReady != null) {
        entries.push({ key: "Ready", value: String(status.numberReady) });
      }
      break;
    }
  }

  return entries;
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  // Parse the simple YAML format produced by toYaml back to an object.
  // This handles the subset of YAML our toYaml generates (no multi-line strings, no anchors, etc.)
  const lines = yaml.split("\n");
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> | unknown[]; key?: string }[] = [
    { indent: -1, obj: root },
  ];

  for (const line of lines) {
    if (line.trim() === "" || line.trim() === "{}") continue;

    const stripped = line.replace(/^(\s*)/, "");
    const currentIndent = line.length - stripped.length;

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= currentIndent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (stripped.startsWith("- ")) {
      // Array item
      const value = stripped.slice(2).trim();
      if (Array.isArray(parent.obj)) {
        if (value.includes(": ")) {
          const obj: Record<string, unknown> = {};
          const colonIdx = value.indexOf(": ");
          obj[value.slice(0, colonIdx)] = parseYamlValue(value.slice(colonIdx + 2));
          (parent.obj as unknown[]).push(obj);
          stack.push({ indent: currentIndent + 2, obj });
        } else {
          (parent.obj as unknown[]).push(parseYamlValue(value));
        }
      }
    } else if (stripped.includes(": ")) {
      const colonIdx = stripped.indexOf(": ");
      const key = stripped.slice(0, colonIdx);
      const value = stripped.slice(colonIdx + 2);

      if (!Array.isArray(parent.obj)) {
        parent.obj[key] = parseYamlValue(value);
      }
    } else if (stripped.endsWith(":")) {
      // Object or array follows
      const key = stripped.slice(0, -1);
      // Peek at next line to determine if array or object
      const nextLineIdx = lines.indexOf(line) + 1;
      const nextLine = nextLineIdx < lines.length ? lines[nextLineIdx].trim() : "";

      let child: Record<string, unknown> | unknown[];
      if (nextLine.startsWith("- ")) {
        child = [];
      } else {
        child = {};
      }

      if (!Array.isArray(parent.obj)) {
        parent.obj[key] = child;
      }
      stack.push({ indent: currentIndent, obj: child, key });
    }
  }

  return root;
}

function parseYamlValue(value: string): unknown {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (value === "{}") return {};
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;
  return value;
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
  const searchParams = useSearchParams();
  const clusterId = params.id as string;
  const resourceType = params.resourceType as string;
  const resourceName = params.name as string;
  const namespace = searchParams.get("namespace");
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
        `/api/clusters/${clusterId}/resources/${gvr}/${resourceName}${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ""}`
      )
      .then(setResource)
      .catch(() => setResource(null));
  }, [clusterId, gvr, resourceName, namespace]);

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

  async function handleSaveYaml(yaml: string) {
    try {
      const parsed = parseSimpleYaml(yaml);
      await api.put(
        `/api/clusters/${clusterId}/resources/${gvr}/${resourceName}`,
        parsed
      );
      await fetchResource();
      toast("Resource updated", { variant: "success", description: `${resourceName} saved successfully.` });
    } catch (err) {
      toast("Failed to save", {
        variant: "error",
        description: err instanceof Error ? err.message : "Could not update resource.",
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
        overview={resourceToOverview(resource, resourceType)}
        yaml={toYaml(resource)}
        events={events}
        onDelete={canDelete ? handleDelete : undefined}
        onSaveYaml={handleSaveYaml}
        deleting={deleting}
      />
    </div>
  );
}
