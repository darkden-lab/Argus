"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Globe, Terminal, Key } from "lucide-react";

interface DatabaseConnectionTabProps {
  clusterId: string;
  dbName: string;
  namespace: string;
  engine: string;
  services: Array<{
    metadata: { name: string; uid?: string };
    spec?: {
      clusterIP?: string;
      ports?: Array<{ port: number; protocol?: string }>;
    };
  }>;
  isCNPG: boolean;
  cnpgCluster?: {
    spec?: {
      bootstrap?: { initdb?: { database?: string; owner?: string } };
    };
    metadata: { name: string };
  } | null;
}

function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedKey(key);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopiedKey(null), 2000);
      })
      .catch(() => {
        // Clipboard API not available or permission denied
      });
  }, []);

  return { copiedKey, copy };
}

interface CopyBoxProps {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

function CopyBox({ label, value, copyKey, copiedKey, onCopy }: CopyBoxProps) {
  const isCopied = copiedKey === copyKey;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
        <code className="flex-1 overflow-x-auto text-xs font-mono whitespace-nowrap">
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          onClick={() => onCopy(value, copyKey)}
          aria-label={`Copy ${label}`}
        >
          {isCopied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
        {isCopied && (
          <span className="text-[10px] text-green-500 shrink-0">Copied!</span>
        )}
      </div>
    </div>
  );
}

function getConnectionDetails(
  engine: string,
  dbName: string,
  isCNPG: boolean,
  cnpgCluster?: DatabaseConnectionTabProps["cnpgCluster"]
) {
  if (isCNPG && (engine === "postgresql" || engine === "postgres")) {
    const database =
      cnpgCluster?.spec?.bootstrap?.initdb?.database || "app";
    const user = cnpgCluster?.spec?.bootstrap?.initdb?.owner || "app";
    const rwService = `${dbName}-rw`;
    const roService = `${dbName}-ro`;
    const rService = `${dbName}-r`;
    const port = 5432;

    return {
      database,
      user,
      port,
      services: [
        { name: rwService, role: "Read-Write" },
        { name: roService, role: "Read-Only" },
        { name: rService, role: "Read" },
      ],
      connectionStrings: [
        {
          label: "PostgreSQL URI (read-write)",
          value: `postgresql://${user}:<password>@${rwService}:${port}/${database}`,
        },
        {
          label: "PostgreSQL URI (read-only)",
          value: `postgresql://${user}:<password>@${roService}:${port}/${database}`,
        },
      ],
      cliCommands: [
        {
          label: "psql (read-write)",
          value: `psql -h ${rwService} -p ${port} -U ${user} -d ${database}`,
        },
        {
          label: "psql (read-only)",
          value: `psql -h ${roService} -p ${port} -U ${user} -d ${database}`,
        },
      ],
      portForwardCommands: [
        {
          label: "kubectl port-forward (read-write)",
          value: `kubectl port-forward svc/${rwService} ${port}:${port}`,
        },
        {
          label: "kubectl port-forward (read-only)",
          value: `kubectl port-forward svc/${roService} ${port}:${port}`,
        },
      ],
      secretName: `${dbName}-app`,
    };
  }

  if (engine === "mariadb" || engine === "mysql") {
    const database = dbName;
    const user = "root";
    const service = dbName;
    const port = 3306;

    return {
      database,
      user,
      port,
      services: [{ name: service, role: "Primary" }],
      connectionStrings: [
        {
          label: "MySQL/MariaDB URI",
          value: `mysql://${user}:<password>@${service}:${port}/${database}`,
        },
      ],
      cliCommands: [
        {
          label: "mysql CLI",
          value: `mysql -h ${service} -P ${port} -u ${user} -p ${database}`,
        },
      ],
      portForwardCommands: [
        {
          label: "kubectl port-forward",
          value: `kubectl port-forward svc/${service} ${port}:${port}`,
        },
      ],
      secretName: `${dbName}-credentials`,
    };
  }

  // Generic fallback for postgresql without CNPG or other engines
  const database = dbName;
  const user = "postgres";
  const service = dbName;
  const port = engine === "postgresql" || engine === "postgres" ? 5432 : 3306;
  const protocol =
    engine === "postgresql" || engine === "postgres" ? "postgresql" : engine;
  const cli =
    engine === "postgresql" || engine === "postgres" ? "psql" : engine;

  return {
    database,
    user,
    port,
    services: [{ name: service, role: "Primary" }],
    connectionStrings: [
      {
        label: `${protocol} URI`,
        value: `${protocol}://${user}:<password>@${service}:${port}/${database}`,
      },
    ],
    cliCommands: [
      {
        label: `${cli} CLI`,
        value: `${cli} -h ${service} -p ${port} -U ${user} -d ${database}`,
      },
    ],
    portForwardCommands: [
      {
        label: "kubectl port-forward",
        value: `kubectl port-forward svc/${service} ${port}:${port}`,
      },
    ],
    secretName: `${dbName}-credentials`,
  };
}

export function DatabaseConnectionTab({
  dbName,
  namespace,
  engine,
  services,
  isCNPG,
  cnpgCluster,
}: DatabaseConnectionTabProps) {
  const { copiedKey, copy } = useCopyToClipboard();

  const details = getConnectionDetails(engine, dbName, isCNPG, cnpgCluster);

  return (
    <div className="space-y-4">
      {/* Connection Strings */}
      <Card className="py-4">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Connection Strings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {details.connectionStrings.map((cs) => (
            <CopyBox
              key={cs.label}
              label={cs.label}
              value={cs.value}
              copyKey={`cs-${cs.label}`}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
        </CardContent>
      </Card>

      {/* CLI Commands */}
      <Card className="py-4">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">CLI Commands</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {details.cliCommands.map((cmd) => (
            <CopyBox
              key={cmd.label}
              label={cmd.label}
              value={cmd.value}
              copyKey={`cli-${cmd.label}`}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
          {details.portForwardCommands.map((cmd) => (
            <CopyBox
              key={cmd.label}
              label={cmd.label}
              value={cmd.value}
              copyKey={`pf-${cmd.label}`}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
        </CardContent>
      </Card>

      {/* Service Endpoints */}
      <Card className="py-4">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Service Endpoints</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {services.map((svc) => {
              const clusterIP = svc.spec?.clusterIP || "None";
              const ports = svc.spec?.ports || [];
              const inferredRole = details.services.find(
                (s) => s.name === svc.metadata.name
              );

              return (
                <div
                  key={svc.metadata.uid || svc.metadata.name}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono truncate">
                      {svc.metadata.name}
                    </span>
                    {inferredRole && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {inferredRole.role}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {clusterIP}
                      {ports.length > 0 && (
                        <>
                          :
                          {ports
                            .map(
                              (p) =>
                                `${p.port}${p.protocol ? `/${p.protocol}` : ""}`
                            )
                            .join(", ")}
                        </>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        copy(
                          `${svc.metadata.name}.${namespace}.svc.cluster.local`,
                          `svc-${svc.metadata.name}`
                        )
                      }
                      aria-label={`Copy service DNS for ${svc.metadata.name}`}
                    >
                      {copiedKey === `svc-${svc.metadata.name}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
            {services.length === 0 && (
              <div className="text-xs text-muted-foreground py-2">
                No services found for this database.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Secret References */}
      <Card className="py-4">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Secret References</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono truncate">
                  {details.secretName}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  Secret
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {namespace}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    copy(details.secretName, `secret-${details.secretName}`)
                  }
                  aria-label={`Copy secret name ${details.secretName}`}
                >
                  {copiedKey === `secret-${details.secretName}` ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
            {isCNPG && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono truncate">
                    {dbName}-superuser
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    Superuser Secret
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {namespace}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() =>
                      copy(
                        `${dbName}-superuser`,
                        `secret-${dbName}-superuser`
                      )
                    }
                    aria-label={`Copy secret name ${dbName}-superuser`}
                  >
                    {copiedKey === `secret-${dbName}-superuser` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
