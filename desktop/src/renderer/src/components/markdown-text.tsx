import { memo, useMemo } from "react";
import type { ReactNode } from "react";

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="min-w-0 space-y-3 text-sm leading-6 break-words text-inherit">
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre
              className="max-w-full overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs leading-5 text-zinc-50"
              key={index}
            >
              <code>{block.text}</code>
            </pre>
          );
        }
        return (
          <p className="whitespace-pre-wrap break-words" key={index}>
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
});

type MarkdownBlock = { kind: "code" | "paragraph"; text: string };

function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split(/\r?\n/);
  let paragraph: string[] = [];
  let code: string[] = [];
  let inCode = false;

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }

  function flushCode() {
    blocks.push({ kind: "code", text: code.join("\n") });
    code = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  if (inCode) {
    flushCode();
  }
  flushParagraph();
  if (blocks.length === 0) {
    return [{ kind: "paragraph", text: "" }];
  }
  return blocks;
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code className="rounded bg-zinc-800 px-1 py-0.5 text-[0.85em] text-zinc-100" key={index}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong className="font-semibold text-inherit" key={index}>
          {token.slice(2, -2)}
        </strong>,
      );
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}
