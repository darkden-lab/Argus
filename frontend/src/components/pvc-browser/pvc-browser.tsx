"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FolderPlus,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { usePVCBrowserStore } from "@/stores/pvc-browser";
import { api } from "@/lib/api";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { FileList } from "./file-list";
import { FileViewer } from "./file-viewer";
import { UploadDialog } from "./upload-dialog";

interface PVCBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  namespace: string;
  pvcName: string;
}

export function PVCBrowser({
  open,
  onOpenChange,
  clusterId,
  namespace,
  pvcName,
}: PVCBrowserProps) {
  const store = usePVCBrowserStore();
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    if (open) {
      store.startSession(clusterId, namespace, pvcName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clusterId, namespace, pvcName]);

  const handleClose = useCallback(
    async (v: boolean) => {
      if (!v) {
        await store.stopSession();
        store.reset();
      }
      onOpenChange(v);
    },
    [store, onOpenChange],
  );

  function handleDownload(path: string, fileName: string) {
    if (!store.sessionId) return;
    api
      .downloadBlob(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${store.sessionId}/download?path=${encodeURIComponent(path)}`,
      )
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  function handleDelete(path: string, isDir: boolean) {
    store.deleteItem(path, isDir);
  }

  function handleRename(oldPath: string, newName: string) {
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    store.renameItem(oldPath, parts.join("/"));
  }

  function handleCreateFolder() {
    if (newFolderName.trim()) {
      store.createFolder(newFolderName.trim());
      setNewFolderName("");
      setShowNewFolder(false);
    }
  }

  const isStarting = store.loading && !store.sessionId;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>PVC Browser — {pvcName}</DialogTitle>
            <DialogDescription>
              {namespace} · {clusterId}
            </DialogDescription>
          </DialogHeader>

          {isStarting ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Starting browser session...
              </p>
            </div>
          ) : store.error && !store.sessionId ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-500">
              <AlertCircle className="h-6 w-6" />
              <p className="text-sm">{store.error}</p>
            </div>
          ) : (
            <>
              <div className="px-6 pb-2">
                <BreadcrumbNav
                  currentPath={store.currentPath}
                  onNavigate={store.navigate}
                />
              </div>

              <div className="flex items-center gap-2 px-6 pb-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setShowUpload(true)}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload
                </Button>

                {showNewFolder ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateFolder();
                    }}
                  >
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="h-7 w-40 text-sm"
                      autoFocus
                    />
                    <Button size="sm" className="h-7" type="submit">
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      type="button"
                      onClick={() => {
                        setShowNewFolder(false);
                        setNewFolderName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => setShowNewFolder(true)}
                  >
                    <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                    New Folder
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 ml-auto"
                  onClick={store.refresh}
                  disabled={store.loading}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${store.loading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {store.error && (
                <div className="px-6 pb-2">
                  <p className="text-xs text-red-500">{store.error}</p>
                </div>
              )}

              <ScrollArea className="flex-1 min-h-0 px-6">
                {store.loading && store.sessionId && store.files.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <FileList
                    files={store.files}
                    currentPath={store.currentPath}
                    onNavigate={store.navigate}
                    onSelect={store.selectFile}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    onRename={handleRename}
                  />
                )}
              </ScrollArea>

              {store.selectedFile && (
                <FileViewer
                  file={store.selectedFile}
                  content={store.fileContent}
                  isBinary={store.fileIsBinary}
                  currentPath={store.currentPath}
                  loading={store.loading}
                  onSave={store.saveFile}
                  onDownload={handleDownload}
                  onClose={store.clearSelection}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {store.sessionId && (
        <UploadDialog
          open={showUpload}
          onOpenChange={setShowUpload}
          clusterId={clusterId}
          sessionId={store.sessionId}
          currentPath={store.currentPath}
          onUploaded={store.refresh}
        />
      )}
    </>
  );
}
