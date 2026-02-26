"use client";

import { useEffect, useRef, useCallback } from "react";
import { X, Maximize2, Minimize2, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { WebTerminal } from "./web-terminal";

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

export function TerminalPanel() {
  const isOpen = useUIStore((s) => s.terminalPanelOpen);
  const setOpen = useUIStore((s) => s.setTerminalPanelOpen);
  const panelHeight = useUIStore((s) => s.terminalPanelHeight);
  const setPanelHeight = useUIStore((s) => s.setTerminalPanelHeight);

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const isExpandedRef = useRef(false);
  const prevHeightRef = useRef(panelHeight);

  // Keyboard shortcut: Ctrl+`
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setOpen(!isOpen);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = panelHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      function handleMouseMove(ev: MouseEvent) {
        if (!isDraggingRef.current) return;
        const delta = startYRef.current - ev.clientY;
        const newHeight = Math.min(
          Math.max(startHeightRef.current + delta, MIN_HEIGHT),
          MAX_HEIGHT
        );
        setPanelHeight(newHeight);
      }

      function handleMouseUp() {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight, setPanelHeight]
  );

  const handleToggleExpand = useCallback(() => {
    if (isExpandedRef.current) {
      setPanelHeight(prevHeightRef.current);
      isExpandedRef.current = false;
    } else {
      prevHeightRef.current = panelHeight;
      setPanelHeight(MAX_HEIGHT);
      isExpandedRef.current = true;
    }
  }, [panelHeight, setPanelHeight]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 flex flex-col border-t border-border bg-background shadow-2xl",
        "transition-[height] duration-100 ease-out"
      )}
      style={{ height: `${panelHeight}px` }}
    >
      {/* Drag handle */}
      <div
        className="flex h-8 cursor-row-resize items-center justify-center border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Header bar */}
      <div className="flex h-8 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Terminal</span>
          <span className="text-[10px] text-muted-foreground/60">Ctrl+` to toggle</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleToggleExpand}
          >
            {isExpandedRef.current ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setOpen(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <WebTerminal />
      </div>
    </div>
  );
}
