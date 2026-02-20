"use client";

import { useState } from "react";
import { Copy, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatCodeBlockProps {
  code: string;
  language: string;
  onApply?: (code: string) => void;
}

export function ChatCodeBlock({ code, language, onApply }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isYaml = language === "yaml" || language === "yml";

  return (
    <div className="my-2 rounded-md border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {language}
        </span>
        <div className="flex items-center gap-1">
          {isYaml && onApply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onApply(code)}
              title="Apply YAML"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-3 text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}
