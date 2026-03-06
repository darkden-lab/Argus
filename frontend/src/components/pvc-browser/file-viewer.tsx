"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save, Download, X, FileWarning } from "lucide-react";
import type { FileInfo } from "@/stores/pvc-browser";

interface FileViewerProps {
  file: FileInfo;
  content: string | null;
  isBinary: boolean;
  currentPath: string;
  loading: boolean;
  onSave: (path: string, content: string) => void;
  onDownload: (path: string, fileName: string) => void;
  onClose: () => void;
}

export function FileViewer({
  file,
  content,
  isBinary,
  currentPath,
  loading,
  onSave,
  onDownload,
  onClose,
}: FileViewerProps) {
  const [editContent, setEditContent] = useState(content ?? "");
  const filePath =
    currentPath === "/"
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
  const isDirty = editContent !== (content ?? "");

  useEffect(() => {
    setEditContent(content ?? "");
  }, [content]);

  if (isBinary) {
    return (
      <div className="border-t bg-muted/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileWarning className="h-4 w-4 text-yellow-500" />
            {file.name}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
          <p>Binary file — download to view</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDownload(filePath, file.name)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-sm font-medium truncate">{file.name}</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!isDirty || loading}
            onClick={() => onSave(filePath, editContent)}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => onDownload(filePath, file.name)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <textarea
        className="w-full min-h-[200px] max-h-[400px] bg-background p-4 font-mono text-sm resize-y outline-none"
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
