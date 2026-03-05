"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { DetailPageSkeleton } from "@/components/skeletons";
import { StatusBadge } from "@/components/resources/resource-table";
import { useClusterStore } from "@/stores/cluster";

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

interface HelmHistoryEntry {
  revision?: number;
  updated?: string;
  status?: string;
  chart?: string;
  chartName?: string;
  chartVersion?: string;
  appVersion?: string;
  app_version?: string;
  description?: string;
  firstDeployed?: string;
  lastDeployed?: string;
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

  const [historyEntries, setHistoryEntries] = useState<HelmHistoryEntry[]>([]);
  const [valuesText, setValuesText] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const selectedClusterId = useClusterStore((s) => s.selectedClusterId);

  const clusterID = selectedClusterId ?? "";

  useEffect(() => {
    if (!clusterID || !name || !namespace) { setLoading(false); return; }
    api.get<HelmRelease>(
      `/api/plugins/helm/helmreleases/${name}?clusterID=${clusterID}&namespace=${namespace}`
    )
      .then((d) => setRelease(d))
      .catch(() => setRelease(null))
      .finally(() => setLoading(false));
  }, [name, namespace, clusterID]);

  useEffect(() => {
    if (!clusterID || !name || !namespace) return;

    setHistoryLoading(true);
    api.get<HelmHistoryEntry[] | { history?: HelmHistoryEntry[] }>(
      `/api/plugins/helm/${clusterID}/releases/${name}/history?namespace=${namespace}`
    )
      .then((d) => {
        const entries = Array.isArray(d) ? d : (d.history ?? []);
        setHistoryEntries(entries);
      })
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false));

    setValuesLoading(true);
    api.get<Record<string, unknown> | string>(
      `/api/plugins/helm/${clusterID}/releases/${name}/values?namespace=${namespace}`
    )
      .then((d) => {
        setValuesText(typeof d === "string" ? d : toYaml(d));
      })
      .catch(() => setValuesText(""))
      .finally(() => setValuesLoading(false));
  }, [clusterID, name, namespace]);

  const handleRollback = useCallback((revision: number) => {
    if (!window.confirm(`Rollback "${name}" to revision ${revision}?`)) return;
    api.post(`/api/plugins/helm/${clusterID}/releases/${name}/rollback?namespace=${namespace}`, { revision })
      .then(() => window.location.reload())
      .catch(() => {});
  }, [clusterID, name, namespace]);

  const handleCopy = useCallback(() => {
    const text = valuesText || (release?.spec?.values ? toYaml(release.spec.values) : "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [valuesText, release]);

  if (loading) return <DetailPageSkeleton />;
  if (!release) return <div className="py-12 text-center text-muted-foreground">Release not found.</div>;

  const ready = release.status?.conditions?.find((c) => c.type === "Ready");
  const displayValues = valuesText || (release.spec?.values ? toYaml(release.spec.values) : "# No values configured");

  const displayHistory = historyEntries.length > 0
    ? historyEntries
    : (release.status?.history ?? []).map((h, i) => ({
        revision: i + 1,
        chart: h.chartName ?? "-",
        chartVersion: h.chartVersion ?? "-",
        appVersion: h.appVersion ?? "-",
        status: h.status ?? "Unknown",
        firstDeployed: h.firstDeployed,
        updated: h.lastDeployed,
        description: "",
      } as HelmHistoryEntry));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{release.metadata.name}</h1>
          <p className="text-sm text-muted-foreground">{release.metadata.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ready?.status === "True" ? "Ready" : "Not Ready"} />
        </div>
      </div>

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
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {valuesLoading ? "Loading values..." : "Applied values for this release."}
              </p>
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1 rounded border border-border hover:bg-muted transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <textarea
              className="w-full font-mono text-xs bg-muted text-foreground rounded border border-border p-3 resize-y min-h-[200px]"
              value={displayValues}
              readOnly
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-2">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading history...</p>
            ) : displayHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revision history available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="pb-2 pr-4">Revision</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Chart</th>
                      <th className="pb-2 pr-4">App Version</th>
                      <th className="pb-2 pr-4">Description</th>
                      <th className="pb-2 pr-4">Updated</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayHistory.map((h, i) => (
                      <tr key={h.revision ?? i} className="py-2">
                        <td className="py-2 pr-4 font-mono">{h.revision ?? i + 1}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={h.status ?? "Unknown"} />
                        </td>
                        <td className="py-2 pr-4 font-mono">
                          {h.chart ?? `${h.chartName ?? "-"}-${h.chartVersion ?? ""}`}
                        </td>
                        <td className="py-2 pr-4">{h.appVersion ?? h.app_version ?? "-"}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[200px] truncate">
                          {h.description ?? "-"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">
                          {h.updated ?? h.firstDeployed ?? "-"}
                        </td>
                        <td className="py-2">
                          {h.revision && (
                            <button
                              onClick={() => handleRollback(h.revision!)}
                              className="text-xs text-primary hover:underline"
                            >
                              Rollback
                            </button>
                          )}
                        </td>
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
