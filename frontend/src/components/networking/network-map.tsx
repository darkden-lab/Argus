"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import * as d3 from "d3";

interface TopologyNode {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
}

interface TopologyEdge {
  source: string;
  target: string;
  protocol: string;
  weight: number;
}

interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  protocol: string;
  weight: number;
}

interface NetworkMapProps {
  clusterID: string;
}

const NODE_COLORS: Record<string, string> = {
  service: "#3b82f6",
  "virtual-service": "#22c55e",
  virtualservice: "#22c55e",
  external: "#6b7280",
  gateway: "#a855f7",
  deployment: "#f59e0b",
};

function getNodeColor(type: string): string {
  return NODE_COLORS[type.toLowerCase()] ?? "#6b7280";
}

export function NetworkMap({ clusterID }: NetworkMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [namespaceFilter, setNamespaceFilter] = useState("");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: SimNode;
  } | null>(null);
  const [istioEnabled, setIstioEnabled] = useState(true);

  useEffect(() => {
    if (!clusterID) return;

    async function fetchTopology() {
      setLoading(true);
      setError(null);
      try {
        const params = namespaceFilter
          ? `?namespace=${encodeURIComponent(namespaceFilter)}`
          : "";
        const res = await api.get<TopologyData>(
          `/api/plugins/istio/${clusterID}/topology${params}`
        );
        setData(res);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch topology";
        if (msg.includes("404") || msg.includes("not found") || msg.includes("not enabled")) {
          setIstioEnabled(false);
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    fetchTopology();
  }, [clusterID, namespaceFilter]);

  const renderGraph = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = containerRef.current.clientWidth;
    const height = 500;

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    // Zoom/pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      protocol: e.protocol,
      weight: e.weight,
    }));

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", (d) => Math.max(1, Math.min(d.weight, 4)))
      .attr("stroke-opacity", 0.6);

    // Link labels
    const linkLabel = g
      .append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .text((d) => d.protocol)
      .attr("font-size", 9)
      .attr("fill", "#9ca3af")
      .attr("text-anchor", "middle");

    // Nodes
    const node = g
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 14)
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("stroke", "#1f2937")
      .attr("stroke-width", 2)
      .attr("cursor", "pointer")
      .on("mouseover", function (_event, d) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            x: (d.x ?? 0) + rect.left,
            y: (d.y ?? 0) + rect.top - 30,
            node: d,
          });
        }
      })
      .on("mouseout", () => setTooltip(null))
    // D3 drag behavior
    const dragBehavior = d3
      .drag<SVGCircleElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.call(dragBehavior as any);

    // Node labels
    const label = g
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", 10)
      .attr("fill", "#e5e7eb")
      .attr("text-anchor", "middle")
      .attr("dy", 28);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      linkLabel
        .attr(
          "x",
          (d) =>
            (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) /
            2
        )
        .attr(
          "y",
          (d) =>
            (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) /
            2
        );

      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);

      label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  if (!istioEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <AlertTriangle className="h-10 w-10 opacity-40" />
        <p className="text-lg font-medium">Istio plugin required</p>
        <p className="text-sm">
          Enable the Istio plugin to view the network topology map.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p>Failed to load topology: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Namespace</Label>
          <Input
            placeholder="All namespaces"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            className="w-44 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: "#3b82f6" }}
          />
          <span className="text-xs text-muted-foreground">Service</span>
          <span
            className="inline-block h-3 w-3 rounded-full ml-2"
            style={{ background: "#22c55e" }}
          />
          <span className="text-xs text-muted-foreground">VirtualService</span>
          <span
            className="inline-block h-3 w-3 rounded-full ml-2"
            style={{ background: "#6b7280" }}
          />
          <span className="text-xs text-muted-foreground">External</span>
          <span
            className="inline-block h-3 w-3 rounded-full ml-2"
            style={{ background: "#a855f7" }}
          />
          <span className="text-xs text-muted-foreground">Gateway</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-md bg-zinc-950 border overflow-hidden"
      >
        <svg ref={svgRef} className="w-full" style={{ minHeight: 500 }} />
        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs shadow-lg"
            style={{
              left: tooltip.node.x ?? 0,
              top: (tooltip.node.y ?? 0) - 50,
            }}
          >
            <p className="font-medium text-zinc-100">{tooltip.node.name}</p>
            <p className="text-zinc-400">
              {tooltip.node.namespace} --{" "}
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {tooltip.node.type}
              </Badge>
            </p>
            <p className="text-zinc-400">Status: {tooltip.node.status}</p>
          </div>
        )}
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.nodes.length} nodes, {data.edges.length} edges
        </p>
      )}
    </div>
  );
}
