"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, Plus, Pencil, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import Link from "next/link";

interface Memory {
  id: string;
  user_id: string;
  content: string;
  category: "preference" | "fact" | "learning" | "general";
  created_at: string;
  updated_at: string;
}

const categoryConfig: Record<
  Memory["category"],
  { label: string; className: string }
> = {
  preference: { label: "Preference", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  fact: { label: "Fact", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  learning: { label: "Learning", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
  general: { label: "General", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300" },
};

const categories: Memory["category"][] = ["preference", "fact", "learning", "general"];

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deletingMemory, setDeletingMemory] = useState<Memory | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Memory["category"]>("general");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const data = await api.get<Memory[]>("/api/ai/memories");
      setMemories(data || []);
    } catch {
      // api client shows toast on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const openAddDialog = () => {
    setEditingMemory(null);
    setContent("");
    setCategory("general");
    setDialogOpen(true);
  };

  const openEditDialog = (memory: Memory) => {
    setEditingMemory(memory);
    setContent(memory.content);
    setCategory(memory.category);
    setDialogOpen(true);
  };

  const openDeleteDialog = (memory: Memory) => {
    setDeletingMemory(memory);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setIsSaving(true);
    try {
      if (editingMemory) {
        await api.put(`/api/ai/memories/${editingMemory.id}`, { content, category });
        toast("Memory updated", { variant: "success" });
      } else {
        await api.post("/api/ai/memories", { content, category });
        toast("Memory created", { variant: "success" });
      }
      setDialogOpen(false);
      fetchMemories();
    } catch {
      // api client shows toast on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingMemory) return;
    setIsDeleting(true);
    try {
      await api.del(`/api/ai/memories/${deletingMemory.id}`);
      toast("Memory deleted", { variant: "success" });
      setDeleteDialogOpen(false);
      setDeletingMemory(null);
      fetchMemories();
    } catch {
      // api client shows toast on error
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings/ai">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6" />
            AI Memories
          </h2>
          <p className="text-muted-foreground">
            Manage persistent memories that the AI assistant uses across conversations.
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Memory
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-20 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No memories saved yet
            </p>
            <p className="text-sm text-muted-foreground">
              Add memories to help the AI assistant remember important context.
            </p>
            <Button className="mt-4" onClick={openAddDialog}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add First Memory
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memories.map((memory) => {
            const catConfig = categoryConfig[memory.category] || categoryConfig.general;
            return (
              <Card key={memory.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn("text-xs", catConfig.className)}>
                      {catConfig.label}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(memory)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(memory)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{memory.content}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {memory.updated_at !== memory.created_at ? "Updated" : "Created"}{" "}
                    {new Date(memory.updated_at || memory.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMemory ? "Edit Memory" : "Add Memory"}</DialogTitle>
            <DialogDescription>
              {editingMemory
                ? "Update this memory for the AI assistant."
                : "Add a new memory that the AI assistant will use across conversations."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="e.g., Our production cluster uses Istio for service mesh..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Memory["category"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryConfig[cat].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingMemory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingMemory && (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              {deletingMemory.content.length > 150
                ? deletingMemory.content.slice(0, 150) + "..."
                : deletingMemory.content}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
