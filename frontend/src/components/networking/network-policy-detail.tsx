"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Shield, ArrowLeft, ArrowRight, Circle } from "lucide-react";
import { NetworkPolicyRuleGraph } from "./network-policy-graph";

interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: Array<{
    key: string;
    operator: string;
    values?: string[];
  }>;
}

interface NetworkPolicyPort {
  protocol?: string;
  port?: number | string;
  endPort?: number;
}

interface NetworkPolicyPeer {
  podSelector?: LabelSelector;
  namespaceSelector?: LabelSelector;
  ipBlock?: {
    cidr: string;
    except?: string[];
  };
}

interface IngressRule {
  ports?: NetworkPolicyPort[];
  from?: NetworkPolicyPeer[];
}

interface EgressRule {
  ports?: NetworkPolicyPort[];
  to?: NetworkPolicyPeer[];
}

export interface NetworkPolicyFull {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    podSelector?: LabelSelector;
    policyTypes?: string[];
    ingress?: IngressRule[];
    egress?: EgressRule[];
  };
}

interface NetworkPolicyDetailProps {
  policy: NetworkPolicyFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function renderSelector(selector: LabelSelector | undefined): string {
  if (!selector) return "(all pods)";
  const parts: string[] = [];
  if (selector.matchLabels) {
    for (const [k, v] of Object.entries(selector.matchLabels)) {
      parts.push(`${k}=${v}`);
    }
  }
  if (selector.matchExpressions) {
    for (const expr of selector.matchExpressions) {
      parts.push(`${expr.key} ${expr.operator} ${expr.values?.join(",") ?? ""}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "(all pods)";
}

function renderPeer(peer: NetworkPolicyPeer, idx: number) {
  return (
    <div key={idx} className="space-y-1 rounded-md border p-2 text-xs">
      {peer.podSelector && (
        <div>
          <span className="text-muted-foreground">Pod Selector: </span>
          <span className="font-mono">{renderSelector(peer.podSelector)}</span>
        </div>
      )}
      {peer.namespaceSelector && (
        <div>
          <span className="text-muted-foreground">Namespace Selector: </span>
          <span className="font-mono">{renderSelector(peer.namespaceSelector)}</span>
        </div>
      )}
      {peer.ipBlock && (
        <div>
          <span className="text-muted-foreground">CIDR: </span>
          <span className="font-mono">{peer.ipBlock.cidr}</span>
          {peer.ipBlock.except && peer.ipBlock.except.length > 0 && (
            <span className="text-muted-foreground"> except {peer.ipBlock.except.join(", ")}</span>
          )}
        </div>
      )}
      {!peer.podSelector && !peer.namespaceSelector && !peer.ipBlock && (
        <span className="text-muted-foreground">(all sources)</span>
      )}
    </div>
  );
}

function renderPorts(ports: NetworkPolicyPort[] | undefined) {
  if (!ports || ports.length === 0) return <span className="text-muted-foreground text-xs">All ports</span>;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {ports.map((p, i) => (
        <Badge key={i} variant="outline" className="text-[10px] font-mono">
          {p.port ?? "*"}{p.endPort ? `-${p.endPort}` : ""}/{p.protocol ?? "TCP"}
        </Badge>
      ))}
    </div>
  );
}

export function NetworkPolicyDetail({ policy, open, onOpenChange }: NetworkPolicyDetailProps) {
  if (!policy) return null;

  const spec = policy.spec;
  const policyTypes = spec?.policyTypes ?? [];
  const hasIngress = policyTypes.includes("Ingress") || (!policyTypes.length && spec?.ingress);
  const hasEgress = policyTypes.includes("Egress") || (!policyTypes.length && spec?.egress);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <SheetTitle className="text-lg">{policy.metadata.name}</SheetTitle>
          </div>
          <SheetDescription>
            Namespace: {policy.metadata.namespace ?? "default"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4 pt-0">
          {/* Labels */}
          {policy.metadata.labels && Object.keys(policy.metadata.labels).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Labels</h4>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(policy.metadata.labels).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="text-[10px] font-mono">
                    {k}={v}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Pod Selector */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">
              <Circle className="h-3 w-3 inline mr-1" />
              Pod Selector (applies to)
            </h4>
            <p className="text-xs font-mono bg-muted/50 rounded-md px-2 py-1.5">
              {renderSelector(spec?.podSelector)}
            </p>
          </div>

          {/* Policy Types */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Policy Types</h4>
            <div className="flex gap-1.5">
              {policyTypes.length > 0 ? (
                policyTypes.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Not specified</span>
              )}
            </div>
          </div>

          <Separator />

          {/* Visual Graph */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Traffic Flow Visualization</h4>
            <NetworkPolicyRuleGraph policy={policy} />
          </div>

          <Separator />

          {/* Ingress Rules */}
          {hasIngress && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <ArrowLeft className="h-3.5 w-3.5 text-emerald-500" />
                Ingress Rules
              </h4>
              {spec?.ingress && spec.ingress.length > 0 ? (
                <div className="space-y-3">
                  {spec.ingress.map((rule, i) => (
                    <div key={i} className="space-y-2 rounded-lg border p-3">
                      <div className="text-xs font-medium text-muted-foreground">Rule {i + 1}</div>
                      <div>
                        <span className="text-xs font-medium">Ports:</span>
                        <div className="mt-1">{renderPorts(rule.ports)}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium">From:</span>
                        <div className="mt-1 space-y-1.5">
                          {rule.from && rule.from.length > 0 ? (
                            rule.from.map((peer, j) => renderPeer(peer, j))
                          ) : (
                            <span className="text-xs text-muted-foreground">(all sources allowed)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No ingress rules defined (all ingress traffic denied by default).
                </p>
              )}
            </div>
          )}

          {/* Egress Rules */}
          {hasEgress && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                Egress Rules
              </h4>
              {spec?.egress && spec.egress.length > 0 ? (
                <div className="space-y-3">
                  {spec.egress.map((rule, i) => (
                    <div key={i} className="space-y-2 rounded-lg border p-3">
                      <div className="text-xs font-medium text-muted-foreground">Rule {i + 1}</div>
                      <div>
                        <span className="text-xs font-medium">Ports:</span>
                        <div className="mt-1">{renderPorts(rule.ports)}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium">To:</span>
                        <div className="mt-1 space-y-1.5">
                          {rule.to && rule.to.length > 0 ? (
                            rule.to.map((peer, j) => renderPeer(peer, j))
                          ) : (
                            <span className="text-xs text-muted-foreground">(all destinations allowed)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No egress rules defined (all egress traffic denied by default).
                </p>
              )}
            </div>
          )}

          {/* Creation timestamp */}
          {policy.metadata.creationTimestamp && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                Created: {new Date(policy.metadata.creationTimestamp).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
