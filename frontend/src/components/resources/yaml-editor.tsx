"use client";

import { useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export function YamlEditor({ value, onChange, readOnly = false }: YamlEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="relative rounded-md border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">YAML</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        className="min-h-[400px] resize-y rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed focus-visible:ring-0"
        spellCheck={false}
      />
    </div>
  );
}
