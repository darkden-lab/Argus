"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Wrench, ChevronDown } from "lucide-react";
import { ChatCodeBlock } from "./chat-code-block";
import type { ChatMessage as ChatMessageType } from "@/stores/ai-chat";
import type { Components } from "react-markdown";

interface ChatMessageProps {
  message: ChatMessageType;
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    if (match) {
      return <ChatCodeBlock code={code} language={match[1]} />;
    }
    return (
      <code
        className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="ml-4 list-disc space-y-1 mb-3 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="ml-4 list-decimal space-y-1 mb-3 last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li>{children}</li>;
  },
  h1({ children }) {
    return <h1 className="text-lg font-semibold mb-2">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-base font-semibold mb-2">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mb-1">{children}</h3>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-primary/30 pl-3 italic mb-3 last:mb-0">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto mb-3 last:mb-0">
        <table className="w-full text-xs border-collapse border border-border">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-border px-2 py-1">{children}</td>;
  },
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isTool) {
    return (
      <div className="px-4 py-1.5">
        <details className="group rounded-md border border-orange-500/20 bg-orange-500/5">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
            <Wrench className="h-3 w-3 text-orange-500 shrink-0" />
            <span className="font-medium text-orange-500">
              {message.toolCall?.name || "Tool"}
            </span>
            <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          {message.toolCall?.result && (
            <pre className="overflow-x-auto border-t border-orange-500/20 px-3 py-2 text-xs text-muted-foreground">
              {message.toolCall.result}
            </pre>
          )}
        </details>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm">
            {message.content}
          </div>
          <span className="mt-0.5 block text-right text-[10px] text-muted-foreground/50">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="px-4 py-1.5">
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground mt-0.5">
          <Bot className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm prose-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-primary animate-cursor-blink rounded-sm ml-0.5 align-text-bottom" />
            )}
          </div>
          <span className="mt-0.5 block text-[10px] text-muted-foreground/50">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}
