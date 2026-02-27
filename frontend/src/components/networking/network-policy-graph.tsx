"use client";

import type { NetworkPolicyFull } from "./network-policy-detail";

interface GraphNode {
  label: string;
  type: "ingress" | "target" | "egress";
}

interface GraphEdge {
  from: number;
  to: number;
  color: string;
  ports: string;
}

function selectorLabel(
  selector?: { matchLabels?: Record<string, string> }
): string {
  if (!selector?.matchLabels || Object.keys(selector.matchLabels).length === 0)
    return "all pods";
  return Object.entries(selector.matchLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function portsLabel(
  ports?: Array<{ port?: number | string; protocol?: string; endPort?: number }>
): string {
  if (!ports || ports.length === 0) return "all ports";
  return ports
    .map(
      (p) =>
        `${p.port ?? "*"}${p.endPort ? "-" + p.endPort : ""}/${p.protocol ?? "TCP"}`
    )
    .join(", ");
}

export function NetworkPolicyRuleGraph({
  policy,
}: {
  policy: NetworkPolicyFull;
}) {
  const spec = policy.spec;
  if (!spec) {
    return (
      <p className="text-xs text-muted-foreground">No spec available.</p>
    );
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Target pods node (center)
  const targetIdx = 0;
  nodes.push({
    label: selectorLabel(spec.podSelector),
    type: "target",
  });

  // Ingress sources (left side)
  if (spec.ingress) {
    for (const rule of spec.ingress) {
      const portStr = portsLabel(rule.ports);
      if (rule.from && rule.from.length > 0) {
        for (const peer of rule.from) {
          let label = "";
          if (peer.ipBlock) {
            label = `CIDR: ${peer.ipBlock.cidr}`;
          } else if (peer.namespaceSelector && peer.podSelector) {
            label = `ns: ${selectorLabel(peer.namespaceSelector)} / pod: ${selectorLabel(peer.podSelector)}`;
          } else if (peer.namespaceSelector) {
            label = `ns: ${selectorLabel(peer.namespaceSelector)}`;
          } else if (peer.podSelector) {
            label = `pod: ${selectorLabel(peer.podSelector)}`;
          } else {
            label = "all sources";
          }
          const idx = nodes.length;
          nodes.push({ label, type: "ingress" });
          edges.push({ from: idx, to: targetIdx, color: "#22c55e", ports: portStr });
        }
      } else {
        // No "from" means all sources
        const idx = nodes.length;
        nodes.push({ label: "all sources", type: "ingress" });
        edges.push({ from: idx, to: targetIdx, color: "#22c55e", ports: portStr });
      }
    }
  }

  // Egress destinations (right side)
  if (spec.egress) {
    for (const rule of spec.egress) {
      const portStr = portsLabel(rule.ports);
      if (rule.to && rule.to.length > 0) {
        for (const peer of rule.to) {
          let label = "";
          if (peer.ipBlock) {
            label = `CIDR: ${peer.ipBlock.cidr}`;
          } else if (peer.namespaceSelector && peer.podSelector) {
            label = `ns: ${selectorLabel(peer.namespaceSelector)} / pod: ${selectorLabel(peer.podSelector)}`;
          } else if (peer.namespaceSelector) {
            label = `ns: ${selectorLabel(peer.namespaceSelector)}`;
          } else if (peer.podSelector) {
            label = `pod: ${selectorLabel(peer.podSelector)}`;
          } else {
            label = "all destinations";
          }
          const idx = nodes.length;
          nodes.push({ label, type: "egress" });
          edges.push({ from: targetIdx, to: idx, color: "#3b82f6", ports: portStr });
        }
      } else {
        // No "to" means all destinations
        const idx = nodes.length;
        nodes.push({ label: "all destinations", type: "egress" });
        edges.push({ from: targetIdx, to: idx, color: "#3b82f6", ports: portStr });
      }
    }
  }

  const ingressNodes = nodes
    .map((n, i) => ({ ...n, idx: i }))
    .filter((n) => n.type === "ingress");
  const egressNodes = nodes
    .map((n, i) => ({ ...n, idx: i }))
    .filter((n) => n.type === "egress");

  const maxSide = Math.max(ingressNodes.length, egressNodes.length, 1);
  const svgHeight = Math.max(maxSide * 56 + 40, 120);
  const svgWidth = 500;

  const leftX = 80;
  const centerX = svgWidth / 2;
  const rightX = svgWidth - 80;

  function nodeY(index: number, total: number): number {
    if (total <= 1) return svgHeight / 2;
    const spacing = (svgHeight - 60) / (total - 1);
    return 30 + index * spacing;
  }

  const centerY = svgHeight / 2;

  return (
    <div className="rounded-md border bg-zinc-950/50 p-2 overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="w-full" style={{ minWidth: 400 }}>
        <defs>
          <marker
            id="graph-arrow-green"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker
            id="graph-arrow-blue"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = nodes[edge.from];

          let x1: number, y1: number, x2: number, y2: number;
          if (fromNode.type === "ingress") {
            const inIdx = ingressNodes.findIndex((n) => n.idx === edge.from);
            x1 = leftX + 40;
            y1 = nodeY(inIdx, ingressNodes.length);
            x2 = centerX - 50;
            y2 = centerY;
          } else {
            const egIdx = egressNodes.findIndex((n) => n.idx === edge.to);
            x1 = centerX + 50;
            y1 = centerY;
            x2 = rightX - 40;
            y2 = nodeY(egIdx, egressNodes.length);
          }

          const markerId =
            edge.color === "#22c55e" ? "graph-arrow-green" : "graph-arrow-blue";

          // Midpoint for port label
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;

          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={edge.color}
                strokeWidth={1.5}
                strokeOpacity={0.7}
                markerEnd={`url(#${markerId})`}
              />
              {/* Port label on edge */}
              <text
                x={mx}
                y={my - 6}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize={8}
              >
                {edge.ports}
              </text>
            </g>
          );
        })}

        {/* Ingress nodes (left) */}
        {ingressNodes.map((node, i) => {
          const y = nodeY(i, ingressNodes.length);
          return (
            <g key={`in-${node.idx}`}>
              <rect
                x={leftX - 40}
                y={y - 14}
                width={80}
                height={28}
                rx={6}
                fill="#22c55e"
                fillOpacity={0.15}
                stroke="#22c55e"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <text
                x={leftX}
                y={y + 4}
                textAnchor="middle"
                fill="#d1d5db"
                fontSize={8}
              >
                {node.label.length > 16 ? node.label.slice(0, 14) + ".." : node.label}
              </text>
            </g>
          );
        })}

        {/* Target node (center) */}
        <rect
          x={centerX - 50}
          y={centerY - 20}
          width={100}
          height={40}
          rx={8}
          fill="#a855f7"
          fillOpacity={0.2}
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
        <text
          x={centerX}
          y={centerY - 4}
          textAnchor="middle"
          fill="#e5e7eb"
          fontSize={9}
          fontWeight="bold"
        >
          Target Pods
        </text>
        <text
          x={centerX}
          y={centerY + 10}
          textAnchor="middle"
          fill="#9ca3af"
          fontSize={7}
        >
          {nodes[0].label.length > 22 ? nodes[0].label.slice(0, 20) + ".." : nodes[0].label}
        </text>

        {/* Egress nodes (right) */}
        {egressNodes.map((node, i) => {
          const y = nodeY(i, egressNodes.length);
          return (
            <g key={`eg-${node.idx}`}>
              <rect
                x={rightX - 40}
                y={y - 14}
                width={80}
                height={28}
                rx={6}
                fill="#3b82f6"
                fillOpacity={0.15}
                stroke="#3b82f6"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <text
                x={rightX}
                y={y + 4}
                textAnchor="middle"
                fill="#d1d5db"
                fontSize={8}
              >
                {node.label.length > 16 ? node.label.slice(0, 14) + ".." : node.label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(10, ${svgHeight - 16})`}>
          <rect width={8} height={8} fill="#22c55e" fillOpacity={0.5} rx={2} />
          <text x={12} y={7} fill="#9ca3af" fontSize={8}>Ingress (allow)</text>
          <rect x={90} width={8} height={8} fill="#3b82f6" fillOpacity={0.5} rx={2} />
          <text x={102} y={7} fill="#9ca3af" fontSize={8}>Egress (allow)</text>
        </g>

        {/* Empty state message */}
        {ingressNodes.length === 0 && egressNodes.length === 0 && (
          <text
            x={centerX}
            y={centerY + 40}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={10}
          >
            No ingress or egress rules defined
          </text>
        )}
      </svg>
    </div>
  );
}
