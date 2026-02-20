"use client";

import { WebTerminal } from "@/components/terminal/web-terminal";
import { RBACGate } from "@/components/auth/rbac-gate";

export default function TerminalPage() {
  return (
    <RBACGate resource="terminal" action="read">
      <div className="flex h-full flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground">
            Execute kubectl commands against your clusters.
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <WebTerminal />
        </div>
      </div>
    </RBACGate>
  );
}
