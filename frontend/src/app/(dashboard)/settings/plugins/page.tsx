"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

const placeholderPlugins: Plugin[] = [
  { id: "prometheus", name: "Prometheus Operator", version: "0.72.0", description: "Monitoring and alerting with Prometheus", enabled: true },
  { id: "istio", name: "Istio Service Mesh", version: "1.21.0", description: "Service mesh for traffic management and security", enabled: true },
  { id: "calico", name: "Calico CNI", version: "3.27.0", description: "Network policy engine for Kubernetes", enabled: true },
  { id: "argocd", name: "Argo CD", version: "2.10.0", description: "Declarative GitOps continuous delivery", enabled: false },
  { id: "certmanager", name: "cert-manager", version: "1.14.0", description: "Automated TLS certificate management", enabled: false },
];

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>(placeholderPlugins);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    api.get<Plugin[]>("/api/plugins").then(setPlugins).catch(() => {});
  }, []);

  async function handleToggle(plugin: Plugin) {
    setToggling(plugin.id);
    try {
      const action = plugin.enabled ? "disable" : "enable";
      await api.post(`/api/plugins/${plugin.id}/${action}`);
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === plugin.id ? { ...p, enabled: !p.enabled } : p
        )
      );
    } catch {
      // Optimistic update failed - revert would be needed in production
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Plugins</h2>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plugin</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plugins.map((plugin) => (
              <TableRow key={plugin.id}>
                <TableCell className="font-medium">{plugin.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    v{plugin.version}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {plugin.description}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={plugin.enabled}
                    disabled={toggling === plugin.id}
                    onCheckedChange={() => handleToggle(plugin)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
