"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, File, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  sessionId: string;
  currentPath: string;
  onUploaded: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function UploadDialog({
  open,
  onOpenChange,
  clusterId,
  sessionId,
  currentPath,
  onUploaded,
}: UploadDialogProps) {
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleReset() {
    setFile(null);
    setError(null);
    setUploading(false);
  }

  function handleClose(v: boolean) {
    if (!v) handleReset();
    onOpenChange(v);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFile(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/upload?path=${encodeURIComponent(currentPath)}`,
        file,
      );
      handleReset();
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload a file to <code className="text-xs bg-muted px-1 py-0.5 rounded">{currentPath}</code>
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <File className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm text-left">
                <p className="font-medium truncate max-w-[250px]">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop a file, or{" "}
                <button
                  className="text-primary underline"
                  onClick={() => inputRef.current?.click()}
                >
                  browse
                </button>
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) setFile(selected);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
