"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Server,
  FolderOpen,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Copy,
  Clipboard,
  Maximize2,
  Minimize2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTerminal, type TerminalMode } from "@/hooks/use-terminal";
import { api } from "@/lib/api";

interface Cluster {
  id: string;
  name: string;
}

interface Namespace {
  name: string;
}

const COMMAND_HISTORY_KEY = "k8s-terminal-history";

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COMMAND_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function WebTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [selectedCluster, setSelectedCluster] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [mode, setMode] = useState<TerminalMode>("smart");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleOutput = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  const handleError = useCallback((error: string) => {
    xtermRef.current?.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
  }, []);

  const handleConnected = useCallback(() => {
    xtermRef.current?.write(
      "\x1b[32mConnected to terminal session.\x1b[0m\r\n"
    );
  }, []);

  const handleModeChanged = useCallback((newMode: TerminalMode) => {
    setMode(newMode);
    xtermRef.current?.write(
      `\r\n\x1b[33mSwitched to ${newMode} mode.\x1b[0m\r\n`
    );
  }, []);

  const {
    isConnected,
    sendInput,
    sendResize,
    sendModeChange,
    sendContextChange,
    connect,
  } = useTerminal({
    cluster: selectedCluster,
    namespace: selectedNamespace,
    mode,
    onOutput: handleOutput,
    onError: handleError,
    onConnected: handleConnected,
    onModeChanged: handleModeChanged,
  });

  // Fetch clusters on mount
  useEffect(() => {
    api
      .get<Cluster[]>("/api/clusters")
      .then((data) => {
        setClusters(data);
        if (data.length > 0 && !selectedCluster) {
          setSelectedCluster(data[0].id);
        }
      })
      .catch(() => {
        // Will show empty state
      });
  }, [selectedCluster]);

  // Fetch namespaces when cluster changes
  useEffect(() => {
    if (!selectedCluster) return;
    api
      .get<Namespace[]>(`/api/clusters/${selectedCluster}/namespaces`)
      .then(setNamespaces)
      .catch(() => setNamespaces([{ name: "default" }]));
  }, [selectedCluster]);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#27272a",
        black: "#09090b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);

    // Delay fit to ensure DOM is ready
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln("\x1b[1;36mArgus Terminal\x1b[0m");
    term.writeln(
      "\x1b[90mSelect a cluster and namespace to begin.\x1b[0m"
    );
    term.writeln("");

    // Handle input
    term.onData((data) => {
      sendInput(data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        sendResize(term.cols, term.rows);
      });
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClusterChange = (clusterId: string) => {
    setSelectedCluster(clusterId);
    setSelectedNamespace("default");
    sendContextChange(clusterId, "default");
    xtermRef.current?.clear();
  };

  const handleNamespaceChange = (ns: string) => {
    setSelectedNamespace(ns);
    sendContextChange(selectedCluster, ns);
  };

  const handleModeToggle = () => {
    const newMode = mode === "smart" ? "raw" : "smart";
    setMode(newMode);
    sendModeChange(newMode);
  };

  const handleCopy = () => {
    const selection = xtermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    if (text) {
      sendInput(text);
    }
  };

  const handleReconnect = () => {
    xtermRef.current?.clear();
    xtermRef.current?.writeln("\x1b[33mReconnecting...\x1b[0m");
    connect();
  };

  const handleShowHistory = () => {
    const history = loadHistory();
    if (history.length === 0) {
      xtermRef.current?.writeln("\r\n\x1b[90mNo command history.\x1b[0m");
      return;
    }
    xtermRef.current?.writeln("\r\n\x1b[1;36mRecent commands:\x1b[0m");
    history.slice(-10).forEach((cmd, i) => {
      xtermRef.current?.writeln(`\x1b[90m  ${i + 1}. ${cmd}\x1b[0m`);
    });
    xtermRef.current?.writeln("");
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-background",
        isFullscreen && "fixed inset-0 z-50 rounded-none"
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {/* Cluster selector */}
        <div className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedCluster} onValueChange={handleClusterChange}>
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Namespace selector */}
        <div className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={selectedNamespace}
            onValueChange={handleNamespaceChange}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
              {namespaces.map((ns) => (
                <SelectItem key={ns.name} value={ns.name}>
                  {ns.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mode toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleModeToggle}
              >
                {mode === "smart" ? (
                  <ToggleLeft className="h-3.5 w-3.5" />
                ) : (
                  <ToggleRight className="h-3.5 w-3.5" />
                )}
                {mode === "smart" ? "Smart" : "Raw Shell"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {mode === "smart"
                ? "Smart mode: kubectl-like commands parsed by backend"
                : "Raw shell: direct exec into a pod"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Connection status */}
        <Badge
          variant={isConnected ? "default" : "destructive"}
          className="h-5 text-[10px]"
        >
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>

        <div className="flex-1" />

        {/* Action buttons */}
        <TooltipProvider>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleShowHistory}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command history</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopy}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy selection</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handlePaste}
                >
                  <Clipboard className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleReconnect}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reconnect</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 p-1"
        style={{ minHeight: isFullscreen ? "calc(100vh - 48px)" : "500px" }}
      />
    </div>
  );
}
