"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ResourceTable, StatusBadge, type Column } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { RBACGate } from "@/components/auth/rbac-gate";

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
  labels: Record<string, string>;
  last_health: string;
}

const columns: Column<Cluster>[] = [
  { key: "name", label: "Name" },
  { key: "api_server_url", label: "API Server" },
  {
    key: "status",
    label: "Status",
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: "last_health", label: "Last Health Check" },
];

const placeholderClusters: Cluster[] = [
  { id: "1", name: "production", api_server_url: "https://k8s-prod:6443", status: "connected", labels: {}, last_health: "10s ago" },
  { id: "2", name: "staging", api_server_url: "https://k8s-staging:6443", status: "connected", labels: {}, last_health: "12s ago" },
  { id: "3", name: "dev", api_server_url: "https://k8s-dev:6443", status: "disconnected", labels: {}, last_health: "5m ago" },
];

export default function ClustersPage() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>(placeholderClusters);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", api_server_url: "", kubeconfig: "" });

  useEffect(() => {
    api
      .get<Cluster[]>("/api/clusters")
      .then(setClusters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    setAdding(true);
    try {
      const created = await api.post<Cluster>("/api/clusters", form);
      setClusters((prev) => [...prev, created]);
      setDialogOpen(false);
      setForm({ name: "", api_server_url: "", kubeconfig: "" });
    } catch {
      // Error handling can be extended later
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clusters</h1>
          <p className="text-muted-foreground">
            Manage your Kubernetes clusters.
          </p>
        </div>
        <RBACGate resource="clusters" action="write">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Cluster
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Cluster</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="cluster-name">Cluster Name</Label>
                  <Input
                    id="cluster-name"
                    placeholder="production"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-server">API Server URL</Label>
                  <Input
                    id="api-server"
                    placeholder="https://k8s.example.com:6443"
                    value={form.api_server_url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, api_server_url: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kubeconfig">Kubeconfig</Label>
                  <Textarea
                    id="kubeconfig"
                    placeholder="Paste kubeconfig YAML..."
                    className="min-h-[150px] font-mono text-xs"
                    value={form.kubeconfig}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kubeconfig: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={adding || !form.name || !form.api_server_url}
                >
                  {adding ? "Adding..." : "Add Cluster"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </RBACGate>
      </div>

      <ResourceTable
        data={clusters}
        columns={columns}
        loading={loading}
        onRowClick={(row) => router.push(`/clusters/${row.id}`)}
        searchPlaceholder="Filter clusters..."
      />
    </div>
  );
}
