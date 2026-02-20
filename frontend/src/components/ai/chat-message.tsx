"use client";

import React from "react";
import { User, Bot, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatCodeBlock } from "./chat-code-block";
import type { ChatMessage as ChatMessageType } from "@/stores/ai-chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

type ContentPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: content.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: "code",
      value: match[2],
      language: match[1] || "plaintext",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

function renderInlineText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by bold markers and inline code
  const segments = text.split(/(\*\*.*?\*\*|`.*?`|\n)/g);

  segments.forEach((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      nodes.push(
        <strong key={i}>{seg.slice(2, -2)}</strong>
      );
    } else if (seg.startsWith("`") && seg.endsWith("`")) {
      nodes.push(
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
        >
          {seg.slice(1, -1)}
        </code>
      );
    } else if (seg === "\n") {
      nodes.push(<br key={i} />);
    } else {
      nodes.push(<React.Fragment key={i}>{seg}</React.Fragment>);
    }
  });

  return nodes;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const parts = parseContent(message.content);

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : isTool
              ? "bg-orange-500/10 text-orange-500"
              : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : isTool ? (
          <Wrench className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1",
          isUser && "items-end"
        )}
      >
        {/* Tool call info */}
        {isTool && message.toolCall && (
          <div className="mb-1 rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-1.5 text-xs">
            <span className="font-medium text-orange-500">
              {message.toolCall.name}
            </span>
            {message.toolCall.result && (
              <pre className="mt-1 overflow-x-auto text-muted-foreground">
                {message.toolCall.result}
              </pre>
            )}
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {parts.map((part, i) =>
            part.type === "code" ? (
              <ChatCodeBlock
                key={i}
                code={part.value}
                language={part.language}
              />
            ) : (
              <span key={i}>{renderInlineText(part.value)}</span>
            )
          )}
          {message.isStreaming && (
            <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
