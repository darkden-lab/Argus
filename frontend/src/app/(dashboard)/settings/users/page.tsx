"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface User {
  id: string;
  email: string;
  displayName: string;
  authProvider: string;
  lastLogin: string;
}

const placeholderUsers: User[] = [
  { id: "1", email: "admin@k8s.local", displayName: "Admin", authProvider: "local", lastLogin: "2 hours ago" },
  { id: "2", email: "operator@k8s.local", displayName: "Operator", authProvider: "local", lastLogin: "1 day ago" },
  { id: "3", email: "dev@k8s.local", displayName: "Developer", authProvider: "oidc", lastLogin: "3 days ago" },
  { id: "4", email: "viewer@k8s.local", displayName: "Viewer", authProvider: "oidc", lastLogin: "1 week ago" },
];

export default function UsersPage() {
  const [users] = useState<User[]>(placeholderUsers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: call api.post('/api/users', form)
    setOpen(false);
    setForm({ email: "", password: "", displayName: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
                <DialogDescription>
                  Create a new local user account.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="John Doe"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create User</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Last Login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-mono text-sm">{user.email}</TableCell>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {user.authProvider}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.lastLogin}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
