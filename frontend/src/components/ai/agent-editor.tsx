"use client";

import { useState, useRef } from "react";
import {
  Bot,
  Search,
  Shield,
  TrendingDown,
  FileText,
  HeartPulse,
  Zap,
  Database,
  Globe,
  Terminal,
  Settings,
  AlertTriangle,
  Eye,
  Cpu,
  Network,
  Lock,
  Trash2,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Agent } from "@/stores/ai-chat";

const iconOptions: { name: string; icon: LucideIcon }[] = [
  { name: "bot", icon: Bot },
  { name: "search", icon: Search },
  { name: "shield", icon: Shield },
  { name: "trending_down", icon: TrendingDown },
  { name: "file_text", icon: FileText },
  { name: "heart_pulse", icon: HeartPulse },
  { name: "zap", icon: Zap },
  { name: "database", icon: Database },
  { name: "globe", icon: Globe },
  { name: "terminal", icon: Terminal },
  { name: "settings", icon: Settings },
  { name: "alert_triangle", icon: AlertTriangle },
  { name: "eye", icon: Eye },
  { name: "cpu", icon: Cpu },
  { name: "network", icon: Network },
  { name: "lock", icon: Lock },
];

const categories = [
  { value: "general", label: "General" },
  { value: "diagnostics", label: "Diagnostics" },
  { value: "security", label: "Security" },
  { value: "operations", label: "Operations" },
];

const workflowModes = [
  { value: "interactive", label: "Interactive" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

const toolPermissionLevels = [
  { value: "inherit", label: "Inherit" },
  { value: "read_only", label: "Read Only" },
  { value: "all", label: "All" },
];

const toolGroups = [
  {
    label: "Read tools",
    tools: ["list_pods", "list_deployments", "list_services", "list_events", "get_logs"],
  },
  {
    label: "Write tools",
    tools: ["kubectl_apply", "kubectl_delete", "scale_deployment", "restart_deployment"],
  },
  {
    label: "Analysis tools",
    tools: ["analyze_logs", "check_health", "resource_usage"],
  },
  {
    label: "Integration tools",
    tools: ["prometheus_query", "istio_config"],
  },
];

interface WorkflowStep {
  name: string;
  description: string;
}

interface AgentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSaved: () => void;
}

export function AgentEditor({ open, onOpenChange, agent, onSaved }: AgentEditorProps) {
  const isEditing = !!agent;

  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [icon, setIcon] = useState(agent?.icon || "bot");
  const [category, setCategory] = useState(agent?.category || "general");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || "");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>(
    agent?.workflow_steps?.map((s) => ({ name: s.name, description: s.description })) || []
  );
  const [workflowMode, setWorkflowMode] = useState(agent?.workflow_mode || "interactive");
  const [allowedTools, setAllowedTools] = useState<string[]>(agent?.allowed_tools || []);
  const [toolPermissionLevel, setToolPermissionLevel] = useState(
    agent?.tool_permission_level || "inherit"
  );
  const [saving, setSaving] = useState(false);

  // Reset form state when dialog opens or agent changes
  const prevOpenRef = useRef(open);
  if (open && !prevOpenRef.current) {
    // Dialog just opened — sync state from agent prop
    setName(agent?.name || "");
    setDescription(agent?.description || "");
    setIcon(agent?.icon || "bot");
    setCategory(agent?.category || "general");
    setSystemPrompt(agent?.system_prompt || "");
    setWorkflowSteps(
      agent?.workflow_steps?.map((s) => ({ name: s.name, description: s.description })) || []
    );
    setWorkflowMode(agent?.workflow_mode || "interactive");
    setAllowedTools(agent?.allowed_tools || []);
    setToolPermissionLevel(agent?.tool_permission_level || "inherit");
    setSaving(false);
  }
  prevOpenRef.current = open;

  const toggleTool = (tool: string) => {
    setAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const addStep = () => {
    setWorkflowSteps((prev) => [...prev, { name: "", description: "" }]);
  };

  const removeStep = (index: number) => {
    setWorkflowSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof WorkflowStep, value: string) => {
    setWorkflowSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name,
        description,
        icon,
        category,
        system_prompt: systemPrompt,
        workflow_steps: workflowSteps.map((s, i) => ({
          step: i + 1,
          name: s.name,
          description: s.description,
        })),
        workflow_mode: workflowMode,
        allowed_tools: allowedTools,
        tool_permission_level: toolPermissionLevel,
      };
      if (isEditing) {
        await api.put(`/api/ai/agents/${agent.id}`, body);
      } else {
        await api.post("/api/ai/agents", body);
      }
      onSaved();
      onOpenChange(false);
    } catch {
      // Error handled by api client toast
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await api.del(`/api/ai/agents/${agent.id}`);
      onSaved();
      onOpenChange(false);
    } catch {
      // Error handled by api client toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Agent" : "Create Agent"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify the agent configuration."
              : "Create a custom AI agent with specific capabilities."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="agent-desc">Description</Label>
              <Textarea
                id="agent-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={2}
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid grid-cols-8 gap-1.5">
                {iconOptions.map((opt) => {
                  const IconComp = opt.icon;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className={cn(
                        "flex items-center justify-center rounded-md border p-2 transition-colors",
                        icon === opt.name
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                      onClick={() => setIcon(opt.name)}
                      aria-label={`Select ${opt.name.replace(/_/g, " ")} icon`}
                      aria-pressed={icon === opt.name}
                    >
                      <IconComp className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt */}
            <div className="space-y-1.5">
              <Label htmlFor="agent-prompt">System Prompt</Label>
              <Textarea
                id="agent-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a Kubernetes expert that..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            {/* Workflow Steps */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Workflow Steps</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addStep} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  Add Step
                </Button>
              </div>
              {workflowSteps.length === 0 && (
                <p className="text-xs text-muted-foreground">No steps defined. The agent will operate freely.</p>
              )}
              <div className="space-y-2">
                {workflowSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <span className="mt-1.5 text-xs text-muted-foreground font-medium w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={step.name}
                        onChange={(e) => updateStep(i, "name", e.target.value)}
                        placeholder="Step name"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={step.description}
                        onChange={(e) => updateStep(i, "description", e.target.value)}
                        placeholder="Step description"
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStep(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow Mode */}
            <div className="space-y-1.5">
              <Label>Workflow Mode</Label>
              <Select value={workflowMode} onValueChange={setWorkflowMode}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workflowModes.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Allowed Tools */}
            <div className="space-y-1.5">
              <Label>Allowed Tools</Label>
              <div className="space-y-3">
                {toolGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tools.map((tool) => (
                        <button
                          key={tool}
                          type="button"
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-xs transition-colors",
                            allowedTools.includes(tool)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent"
                          )}
                          onClick={() => toggleTool(tool)}
                          aria-pressed={allowedTools.includes(tool)}
                        >
                          {tool}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool Permission Level */}
            <div className="space-y-1.5">
              <Label>Tool Permission Level</Label>
              <Select value={toolPermissionLevel} onValueChange={setToolPermissionLevel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toolPermissionLevels.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          {isEditing && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              className="mr-auto gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
