"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save } from "lucide-react";
import { YamlEditor } from "./yaml-editor";

interface KeyValue {
  key: string;
  value: string;
}

interface Event {
  type: string;
  reason: string;
  message: string;
  timestamp: string;
}

interface ResourceDetailProps {
  name: string;
  kind: string;
  namespace?: string;
  overview: KeyValue[];
  yaml: string;
  events: Event[];
  onDelete?: () => void;
  onSaveYaml?: (yaml: string) => void;
  deleting?: boolean;
}

export function ResourceDetail({
  name,
  kind,
  namespace,
  overview,
  yaml,
  events,
  onDelete,
  onSaveYaml,
  deleting,
}: ResourceDetailProps) {
  const [editedYaml, setEditedYaml] = useState(yaml);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const yamlChanged = editedYaml !== yaml;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{name}</h2>
          <Badge variant="secondary">{kind}</Badge>
          {namespace && (
            <Badge variant="outline">{namespace}</Badge>
          )}
        </div>
        {onDelete && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {kind}</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{name}</strong>
                  {namespace && <> in namespace <strong>{namespace}</strong></>}?
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => {
                    onDelete();
                    setDeleteOpen(false);
                  }}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                {overview.map((kv) => (
                  <tr key={kv.key} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium text-muted-foreground w-1/3">
                      {kv.key}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {kv.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="yaml" className="mt-4 space-y-3">
          <YamlEditor value={editedYaml} onChange={setEditedYaml} />
          {onSaveYaml && yamlChanged && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onSaveYaml(editedYaml)}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save Changes
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No events.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Badge
                    variant={
                      event.type === "Warning" ? "destructive" : "secondary"
                    }
                    className="mt-0.5 shrink-0"
                  >
                    {event.type}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {event.reason}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.timestamp}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground break-all">
                      {event.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
