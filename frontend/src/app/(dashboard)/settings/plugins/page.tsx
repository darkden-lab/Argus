"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Plugin[]>("/api/plugins")
      .then(setPlugins)
      .catch(() => {})
      .finally(() => setLoading(false));
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading plugins...
                  </div>
                </TableCell>
              </TableRow>
            ) : plugins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No plugins available.
                </TableCell>
              </TableRow>
            ) : (
            plugins.map((plugin) => (
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
            ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
