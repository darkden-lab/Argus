"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check, Play } from "lucide-react";
import { highlight } from "sugar-high";
import { Button } from "@/components/ui/button";

interface ChatCodeBlockProps {
  code: string;
  language: string;
  onApply?: (code: string) => void;
}

export function ChatCodeBlock({ code, language, onApply }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API not available or permission denied
    });
  };

  const isYaml = language === "yaml" || language === "yml";
  // sugar-high generates safe HTML (only <span> elements with CSS class
  // names for syntax tokens). It does not process user input — only source
  // code provided by the LLM, so XSS is not a concern here.
  const highlightedHtml = highlight(code);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-zinc-950 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase text-zinc-400">
          {language}
        </span>
        <div className="flex items-center gap-1">
          {isYaml && onApply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
              onClick={() => onApply(code)}
              title="Apply YAML"
              aria-label="Apply YAML"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          {copied && (
            <span className="text-[10px] text-green-500">Copied!</span>
          )}
        </div>
      </div>

      {/* Code — sugar-high output is safe (spans with CSS classes only) */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
}
