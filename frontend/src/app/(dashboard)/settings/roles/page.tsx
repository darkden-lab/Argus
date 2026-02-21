"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, UserPlus, Trash2, Loader2 } from "lucide-react";

interface RolePermission {
  resource: string;
  action: string;
  scope_type: string;
  scope_id: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: RolePermission[];
}

interface Assignment {
  id: string;
  email: string;
  display_name: string;
  role_name: string;
  cluster_id: string;
  namespace: string;
}

interface User {
  id: string;
  email: string;
  display_name: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [form, setForm] = useState({ user: "", role: "", cluster: "", namespace: "" });

  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true);
      const data = await api.get<Role[]>("/api/roles");
      setRoles(data ?? []);
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoadingAssignments(true);
      const data = await api.get<Assignment[]>("/api/roles/assignments");
      setAssignments(data ?? []);
    } catch {
      setAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get<User[]>("/api/users");
      setUsers(data ?? []);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
    fetchAssignments();
    fetchUsers();
  }, [fetchRoles, fetchAssignments, fetchUsers]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/roles/assign", {
        user_email: form.user,
        role_name: form.role,
        cluster_id: form.cluster || undefined,
        namespace: form.namespace || undefined,
      });
      setOpen(false);
      setForm({ user: "", role: "", cluster: "", namespace: "" });
      await fetchAssignments();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await api.del(`/api/roles/revoke/${id}`);
      await fetchAssignments();
    } finally {
      setRevoking(null);
    }
  }

  function formatPermission(perm: RolePermission): string {
    const scope = perm.scope_type === "global"
      ? ""
      : ` (${perm.scope_type}${perm.scope_id ? `: ${perm.scope_id}` : ""})`;
    return `${perm.resource}:${perm.action}${scope}`;
  }

  return (
    <div className="space-y-6">
      {/* Roles Section */}
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
                    Assign a role to a user. Optionally scope it to a specific cluster and namespace.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>User</Label>
                    <Select value={form.user} onValueChange={(v) => setForm({ ...form, user: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.email}>
                            {u.email}{u.display_name ? ` (${u.display_name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.name}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cluster">Cluster ID (optional)</Label>
                    <Input
                      id="cluster"
                      placeholder="Leave empty for all clusters"
                      value={form.cluster}
                      onChange={(e) => setForm({ ...form, cluster: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="namespace">Namespace (optional)</Label>
                    <Input
                      id="namespace"
                      placeholder="Leave empty for all namespaces"
                      value={form.namespace}
                      onChange={(e) => setForm({ ...form, namespace: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting || !form.role || !form.user}>
                    {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Assign
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loadingRoles ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading roles...
          </div>
        ) : roles.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No roles found.
          </div>
        ) : (
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
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {role.description || "No description"}
                  </CardDescription>
                </CardHeader>
                {expandedRole === role.id && (
                  <CardContent>
                    {role.permissions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No permissions configured.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {role.permissions.map((perm, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] font-mono">
                            {formatPermission(perm)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Assignments Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Role Assignments</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Namespace</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingAssignments ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading assignments...
                    </div>
                  </TableCell>
                </TableRow>
              ) : assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No role assignments found.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <span className="font-mono text-sm">{a.email}</span>
                        {a.display_name && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({a.display_name})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {a.role_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.cluster_id || "All"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.namespace || "All"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRevoke(a.id)}
                        disabled={revoking === a.id}
                      >
                        {revoking === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
