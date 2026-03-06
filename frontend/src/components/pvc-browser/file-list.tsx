"use client";

import { useState } from "react";
import { Folder, File, Download, Trash2, Pencil, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FileInfo } from "@/stores/pvc-browser";

interface FileListProps {
  files: FileInfo[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onSelect: (file: FileInfo) => void;
  onDownload: (path: string, fileName: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onRename: (oldPath: string, newName: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortFiles(files: FileInfo[]): FileInfo[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function RenamePopover({
  name,
  onRename,
}: {
  name: string;
  onRename: (newName: string) => void;
}) {
  const [newName, setNewName] = useState(name);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName && newName !== name) {
              onRename(newName);
              setOpen(false);
            }
          }}
        >
          <label className="text-xs font-medium text-muted-foreground">
            Rename
          </label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 h-8 text-sm"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-7">
              Rename
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function FileList({
  files,
  currentPath,
  onNavigate,
  onSelect,
  onDownload,
  onDelete,
  onRename,
}: FileListProps) {
  const sorted = sortFiles(files);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        This directory is empty
      </div>
    );
  }

  function buildPath(name: string) {
    return currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%]">Name</TableHead>
          <TableHead className="w-[12%]">Size</TableHead>
          <TableHead className="w-[18%]">Modified</TableHead>
          <TableHead className="w-[12%]">Permissions</TableHead>
          <TableHead className="w-[18%] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((file) => (
          <TableRow key={file.name}>
            <TableCell>
              <button
                className="flex items-center gap-2 text-sm hover:underline text-left"
                onClick={() =>
                  file.is_dir
                    ? onNavigate(buildPath(file.name))
                    : onSelect(file)
                }
              >
                {file.is_dir ? (
                  <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
                {file.is_symlink && (
                  <Link className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </button>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {file.is_dir ? "-" : formatSize(file.size)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDate(file.mod_time)}
            </TableCell>
            <TableCell className="text-xs font-mono text-muted-foreground">
              {file.permissions || "-"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-0.5">
                {!file.is_dir && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDownload(buildPath(file.name), file.name)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
                <RenamePopover
                  name={file.name}
                  onRename={(newName) =>
                    onRename(buildPath(file.name), newName)
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-500"
                  onClick={() => onDelete(buildPath(file.name), file.is_dir)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
