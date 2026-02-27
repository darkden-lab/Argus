"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";

interface PrometheusConfigDialogProps {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

export function PrometheusConfigDialog({
  clusterId,
  open,
  onOpenChange,
}: PrometheusConfigDialogProps) {
  const [prometheusUrl, setPrometheusUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ prometheusUrl: string }>(
        `/api/plugins/istio/${clusterId}/config`
      );
      setPrometheusUrl(res.prometheusUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    if (open) {
      fetchConfig();
      setTestStatus("idle");
      setTestMessage("");
    }
  }, [open, fetchConfig]);

  const handleTestConnection = async () => {
    if (!prometheusUrl.trim()) return;
    setTestStatus("testing");
    setTestMessage("");
    try {
      // Validate URL format client-side
      new URL(prometheusUrl);
      // Save first, then fetch traffic to verify Prometheus is reachable
      await api.put(`/api/plugins/istio/${clusterId}/config`, { prometheusUrl });
      const res = await api.get<{ mode: string }>(
        `/api/plugins/istio/${clusterId}/traffic`
      );
      if (res.mode === "traffic") {
        setTestStatus("success");
        setTestMessage("Connection successful - traffic mode active");
      } else {
        setTestStatus("error");
        setTestMessage("URL saved but Prometheus not reachable");
      }
    } catch (err) {
      setTestStatus("error");
      if (err instanceof TypeError) {
        setTestMessage("Invalid URL format");
      } else {
        setTestMessage(err instanceof Error ? err.message : "Connection failed");
      }
    }
  };

  const handleSave = async () => {
    if (!prometheusUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/plugins/istio/${clusterId}/config`, { prometheusUrl });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prometheus Configuration</DialogTitle>
          <DialogDescription>
            Configure the Prometheus URL used for network traffic metrics.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prometheus-url" className="text-sm font-medium">
                Prometheus URL
              </Label>
              <Input
                id="prometheus-url"
                placeholder="http://prometheus.monitoring.svc:9090"
                value={prometheusUrl}
                onChange={(e) => {
                  setPrometheusUrl(e.target.value);
                  setTestStatus("idle");
                  setTestMessage("");
                }}
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={!prometheusUrl.trim() || testStatus === "testing"}
              >
                {testStatus === "testing" && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Test Connection
              </Button>
              {testStatus === "success" && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {testMessage}
                </span>
              )}
              {testStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-red-500">
                  <XCircle className="h-3.5 w-3.5" />
                  {testMessage}
                </span>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !prometheusUrl.trim()}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
