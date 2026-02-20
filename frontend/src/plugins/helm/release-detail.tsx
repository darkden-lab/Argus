"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/resources/resource-table";

interface HelmRelease {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  spec?: {
    chart?: { spec?: { chart?: string; version?: string; sourceRef?: { name?: string; kind?: string } } };
    interval?: string;
    values?: Record<string, unknown>;
  };
  status?: {
    conditions?: { type: string; status: string; message?: string; lastTransitionTime?: string }[];
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
    observedGeneration?: number;
    history?: {
      digest?: string;
      firstDeployed?: string;
      lastDeployed?: string;
      chartName?: string;
      chartVersion?: string;
      appVersion?: string;
      status?: string;
    }[];
  };
}

interface YamlEditorProps {
  value: string;
  readOnly?: boolean;
}

function YamlEditor({ value, readOnly = true }: YamlEditorProps) {
  return (
    <textarea
      className="w-full font-mono text-xs bg-muted text-foreground rounded border border-border p-3 resize-y min-h-[200px]"
      value={value}
      readOnly={readOnly}
      spellCheck={false}
    />
  );
}

function toYaml(obj: unknown, indent = 0): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return obj.includes("\n") ? `|\n${obj.split("\n").map((l) => "  ".repeat(indent + 1) + l).join("\n")}` : obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((v) => "  ".repeat(indent) + "- " + toYaml(v, indent + 1)).join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const valStr = toYaml(v, indent + 1);
        const isMultiline = typeof v === "object" && v !== null && !Array.isArray(v);
        return "  ".repeat(indent) + k + ": " + (isMultiline ? "\n" + valStr : valStr);
      })
      .join("\n");
  }
  return String(obj);
}

interface ReleaseDetailProps {
  name?: string;
  namespace?: string;
}

export function HelmReleaseDetail({ name = "", namespace = "" }: ReleaseDetailProps) {
  const [release, setRelease] = useState<HelmRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"values" | "history" | "conditions">("values");

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID || !name || !namespace) { setLoading(false); return; }
    api.get<HelmRelease>(
      `/api/plugins/helm/helmreleases/${name}?clusterID=${clusterID}&namespace=${namespace}`
    )
      .then((d) => setRelease(d))
      .catch(() => setRelease(null))
      .finally(() => setLoading(false));
  }, [name, namespace]);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (!release) {
    return <div className="py-12 text-center text-muted-foreground">Release not found.</div>;
  }

  const ready = release.status?.conditions?.find((c) => c.type === "Ready");
  const valuesYaml = release.spec?.values ? toYaml(release.spec.values) : "# No values configured";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{release.metadata.name}</h1>
          <p className="text-sm text-muted-foreground">{release.metadata.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ready?.status === "True" ? "Ready" : "Not Ready"} />
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Chart</p>
          <p className="mt-1 text-sm font-medium truncate">{release.spec?.chart?.spec?.chart ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Version</p>
          <p className="mt-1 text-sm font-medium">{release.spec?.chart?.spec?.version ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Source</p>
          <p className="mt-1 text-sm font-medium truncate">{release.spec?.chart?.spec?.sourceRef?.name ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Interval</p>
          <p className="mt-1 text-sm font-medium">{release.spec?.interval ?? "-"}</p>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-border mb-4">
          {(["values", "history", "conditions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "values" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Applied values for this release (read-only).</p>
            <YamlEditor value={valuesYaml} readOnly />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-2">
            {(release.status?.history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No revision history available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="pb-2 pr-4">Chart</th>
                      <th className="pb-2 pr-4">Version</th>
                      <th className="pb-2 pr-4">App Version</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">First Deployed</th>
                      <th className="pb-2">Last Deployed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {release.status!.history!.map((h, i) => (
                      <tr key={i} className="py-2">
                        <td className="py-2 pr-4 font-mono">{h.chartName ?? "-"}</td>
                        <td className="py-2 pr-4">{h.chartVersion ?? "-"}</td>
                        <td className="py-2 pr-4">{h.appVersion ?? "-"}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={h.status ?? "Unknown"} />
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">{h.firstDeployed ?? "-"}</td>
                        <td className="py-2 text-muted-foreground text-xs">{h.lastDeployed ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "conditions" && (
          <div className="space-y-2">
            {(release.status?.conditions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No conditions available.</p>
            ) : (
              release.status!.conditions!.map((c, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.type}</span>
                    <StatusBadge status={c.status === "True" ? "True" : c.status === "False" ? "False" : c.status} />
                  </div>
                  {c.message && (
                    <p className="text-xs text-muted-foreground">{c.message}</p>
                  )}
                  {c.lastTransitionTime && (
                    <p className="text-xs text-muted-foreground">{c.lastTransitionTime}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
