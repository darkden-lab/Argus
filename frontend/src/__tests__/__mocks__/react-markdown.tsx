import React from "react";

interface ReactMarkdownProps {
  children: string;
  remarkPlugins?: unknown[];
  components?: Record<string, React.ComponentType<Record<string, unknown>>>;
}

export type { Components } from "react-markdown";

function ReactMarkdown({ children, components }: ReactMarkdownProps) {
  // Simple mock: parse basic markdown patterns
  const lines = children.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    const codeMatch = line.match(/^```(\w*)$/);
    if (codeMatch) {
      const lang = codeMatch[1] || "plaintext";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join("\n");
      if (components?.code) {
        const Code = components.code;
        elements.push(
          <Code key={i} className={`language-${lang}`}>
            {code}
          </Code>
        );
      } else {
        elements.push(<pre key={i}><code className={`language-${lang}`}>{code}</code></pre>);
      }
      continue;
    }

    // Inline formatting
    let processed: React.ReactNode = line;

    // Bold
    if (line.includes("**")) {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      processed = (
        <>
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <React.Fragment key={j}>{part}</React.Fragment>
            )
          )}
        </>
      );
    }

    // Inline code
    if (typeof processed === "string" && processed.includes("`")) {
      const parts = processed.split(/(`.*?`)/g);
      processed = (
        <>
          {parts.map((part, j) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code key={j}>{part.slice(1, -1)}</code>
            ) : (
              <React.Fragment key={j}>{part}</React.Fragment>
            )
          )}
        </>
      );
    }

    if (components?.p) {
      const P = components.p;
      elements.push(<P key={i}>{processed}</P>);
    } else {
      elements.push(<p key={i}>{processed}</p>);
    }
    i++;
  }

  return <div>{elements}</div>;
}

export default ReactMarkdown;
