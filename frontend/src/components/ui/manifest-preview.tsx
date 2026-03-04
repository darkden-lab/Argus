"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface ManifestPreviewProps {
  manifest: Record<string, unknown>;
  className?: string;
  maxHeight?: string;
}

function jsonToYaml(obj: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") {
    if (obj.includes("\n")) {
      return `|\n${obj
        .split("\n")
        .map((l) => pad + "  " + l)
        .join("\n")}`;
    }
    // Quote strings that could be misinterpreted
    if (/^[\d.]+$/.test(obj) || obj === "true" || obj === "false" || obj === "" || obj.includes(": ") || obj.includes("#")) {
      return `"${obj}"`;
    }
    return obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          const lines = jsonToYaml(item, indent + 1).split("\n");
          return `${pad}- ${lines[0].trim()}\n${lines.slice(1).join("\n")}`;
        }
        return `${pad}- ${jsonToYaml(item, indent + 1)}`;
      })
      .join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, val]) => {
        if (typeof val === "object" && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
          return `${pad}${key}:\n${jsonToYaml(val, indent + 1)}`;
        }
        if (Array.isArray(val) && val.length > 0) {
          return `${pad}${key}:\n${jsonToYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${jsonToYaml(val, indent + 1)}`;
      })
      .join("\n");
  }
  return String(obj);
}

function ManifestPreview({
  manifest,
  className,
  maxHeight = "300px",
}: ManifestPreviewProps) {
  const [format, setFormat] = React.useState<"yaml" | "json">("yaml");
  const [copied, setCopied] = React.useState(false);

  const content = React.useMemo(() => {
    if (format === "json") return JSON.stringify(manifest, null, 2);
    return jsonToYaml(manifest, 0);
  }, [manifest, format]);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("rounded-lg border bg-muted/30", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={format === "yaml" ? "secondary" : "ghost"}
            className="h-6 text-xs px-2"
            onClick={() => setFormat("yaml")}
          >
            YAML
          </Button>
          <Button
            size="sm"
            variant={format === "json" ? "secondary" : "ghost"}
            className="h-6 text-xs px-2"
            onClick={() => setFormat("json")}
          >
            JSON
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2 gap-1"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className="p-3 text-xs font-mono overflow-auto whitespace-pre"
        style={{ maxHeight }}
      >
        {content}
      </pre>
    </div>
  );
}

export { ManifestPreview };
export type { ManifestPreviewProps };
