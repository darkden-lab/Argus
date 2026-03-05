import { Badge } from "@/components/ui/badge";

interface ScopeBadgeProps {
  scopeType: "global" | "cluster" | "namespace" | string;
  scopeId?: string;
}

const variants: Record<string, "default" | "secondary" | "outline"> = {
  global: "default",
  cluster: "secondary",
  namespace: "outline",
};

export function ScopeBadge({ scopeType, scopeId }: ScopeBadgeProps) {
  const label = scopeId ? `${scopeType}: ${scopeId}` : scopeType;
  return <Badge variant={variants[scopeType] ?? "outline"}>{label}</Badge>;
}
