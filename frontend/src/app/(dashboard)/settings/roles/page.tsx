"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, UserPlus } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

const roles: Role[] = [
  {
    id: "admin",
    name: "Admin",
    description: "Full access to all clusters, resources, and settings.",
    permissions: ["clusters:*", "resources:*", "settings:*", "users:*", "plugins:*"],
  },
  {
    id: "operator",
    name: "Operator",
    description: "Manage cluster resources and deployments.",
    permissions: ["clusters:read", "resources:*", "plugins:read"],
  },
  {
    id: "developer",
    name: "Developer",
    description: "View and manage resources within assigned namespaces.",
    permissions: ["clusters:read", "resources:read", "resources:create", "resources:update"],
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to clusters and resources.",
    permissions: ["clusters:read", "resources:read"],
  },
];

export default function RolesPage() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user: "", role: "", cluster: "", namespace: "" });

  function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    // TODO: call api.post('/api/roles/assign', form)
    setOpen(false);
    setForm({ user: "", role: "", cluster: "", namespace: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Roles</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Assign Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAssign}>
              <DialogHeader>
                <DialogTitle>Assign Role</DialogTitle>
                <DialogDescription>
                  Assign a role to a user for a specific cluster and namespace.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="user">User Email</Label>
                  <Input
                    id="user"
                    placeholder="user@example.com"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cluster">Cluster</Label>
                  <Input
                    id="cluster"
                    placeholder="production"
                    value={form.cluster}
                    onChange={(e) => setForm({ ...form, cluster: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="namespace">Namespace</Label>
                  <Input
                    id="namespace"
                    placeholder="default (leave empty for all)"
                    value={form.namespace}
                    onChange={(e) => setForm({ ...form, namespace: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Assign</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {roles.map((role) => (
          <Card
            key={role.id}
            className="cursor-pointer transition-colors hover:bg-accent/30"
            onClick={() =>
              setExpandedRole(expandedRole === role.id ? null : role.id)
            }
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{role.name}</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {role.description}
              </CardDescription>
            </CardHeader>
            {expandedRole === role.id && (
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <Badge key={perm} variant="outline" className="text-[10px] font-mono">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
