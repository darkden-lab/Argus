"use client";

import {
  Bot,
  Search,
  Shield,
  TrendingDown,
  FileText,
  HeartPulse,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/stores/ai-chat";

const iconMap: Record<string, LucideIcon> = {
  bot: Bot,
  search: Search,
  shield: Shield,
  trending_down: TrendingDown,
  file_text: FileText,
  heart_pulse: HeartPulse,
};

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Bot;
}

interface AgentSelectorProps {
  agents: Agent[];
  activeAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onCreateAgent: () => void;
}

export function AgentSelector({
  agents,
  activeAgentId,
  onSelectAgent,
  onCreateAgent,
}: AgentSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-b border-border scrollbar-hide">
      <button
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          activeAgentId === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        onClick={() => onSelectAgent(null)}
      >
        <Bot className="h-3 w-3" />
        General
      </button>
      {agents.map((agent) => {
        const Icon = getIcon(agent.icon);
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onSelectAgent(agent.id)}
            title={agent.description}
          >
            <Icon className="h-3 w-3" />
            {agent.name}
          </button>
        );
      })}
      <button
        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={onCreateAgent}
        title="Create custom agent"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
    </div>
  );
}
