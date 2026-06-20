import { memo, useMemo } from "react";
import type { ReactNode } from "react";

const plainTextSegmentLength = 512;
const segmentedPlainTextThreshold = plainTextSegmentLength * 4;

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const markdownSyntax = hasMarkdownSyntax(text);
  const blocks = useMemo(() => (markdownSyntax ? parseBlocks(text) : []), [markdownSyntax, text]);
  if (!markdownSyntax) {
    return (
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden text-[13px] leading-5 break-words text-inherit [overflow-wrap:anywhere]">
        <p className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          <PlainTextContent text={text} />
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden text-[13px] leading-5 break-words text-inherit [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre
              className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap rounded-sm border border-border bg-background p-2 text-xs leading-5 break-words text-foreground [overflow-wrap:anywhere]"
              key={index}
            >
              <code className="block min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {block.text}
              </code>
            </pre>
          );
        }
        return (
          <p
            className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            key={index}
          >
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
});

function PlainTextContent({ text }: { text: string }) {
  if (text.length < segmentedPlainTextThreshold) {
    return text;
  }
  return <SegmentedPlainText text={text} />;
}

function SegmentedPlainText({ text }: { text: string }) {
  const segments = useMemo(() => splitPlainTextSegments(text), [text]);
  return segments.map((segment, index) => <PlainTextSegment key={index} text={segment} />);
}

const PlainTextSegment = memo(function PlainTextSegment({ text }: { text: string }) {
  return <span>{text}</span>;
});

function splitPlainTextSegments(text: string) {
  const segments: string[] = [];
  for (let index = 0; index < text.length; index += plainTextSegmentLength) {
    segments.push(text.slice(index, index + plainTextSegmentLength));
  }
  return segments;
}

function hasMarkdownSyntax(text: string) {
  return text.includes("`") || text.includes("**");
}

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
        <code
          className="rounded bg-secondary px-1 py-0.5 text-[0.85em] break-words text-accent-teal [overflow-wrap:anywhere]"
          key={index}
        >
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
