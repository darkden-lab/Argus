"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Download,
  Clock,
  RotateCcw,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface K8sMetadata {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
}

interface BackupItem {
  metadata: K8sMetadata;
  status?: {
    phase?: string;
    startedAt?: string;
    stoppedAt?: string;
    completedAt?: string;
    error?: string;
  };
  spec?: Record<string, unknown>;
}

interface ScheduledBackupItem {
  metadata: K8sMetadata;
  spec?: {
    schedule?: string;
    cluster?: { name?: string };
    [key: string]: unknown;
  };
  status?: {
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
  };
}

interface BackupsListResponse {
  items: BackupItem[];
}

interface ScheduledBackupsListResponse {
  items: ScheduledBackupItem[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DatabaseBackupsTabProps {
  clusterId: string;
  dbName: string;
  namespace: string;
  engine: "postgresql" | "mariadb";
  isCNPG: boolean;
  isMariaDB: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function getBackupStatusVariant(
  phase?: string
): "default" | "secondary" | "destructive" | "success" | "warning" {
  switch (phase?.toLowerCase()) {
    case "completed":
      return "success";
    case "running":
    case "started":
    case "pending":
      return "warning";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

function buildCNPGBackupManifest(dbName: string, ns: string) {
  return {
    apiVersion: "postgresql.cnpg.io/v1",
    kind: "Backup",
    metadata: {
      name: `${dbName}-backup-${generateTimestamp()}`,
      namespace: ns,
    },
    spec: {
      cluster: { name: dbName },
    },
  };
}

function buildCNPGScheduledBackupManifest(
  dbName: string,
  ns: string,
  cronExpression: string
) {
  return {
    apiVersion: "postgresql.cnpg.io/v1",
    kind: "ScheduledBackup",
    metadata: {
      name: `${dbName}-scheduled-${generateTimestamp()}`,
      namespace: ns,
    },
    spec: {
      schedule: cronExpression,
      cluster: { name: dbName },
    },
  };
}

function buildMariaDBBackupManifest(dbName: string, ns: string) {
  return {
    apiVersion: "k8s.mariadb.com/v1alpha1",
    kind: "Backup",
    metadata: {
      name: `${dbName}-backup-${generateTimestamp()}`,
      namespace: ns,
    },
    spec: {
      mariaDbRef: { name: dbName },
    },
  };
}

function buildMariaDBRestoreManifest(
  dbName: string,
  ns: string,
  backupName: string
) {
  return {
    apiVersion: "k8s.mariadb.com/v1alpha1",
    kind: "Restore",
    metadata: {
      name: `${dbName}-restore-${generateTimestamp()}`,
      namespace: ns,
    },
    spec: {
      mariaDbRef: { name: dbName },
      backupRef: { name: backupName },
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DatabaseBackupsTab({
  clusterId,
  dbName,
  namespace,
  engine,
  isCNPG,
  isMariaDB,
}: DatabaseBackupsTabProps) {
  // State — backups
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // State — scheduled backups (CNPG only)
  const [scheduledBackups, setScheduledBackups] = useState<
    ScheduledBackupItem[]
  >([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);

  // State — create scheduled backup dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [creatingScheduled, setCreatingScheduled] = useState(false);

  // State — restore confirm (MariaDB only)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Determine API prefix based on engine
  const pluginPrefix = engine === "postgresql" ? "cnpg" : "mariadb";

  // -------------------------------------------------------------------------
  // Fetch backups
  // -------------------------------------------------------------------------

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const data = await api.get<BackupsListResponse>(
        `/api/plugins/${pluginPrefix}/backups?clusterID=${clusterId}&namespace=${namespace}`
      );
      setBackups(data.items ?? []);
    } catch {
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }, [clusterId, namespace, pluginPrefix]);

  const fetchScheduledBackups = useCallback(async () => {
    if (!isCNPG) return;
    setLoadingScheduled(true);
    try {
      const data = await api.get<ScheduledBackupsListResponse>(
        `/api/plugins/cnpg/scheduledbackups?clusterID=${clusterId}&namespace=${namespace}`
      );
      setScheduledBackups(data.items ?? []);
    } catch {
      setScheduledBackups([]);
    } finally {
      setLoadingScheduled(false);
    }
  }, [clusterId, namespace, isCNPG]);

  useEffect(() => {
    fetchBackups();
    fetchScheduledBackups();
  }, [fetchBackups, fetchScheduledBackups]);

  // -------------------------------------------------------------------------
  // Create on-demand backup
  // -------------------------------------------------------------------------

  async function handleCreateBackup() {
    setCreatingBackup(true);
    try {
      const manifest = isCNPG
        ? buildCNPGBackupManifest(dbName, namespace)
        : buildMariaDBBackupManifest(dbName, namespace);

      await api.post(`/api/plugins/${pluginPrefix}/backups`, {
        clusterID: clusterId,
        namespace,
        manifest,
      });

      toast("Backup Created", {
        description: `Backup for ${dbName} has been initiated.`,
        variant: "success",
      });
      await fetchBackups();
    } catch {
      toast("Backup Failed", {
        description: "Could not create backup. Check cluster connectivity and permissions.",
        variant: "error",
      });
    } finally {
      setCreatingBackup(false);
    }
  }

  // -------------------------------------------------------------------------
  // Create scheduled backup (CNPG only)
  // -------------------------------------------------------------------------

  async function handleCreateScheduledBackup() {
    if (!cronExpression.trim()) return;
    setCreatingScheduled(true);
    try {
      const manifest = buildCNPGScheduledBackupManifest(
        dbName,
        namespace,
        cronExpression.trim()
      );

      await api.post("/api/plugins/cnpg/scheduledbackups", {
        clusterID: clusterId,
        namespace,
        manifest,
      });

      toast("Scheduled Backup Created", {
        description: `Schedule "${cronExpression.trim()}" set for ${dbName}.`,
        variant: "success",
      });
      setScheduleDialogOpen(false);
      setCronExpression("0 0 * * *");
      await fetchScheduledBackups();
    } catch {
      toast("Failed to Create Schedule", {
        description: "Could not create scheduled backup.",
        variant: "error",
      });
    } finally {
      setCreatingScheduled(false);
    }
  }

  // -------------------------------------------------------------------------
  // Restore from backup (MariaDB only)
  // -------------------------------------------------------------------------

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const manifest = buildMariaDBRestoreManifest(
        dbName,
        namespace,
        restoreTarget
      );

      await api.post("/api/plugins/mariadb/restores", {
        clusterID: clusterId,
        namespace,
        manifest,
      });

      toast("Restore Initiated", {
        description: `Restoring ${dbName} from backup "${restoreTarget}".`,
        variant: "success",
      });
      setRestoreConfirmOpen(false);
      setRestoreTarget(null);
    } catch {
      toast("Restore Failed", {
        description: "Could not initiate restore. Check permissions.",
        variant: "error",
      });
    } finally {
      setRestoring(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderBackupsTable() {
    if (loadingBackups) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading backups...
          </span>
        </div>
      );
    }

    if (backups.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Download className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No backups found</p>
          <p className="text-xs">
            Create an on-demand backup to get started.
          </p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Completed</TableHead>
            {isMariaDB && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {backups.map((backup) => {
            const phase = backup.status?.phase ?? "Unknown";
            const started =
              backup.status?.startedAt ?? backup.metadata.creationTimestamp;
            const completed =
              backup.status?.stoppedAt ?? backup.status?.completedAt;

            return (
              <TableRow key={backup.metadata.name}>
                <TableCell className="font-mono text-xs">
                  {backup.metadata.name}
                </TableCell>
                <TableCell>
                  <Badge variant={getBackupStatusVariant(phase)}>
                    {phase}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(started)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(completed)}
                </TableCell>
                {isMariaDB && (
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setRestoreTarget(backup.metadata.name);
                        setRestoreConfirmOpen(true);
                      }}
                      disabled={phase.toLowerCase() !== "completed" && phase.toLowerCase() !== "complete"}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  function renderScheduledBackups() {
    if (!isCNPG) return null;

    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Scheduled Backups</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScheduleDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Schedule
          </Button>
        </CardHeader>
        <CardContent>
          {loadingScheduled ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading schedules...
              </span>
            </div>
          ) : scheduledBackups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No scheduled backups</p>
              <p className="text-xs">
                Create a schedule to automate backups.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Schedule (Cron)</TableHead>
                  <TableHead>Last Scheduled</TableHead>
                  <TableHead>Last Successful</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledBackups.map((sb) => (
                  <TableRow key={sb.metadata.name}>
                    <TableCell className="font-mono text-xs">
                      {sb.metadata.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {sb.spec?.schedule ?? "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(sb.status?.lastScheduleTime)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(sb.status?.lastSuccessfulTime)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* On-demand Backups */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Backups</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                fetchBackups();
                fetchScheduledBackups();
              }}
              disabled={loadingBackups}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingBackups ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateBackup}
              disabled={creatingBackup}
            >
              {creatingBackup ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create Backup
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>{renderBackupsTable()}</CardContent>
      </Card>

      {/* Scheduled Backups (CNPG only) */}
      {renderScheduledBackups()}

      {/* Create Scheduled Backup Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Scheduled Backup</DialogTitle>
            <DialogDescription>
              Set a cron schedule for automatic backups of{" "}
              <span className="font-mono font-semibold">{dbName}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cron-expression">Cron Expression</Label>
              <Input
                id="cron-expression"
                placeholder="0 0 * * *"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Standard 5-field cron format (minute hour day month weekday).
                Example: <span className="font-mono">0 2 * * *</span> runs
                daily at 2:00 AM.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
              disabled={creatingScheduled}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateScheduledBackup}
              disabled={creatingScheduled || !cronExpression.trim()}
            >
              {creatingScheduled ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Clock className="mr-1.5 h-4 w-4" />
                  Create Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirm Dialog (MariaDB only) */}
      <ConfirmDialog
        open={restoreConfirmOpen}
        onOpenChange={setRestoreConfirmOpen}
        title="Restore from Backup"
        description={`This will restore the database "${dbName}" from backup "${restoreTarget ?? ""}". This may overwrite existing data. Are you sure you want to proceed?`}
        confirmLabel="Restore"
        variant="destructive"
        onConfirm={handleRestore}
        loading={restoring}
      />
    </div>
  );
}
