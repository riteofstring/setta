import { memo, useMemo } from "react";
import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { highlightCode } from "../lib/syntax-highlight";
import { cn } from "../lib/utils";

const markdownPlugins = [remarkGfm];

const markdownRootClass =
  "min-w-0 max-w-full space-y-2 overflow-hidden text-[13px] leading-5 break-words text-inherit [overflow-wrap:anywhere]";

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  return (
    <div className={markdownRootClass}>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={markdownPlugins}
        skipHtml={false}
        urlTransform={(url) => url}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

const markdownComponents = {
  p({ children }) {
    return <p className="max-w-full break-words [overflow-wrap:anywhere]">{children}</p>;
  },
  ul({ children }) {
    return (
      <ul className="max-w-full list-disc space-y-1 pl-5 break-words [overflow-wrap:anywhere]">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="max-w-full list-decimal space-y-1 pl-5 break-words [overflow-wrap:anywhere]">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="min-w-0 pl-1 break-words [overflow-wrap:anywhere]">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="max-w-full border-l border-border/80 pl-3 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  pre({ node, children }) {
    const codeBlock = codeBlockFromPreNode(node);
    if (codeBlock) {
      return <CodeBlock language={codeBlock.language} text={codeBlock.text} />;
    }
    return <pre className={codeBlockPreClass}>{children}</pre>;
  },
  code({ children }) {
    return (
      <code className="rounded bg-secondary px-1 py-0.5 text-[0.85em] break-words text-accent-teal [overflow-wrap:anywhere]">
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="max-w-full min-w-0 overflow-hidden rounded-sm border border-border">
        <table className="w-full table-auto border-collapse text-xs">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted/70 text-muted-foreground">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody>{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="border-t border-border first:border-t-0">{children}</tr>;
  },
  th({ children }) {
    return (
      <th className="min-w-0 border-r border-border px-2 py-1 text-left font-semibold break-words last:border-r-0 [overflow-wrap:anywhere]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="min-w-0 border-r border-border px-2 py-1 align-top break-words last:border-r-0 [overflow-wrap:anywhere]">
        {children}
      </td>
    );
  },
  a({ children, href, title }) {
    return (
      <MarkdownLink href={href} title={title}>
        {children}
      </MarkdownLink>
    );
  },
  h1({ children }) {
    return <MarkdownHeading level={1}>{children}</MarkdownHeading>;
  },
  h2({ children }) {
    return <MarkdownHeading level={2}>{children}</MarkdownHeading>;
  },
  h3({ children }) {
    return <MarkdownHeading level={3}>{children}</MarkdownHeading>;
  },
  h4({ children }) {
    return <MarkdownHeading level={4}>{children}</MarkdownHeading>;
  },
  h5({ children }) {
    return <MarkdownHeading level={5}>{children}</MarkdownHeading>;
  },
  h6({ children }) {
    return <MarkdownHeading level={6}>{children}</MarkdownHeading>;
  },
  img({ alt }) {
    return alt ? <span className="text-muted-foreground">{alt}</span> : null;
  },
  br() {
    return <br />;
  },
} satisfies Components;

function MarkdownHeading({
  children,
  level,
}: {
  children: ReactNode;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const className = cn(
    "max-w-full break-words font-semibold text-foreground [overflow-wrap:anywhere]",
    level <= 2 ? "text-sm leading-6" : "text-[13px] leading-5",
  );
  if (level === 1) {
    return <h1 className={className}>{children}</h1>;
  }
  if (level === 2) {
    return <h2 className={className}>{children}</h2>;
  }
  if (level === 3) {
    return <h3 className={className}>{children}</h3>;
  }
  if (level === 4) {
    return <h4 className={className}>{children}</h4>;
  }
  if (level === 5) {
    return <h5 className={className}>{children}</h5>;
  }
  return <h6 className={className}>{children}</h6>;
}

function MarkdownLink({
  children,
  href,
  title,
}: Pick<ComponentPropsWithoutRef<"a">, "children" | "href" | "title">) {
  const safeHref = safeExternalHttpUrl(href);
  if (!safeHref) {
    return (
      <span className="break-words text-muted-foreground underline decoration-dotted underline-offset-2 [overflow-wrap:anywhere]">
        {children}
      </span>
    );
  }
  return (
    <a
      className="break-words text-accent-cyan underline underline-offset-2 hover:text-primary [overflow-wrap:anywhere]"
      href={safeHref}
      onAuxClick={preventMarkdownLinkNavigation}
      onClick={(event) => openMarkdownExternalLink(event, safeHref)}
      rel="noreferrer"
      title={title}
    >
      {children}
    </a>
  );
}

function openMarkdownExternalLink(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault();
  event.stopPropagation();
  void window.setta.app.openExternalUrl(href).catch((error: unknown) => {
    console.error("Markdown link blocked:", error);
  });
}

function preventMarkdownLinkNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function safeExternalHttpUrl(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

// CodeBlock renders a fenced code block, syntax-highlighted when the fence named a
// known language. Highlighting is memoized per (text, language) so streaming
// re-renders don't re-tokenize unchanged blocks. highlight.js escapes the source,
// so the highlighted HTML is safe to inject; unhighlighted code stays plain text.
const codeBlockPreClass =
  "w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap rounded-sm border border-border bg-background p-2 text-xs leading-5 break-words [overflow-wrap:anywhere]";
const codeBlockCodeClass =
  "hljs block min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

const CodeBlock = memo(function CodeBlock({ language, text }: { language?: string; text: string }) {
  const highlighted = useMemo(() => highlightCode(text, language), [language, text]);
  if (highlighted === null) {
    return (
      <pre className={codeBlockPreClass}>
        <code className={`${codeBlockCodeClass} text-foreground`}>{text}</code>
      </pre>
    );
  }
  return (
    <pre className={codeBlockPreClass}>
      <code className={codeBlockCodeClass} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
});

function codeBlockFromPreNode(node: unknown) {
  const pre = hastElement(node);
  const code = hastElement(pre?.children[0]);
  if (!code || code.tagName !== "code") {
    return null;
  }
  return {
    language: codeLanguage(code.properties.className),
    text: hastTextContent(code),
  };
}

interface HastElementLike {
  tagName: string;
  properties: Record<string, unknown>;
  children: unknown[];
}

function hastElement(value: unknown): HastElementLike | null {
  if (!isRecord(value) || typeof value.tagName !== "string" || !Array.isArray(value.children)) {
    return null;
  }
  return {
    children: value.children,
    properties: isRecord(value.properties) ? value.properties : {},
    tagName: value.tagName,
  };
}

function hastTextContent(node: HastElementLike) {
  return node.children
    .map((child) => {
      if (!isRecord(child) || child.type !== "text" || typeof child.value !== "string") {
        return "";
      }
      return child.value;
    })
    .join("")
    .replace(/\n$/, "");
}

function codeLanguage(className: unknown) {
  const classes =
    typeof className === "string"
      ? className.split(/\s+/)
      : Array.isArray(className)
        ? className.filter((item): item is string => typeof item === "string")
        : [];
  for (const item of classes) {
    const match = /^language-([A-Za-z0-9_+-]+)$/.exec(item);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
