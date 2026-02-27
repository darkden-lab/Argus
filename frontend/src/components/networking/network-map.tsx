"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import * as d3 from "d3";

// --- Existing resource/topology types ---

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

// --- Traffic mode types ---

interface TrafficNode {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
  requestRate: number;
  errorRate: number;
}

interface TrafficEdge {
  source: string;
  target: string;
  protocol: string;
  requestRate: number;
  errorRate: number;
}

interface TrafficResponse {
  mode: "traffic" | "resource";
  nodes?: TrafficNode[];
  edges?: TrafficEdge[];
  resourceNodes?: TopologyNode[];
  resourceEdges?: TopologyEdge[];
}

// --- Simulation types ---

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
  requestRate?: number;
  errorRate?: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  protocol: string;
  weight: number;
  requestRate?: number;
  errorRate?: number;
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

function getEdgeColor(errorRate: number): string {
  if (errorRate > 5) return "#ef4444";
  if (errorRate > 1) return "#f59e0b";
  return "#22c55e";
}

function getErrorLevel(errorRate: number): string {
  if (errorRate > 5) return "high";
  if (errorRate > 1) return "medium";
  return "low";
}

const REFRESH_OPTIONS = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "off", label: "Off" },
];

export function NetworkMap({ clusterID }: NetworkMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [trafficData, setTrafficData] = useState<TrafficResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [namespaceFilter, setNamespaceFilter] = useState("");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: SimNode;
  } | null>(null);
  const [istioEnabled, setIstioEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState("15");

  const fetchTraffic = useCallback(async () => {
    if (!clusterID) return;

    try {
      const params = namespaceFilter
        ? `?namespace=${encodeURIComponent(namespaceFilter)}`
        : "";
      const res = await api.get<TrafficResponse>(
        `/api/plugins/istio/${clusterID}/traffic${params}`
      );
      setTrafficData(res);
      setError(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "failed to fetch traffic data";
      if (
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.includes("not enabled")
      ) {
        setIstioEnabled(false);
      }
      setError(msg);
    }
  }, [clusterID, namespaceFilter]);

  // Initial fetch
  useEffect(() => {
    if (!clusterID) return;
    setLoading(true);
    fetchTraffic().finally(() => setLoading(false));
  }, [clusterID, namespaceFilter, fetchTraffic]);

  // Auto-refresh interval (traffic mode only)
  useEffect(() => {
    if (
      !trafficData ||
      trafficData.mode !== "traffic" ||
      refreshInterval === "off"
    ) {
      return;
    }

    const ms = parseInt(refreshInterval, 10) * 1000;
    const id = setInterval(fetchTraffic, ms);
    return () => clearInterval(id);
  }, [trafficData, refreshInterval, fetchTraffic]);

  const renderGraph = useCallback(() => {
    if (!trafficData || !svgRef.current || !containerRef.current) return;

    const isTrafficMode = trafficData.mode === "traffic";

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = containerRef.current.clientWidth;
    const height = 500;

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    // --- Defs: arrowheads ---
    const defs = svg.append("defs");

    if (isTrafficMode) {
      // Create per-error-level arrowheads
      for (const level of ["low", "medium", "high"] as const) {
        const color =
          level === "high"
            ? "#ef4444"
            : level === "medium"
              ? "#f59e0b"
              : "#22c55e";
        defs
          .append("marker")
          .attr("id", `arrowhead-${level}`)
          .attr("viewBox", "0 0 10 10")
          .attr("refX", 28)
          .attr("refY", 5)
          .attr("markerWidth", 8)
          .attr("markerHeight", 8)
          .attr("orient", "auto-start-reverse")
          .append("path")
          .attr("d", "M 0 0 L 10 5 L 0 10 z")
          .attr("fill", color);
      }
    } else {
      defs
        .append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 24)
        .attr("refY", 5)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M 0 0 L 10 5 L 0 10 z")
        .attr("fill", "#4b5563");
    }

    // CSS animation for traffic dashes
    if (isTrafficMode) {
      const styleEl = defs.append("style");
      styleEl.text(`
        @keyframes dash-flow {
          to { stroke-dashoffset: -12; }
        }
        .traffic-edge {
          stroke-dasharray: 8 4;
          animation: dash-flow 0.6s linear infinite;
        }
      `);
    }

    // Zoom/pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Build nodes and links depending on mode
    let nodes: SimNode[];
    let links: SimLink[];

    if (isTrafficMode && trafficData.nodes && trafficData.edges) {
      const nodeScale = d3
        .scaleSqrt()
        .domain([0, d3.max(trafficData.nodes, (n) => n.requestRate) ?? 100])
        .range([10, 24]);

      nodes = trafficData.nodes.map((n) => ({
        ...n,
        _radius: nodeScale(n.requestRate),
      })) as SimNode[];

      links = trafficData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        protocol: e.protocol,
        weight: e.requestRate,
        requestRate: e.requestRate,
        errorRate: e.errorRate,
      }));
    } else {
      const rNodes = trafficData.resourceNodes ?? [];
      const rEdges = trafficData.resourceEdges ?? [];
      nodes = rNodes.map((n) => ({ ...n }));
      links = rEdges.map((e) => ({
        source: e.source,
        target: e.target,
        protocol: e.protocol,
        weight: e.weight,
      }));
    }

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

    // --- Links ---
    if (isTrafficMode) {
      const thicknessScale = d3
        .scaleLog()
        .domain([0.01, 1000])
        .range([1, 8])
        .clamp(true);

      const link = g
        .append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", (d) => getEdgeColor(d.errorRate ?? 0))
        .attr("stroke-width", (d) =>
          thicknessScale(Math.max(0.01, d.requestRate ?? 0.01))
        )
        .attr("stroke-opacity", 0.8)
        .attr(
          "marker-end",
          (d) => `url(#arrowhead-${getErrorLevel(d.errorRate ?? 0)})`
        )
        .classed("traffic-edge", true);

      // Edge rate labels
      const linkLabel = g
        .append("g")
        .selectAll("text")
        .data(links)
        .join("text")
        .text((d) =>
          d.requestRate != null ? `${d.requestRate.toFixed(1)} req/s` : ""
        )
        .attr("font-size", 9)
        .attr("fill", "#9ca3af")
        .attr("text-anchor", "middle");

      // Nodes with variable size
      const node = g
        .append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr(
          "r",
          (d) =>
            (
              d as SimNode & { _radius?: number }
            )._radius ?? 14
        )
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
        .on("mouseout", () => setTooltip(null));

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
              (((d.source as SimNode).x ?? 0) +
                ((d.target as SimNode).x ?? 0)) /
              2
          )
          .attr(
            "y",
            (d) =>
              (((d.source as SimNode).y ?? 0) +
                ((d.target as SimNode).y ?? 0)) /
                2 -
              6
          );

        node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
        label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
      });
    } else {
      // --- Resource mode: same as original rendering ---
      const link = g
        .append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", "#4b5563")
        .attr("stroke-width", (d) => Math.max(1, Math.min(d.weight, 4)))
        .attr("stroke-opacity", 0.6)
        .attr("marker-end", "url(#arrowhead)");

      const linkLabel = g
        .append("g")
        .selectAll("text")
        .data(links)
        .join("text")
        .text((d) => d.protocol)
        .attr("font-size", 9)
        .attr("fill", "#9ca3af")
        .attr("text-anchor", "middle");

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
        .on("mouseout", () => setTooltip(null));

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
              (((d.source as SimNode).x ?? 0) +
                ((d.target as SimNode).x ?? 0)) /
              2
          )
          .attr(
            "y",
            (d) =>
              (((d.source as SimNode).y ?? 0) +
                ((d.target as SimNode).y ?? 0)) /
              2
          );

        node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
        label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
      });
    }

    return () => {
      simulation.stop();
    };
  }, [trafficData]);

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

  if (error && !trafficData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p>Failed to load topology: {error}</p>
      </div>
    );
  }

  const isTrafficMode = trafficData?.mode === "traffic";
  const nodeCount = isTrafficMode
    ? (trafficData?.nodes?.length ?? 0)
    : (trafficData?.resourceNodes?.length ?? 0);
  const edgeCount = isTrafficMode
    ? (trafficData?.edges?.length ?? 0)
    : (trafficData?.resourceEdges?.length ?? 0);

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Mode badge */}
        {isTrafficMode ? (
          <Badge
            variant="outline"
            className="gap-1.5 text-xs border-green-700 text-green-400"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live Traffic
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 text-xs text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
            Resource Map
          </Badge>
        )}

        {/* Namespace filter */}
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Namespace</Label>
          <Input
            placeholder="All namespaces"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            className="w-44 h-8 text-xs"
          />
        </div>

        {/* Refresh interval (traffic mode only) */}
        {isTrafficMode && (
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Refresh</Label>
            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger size="sm" className="w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Node type legend */}
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

      {/* Traffic mode edge legend */}
      {isTrafficMode && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-zinc-300">Edge legend:</span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-6 h-0.5"
              style={{ background: "#22c55e" }}
            />
            {"<"}1% errors
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-6 h-0.5"
              style={{ background: "#f59e0b" }}
            />
            1-5% errors
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-6 h-0.5"
              style={{ background: "#ef4444" }}
            />
            {">"}5% errors
          </span>
          <span className="text-zinc-500">|</span>
          <span>Thicker = higher request rate</span>
        </div>
      )}

      {/* SVG container */}
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
            {isTrafficMode &&
              tooltip.node.requestRate != null && (
                <>
                  <p className="text-zinc-400">
                    Rate: {tooltip.node.requestRate.toFixed(2)} req/s
                  </p>
                  <p className="text-zinc-400">
                    Error: {tooltip.node.errorRate?.toFixed(2) ?? "0.00"}%
                  </p>
                </>
              )}
          </div>
        )}
      </div>

      {trafficData && (
        <p className="text-xs text-muted-foreground">
          {nodeCount} nodes, {edgeCount} edges
        </p>
      )}
    </div>
  );
}
