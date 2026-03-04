"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Database,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface DatabaseUsersTabProps {
  clusterId: string;
  dbName: string;
  namespace: string;
  isCNPG: boolean;
  isMariaDB: boolean;
  cnpgCluster?: {
    spec?: {
      bootstrap?: { initdb?: { database?: string; owner?: string } };
    };
    metadata: { name: string };
  } | null;
}

interface MariaDBUser {
  name: string;
  host: string;
  namespace: string;
}

interface MariaDBDatabase {
  name: string;
  namespace: string;
}

interface MariaDBGrant {
  name: string;
  user: string;
  database: string;
  privileges: string[];
  namespace: string;
}

interface SecretData {
  [key: string]: string;
}

/* -------------------------------------------------------------------------- */
/*  CNPG Section                                                              */
/* -------------------------------------------------------------------------- */

function CNPGUsersSection({
  clusterId,
  dbName,
  namespace,
  cnpgCluster,
}: {
  clusterId: string;
  dbName: string;
  namespace: string;
  cnpgCluster: NonNullable<DatabaseUsersTabProps["cnpgCluster"]>;
}) {
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [secretData, setSecretData] = useState<SecretData | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);

  const databaseName =
    cnpgCluster.spec?.bootstrap?.initdb?.database ?? "app";
  const ownerName =
    cnpgCluster.spec?.bootstrap?.initdb?.owner ?? "app";
  const superuserSecret = `${dbName}-superuser`;
  const appSecret = `${dbName}-app`;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", { variant: "success" });
    } catch {
      toast("Failed to copy", { variant: "error" });
    }
  }, []);

  const fetchSecret = useCallback(
    async (secretName: string) => {
      if (revealedSecret === secretName) {
        setRevealedSecret(null);
        setSecretData(null);
        return;
      }

      setLoadingSecret(true);
      try {
        const data = await api.get<SecretData>(
          `/api/resources/secrets/${secretName}?clusterID=${encodeURIComponent(clusterId)}&namespace=${encodeURIComponent(namespace)}&decode=true`
        );
        setSecretData(data);
        setRevealedSecret(secretName);
      } catch {
        toast("Failed to fetch secret", {
          description: "Could not retrieve the credentials. Check your permissions.",
          variant: "error",
        });
      } finally {
        setLoadingSecret(false);
      }
    },
    [clusterId, namespace, revealedSecret]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">PostgreSQL Access</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Database info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Database</span>
              <p className="font-medium">{databaseName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Owner</span>
              <p className="font-medium">{ownerName}</p>
            </div>
          </div>

          <Separator />

          {/* Superuser Secret */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Superuser Secret</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {superuserSecret}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => copyToClipboard(superuserSecret)}
                title="Copy secret name"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => fetchSecret(superuserSecret)}
                disabled={loadingSecret}
              >
                {loadingSecret && revealedSecret !== superuserSecret ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : revealedSecret === superuserSecret ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                <span>
                  {revealedSecret === superuserSecret ? "Hide" : "Reveal"}
                </span>
              </Button>
            </div>
          </div>

          {/* App Secret */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">App Secret</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {appSecret}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => copyToClipboard(appSecret)}
                title="Copy secret name"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => fetchSecret(appSecret)}
                disabled={loadingSecret}
              >
                {loadingSecret && revealedSecret !== appSecret ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : revealedSecret === appSecret ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                <span>
                  {revealedSecret === appSecret ? "Hide" : "Reveal"}
                </span>
              </Button>
            </div>
          </div>

          {/* Revealed Secret Data */}
          {revealedSecret && secretData && (
            <>
              <Separator />
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Credentials for {revealedSecret}
                </p>
                {Object.entries(secretData).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-mono text-muted-foreground min-w-0 truncate">
                      {key}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <code className="text-xs bg-background rounded px-1.5 py-0.5 border max-w-[200px] truncate">
                        {value}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyToClipboard(value)}
                        title={`Copy ${key}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MariaDB Section                                                           */
/* -------------------------------------------------------------------------- */

function MariaDBUsersSection({
  clusterId,
  namespace,
}: {
  clusterId: string;
  namespace: string;
}) {
  const [users, setUsers] = useState<MariaDBUser[]>([]);
  const [databases, setDatabases] = useState<MariaDBDatabase[]>([]);
  const [grants, setGrants] = useState<MariaDBGrant[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user dialog
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserHost, setNewUserHost] = useState("%");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Create database dialog
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [creatingDb, setCreatingDb] = useState(false);

  // Create grant dialog
  const [showCreateGrant, setShowCreateGrant] = useState(false);
  const [grantUser, setGrantUser] = useState("");
  const [grantDatabase, setGrantDatabase] = useState("");
  const [grantPrivileges, setGrantPrivileges] = useState("ALL PRIVILEGES");
  const [creatingGrant, setCreatingGrant] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "user" | "database";
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const queryParams = `clusterID=${encodeURIComponent(clusterId)}&namespace=${encodeURIComponent(namespace)}`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, dbsData, grantsData] = await Promise.all([
        api.get<MariaDBUser[]>(
          `/api/plugins/mariadb/users?${queryParams}`
        ),
        api.get<MariaDBDatabase[]>(
          `/api/plugins/mariadb/databases?${queryParams}`
        ),
        api.get<MariaDBGrant[]>(
          `/api/plugins/mariadb/grants?${queryParams}`
        ),
      ]);
      setUsers(usersData ?? []);
      setDatabases(dbsData ?? []);
      setGrants(grantsData ?? []);
    } catch {
      toast("Failed to load MariaDB resources", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* -- Create user --------------------------------------------------------- */
  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;
    setCreatingUser(true);
    try {
      await api.post("/api/plugins/mariadb/users", {
        clusterID: clusterId,
        namespace,
        manifest: {
          apiVersion: "k8s.mariadb.com/v1alpha1",
          kind: "User",
          metadata: { name: newUserName, namespace },
          spec: {
            mariaDbRef: { name: newUserName },
            host: newUserHost || "%",
            passwordSecretKeyRef: newUserPassword
              ? { name: `${newUserName}-password`, key: "password" }
              : undefined,
          },
        },
      });
      toast("User created", { variant: "success" });
      setShowCreateUser(false);
      setNewUserName("");
      setNewUserHost("%");
      setNewUserPassword("");
      await fetchAll();
    } catch {
      toast("Failed to create user", { variant: "error" });
    } finally {
      setCreatingUser(false);
    }
  };

  /* -- Create database ----------------------------------------------------- */
  const handleCreateDb = async () => {
    if (!newDbName.trim()) return;
    setCreatingDb(true);
    try {
      await api.post("/api/plugins/mariadb/databases", {
        clusterID: clusterId,
        namespace,
        manifest: {
          apiVersion: "k8s.mariadb.com/v1alpha1",
          kind: "Database",
          metadata: { name: newDbName, namespace },
          spec: {
            mariaDbRef: { name: newDbName },
            characterSet: "utf8mb4",
            collate: "utf8mb4_unicode_ci",
          },
        },
      });
      toast("Database created", { variant: "success" });
      setShowCreateDb(false);
      setNewDbName("");
      await fetchAll();
    } catch {
      toast("Failed to create database", { variant: "error" });
    } finally {
      setCreatingDb(false);
    }
  };

  /* -- Create grant -------------------------------------------------------- */
  const handleCreateGrant = async () => {
    if (!grantUser.trim() || !grantDatabase.trim()) return;
    setCreatingGrant(true);
    try {
      const privileges = grantPrivileges
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await api.post("/api/plugins/mariadb/grants", {
        clusterID: clusterId,
        namespace,
        manifest: {
          apiVersion: "k8s.mariadb.com/v1alpha1",
          kind: "Grant",
          metadata: {
            name: `${grantUser}-${grantDatabase}-grant`,
            namespace,
          },
          spec: {
            mariaDbRef: { name: grantUser },
            privileges,
            database: grantDatabase,
            table: "*",
            username: grantUser,
            host: "%",
          },
        },
      });
      toast("Grant created", { variant: "success" });
      setShowCreateGrant(false);
      setGrantUser("");
      setGrantDatabase("");
      setGrantPrivileges("ALL PRIVILEGES");
      await fetchAll();
    } catch {
      toast("Failed to create grant", { variant: "error" });
    } finally {
      setCreatingGrant(false);
    }
  };

  /* -- Delete -------------------------------------------------------------- */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint =
        deleteTarget.type === "user"
          ? `/api/plugins/mariadb/users/${encodeURIComponent(deleteTarget.name)}?${queryParams}`
          : `/api/plugins/mariadb/databases/${encodeURIComponent(deleteTarget.name)}?${queryParams}`;
      await api.del(endpoint);
      toast(
        `${deleteTarget.type === "user" ? "User" : "Database"} deleted`,
        { variant: "success" }
      );
      setDeleteTarget(null);
      await fetchAll();
    } catch {
      toast(`Failed to delete ${deleteTarget.type}`, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Users ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-base">Users</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {users.length}
              </Badge>
            </div>
            <Button size="xs" onClick={() => setShowCreateUser(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              <span>Create User</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.name}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {user.host || "%"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setDeleteTarget({ type: "user", name: user.name })
                        }
                        title="Delete user"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Databases ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-base">Databases</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {databases.length}
              </Badge>
            </div>
            <Button size="xs" onClick={() => setShowCreateDb(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span>Create Database</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {databases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No databases found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {databases.map((db) => (
                  <TableRow key={db.name}>
                    <TableCell className="font-medium">{db.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setDeleteTarget({ type: "database", name: db.name })
                        }
                        title="Delete database"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Grants ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              <CardTitle className="text-base">Grants</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {grants.length}
              </Badge>
            </div>
            <Button size="xs" onClick={() => setShowCreateGrant(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span>Create Grant</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No grants found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Database</TableHead>
                  <TableHead>Privileges</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.name}>
                    <TableCell className="font-medium">{grant.user}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {grant.database}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {grant.privileges.map((priv) => (
                          <Badge
                            key={priv}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {priv}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create User Dialog ───────────────────────────────────────────── */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create MariaDB User</DialogTitle>
            <DialogDescription>
              Create a new MariaDB user resource in the cluster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Username</Label>
              <Input
                id="user-name"
                placeholder="myuser"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-host">Host</Label>
              <Input
                id="user-host"
                placeholder="%"
                value={newUserHost}
                onChange={(e) => setNewUserHost(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use % for any host, or specify a hostname/IP.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Password Secret Name</Label>
              <Input
                id="user-password"
                placeholder="Optional — secret ref name"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Name of the K8s secret containing the password (key:
                &quot;password&quot;).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateUser(false)}
              disabled={creatingUser}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={creatingUser || !newUserName.trim()}
            >
              {creatingUser ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Database Dialog ───────────────────────────────────────── */}
      <Dialog open={showCreateDb} onOpenChange={setShowCreateDb}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create MariaDB Database</DialogTitle>
            <DialogDescription>
              Create a new MariaDB database resource in the cluster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="db-name">Database Name</Label>
              <Input
                id="db-name"
                placeholder="mydb"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDb(false)}
              disabled={creatingDb}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDb}
              disabled={creatingDb || !newDbName.trim()}
            >
              {creatingDb ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Grant Dialog ──────────────────────────────────────────── */}
      <Dialog open={showCreateGrant} onOpenChange={setShowCreateGrant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Grant</DialogTitle>
            <DialogDescription>
              Grant privileges to a MariaDB user on a database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="grant-user">Username</Label>
              <Input
                id="grant-user"
                placeholder="myuser"
                value={grantUser}
                onChange={(e) => setGrantUser(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-db">Database</Label>
              <Input
                id="grant-db"
                placeholder="mydb"
                value={grantDatabase}
                onChange={(e) => setGrantDatabase(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-privs">Privileges</Label>
              <Input
                id="grant-privs"
                placeholder="ALL PRIVILEGES"
                value={grantPrivileges}
                onChange={(e) => setGrantPrivileges(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list (e.g., SELECT, INSERT, UPDATE, DELETE).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateGrant(false)}
              disabled={creatingGrant}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateGrant}
              disabled={
                creatingGrant || !grantUser.trim() || !grantDatabase.trim()
              }
            >
              {creatingGrant ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.type === "user" ? "User" : "Database"}`}
        description={`Are you sure you want to delete ${deleteTarget?.type} "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function DatabaseUsersTab({
  clusterId,
  dbName,
  namespace,
  isCNPG,
  isMariaDB,
  cnpgCluster,
}: DatabaseUsersTabProps) {
  if (isCNPG && cnpgCluster) {
    return (
      <CNPGUsersSection
        clusterId={clusterId}
        dbName={dbName}
        namespace={namespace}
        cnpgCluster={cnpgCluster}
      />
    );
  }

  if (isMariaDB) {
    return <MariaDBUsersSection clusterId={clusterId} namespace={namespace} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Users className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">
        User management is not available for this database engine.
      </p>
    </div>
  );
}
