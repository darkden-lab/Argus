"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/stores/ai-chat";

interface ConfirmActionProps {
  confirmAction: NonNullable<ChatMessage["confirmAction"]>;
  onConfirm: (confirmId: string, approved: boolean) => void;
}

export function ConfirmAction({ confirmAction, onConfirm }: ConfirmActionProps) {
  const isPending = confirmAction.status === "pending";
  const isApproved = confirmAction.status === "approved";
  const isRejected = confirmAction.status === "rejected";

  return (
    <div className="mx-4 my-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-500">
            Action requires confirmation
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono font-medium">{confirmAction.tool}</span>
            {" - "}
            {confirmAction.description}
          </p>

          {isPending && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onConfirm(confirmAction.id, true)}
              >
                <Check className="h-3 w-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onConfirm(confirmAction.id, false)}
              >
                <X className="h-3 w-3" />
                Reject
              </Button>
            </div>
          )}

          {isApproved && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-500">
              <Check className="h-3 w-3" />
              Approved
            </div>
          )}

          {isRejected && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
              <X className="h-3 w-3" />
              Rejected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
