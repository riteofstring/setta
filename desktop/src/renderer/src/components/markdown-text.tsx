import { Fragment, memo, type ReactNode } from "react";

type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string };

type ParsedMarkdownBlock = {
  block: MarkdownBlock;
  nextIndex: number;
};

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="markdown-text">
      {blocks.map((block, index) => (
        <MarkdownBlockView block={block} key={index} />
      ))}
    </div>
  );
});

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading": {
      const Tag = headingTagFor(block.level);
      return <Tag>{renderInlineMarkdown(block.text)}</Tag>;
    }
    case "paragraph":
      return <p>{renderInlineMarkdown(block.text)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
  }
}

function headingTagFor(level: 1 | 2 | 3 | 4): "h1" | "h2" | "h3" | "h4" {
  switch (level) {
    case 1:
      return "h1";
    case 2:
      return "h2";
    case 3:
      return "h3";
    case 4:
      return "h4";
  }
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lineIsBlank(lines[index] ?? "")) {
      index += 1;
      continue;
    }
    const parsed = parseMarkdownBlock(lines, index);
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

function parseMarkdownBlock(lines: string[], index: number): ParsedMarkdownBlock {
  const line = lines[index] ?? "";
  const heading = parseHeadingBlock(line);
  if (isFenceLine(line)) {
    return parseCodeBlock(lines, index);
  }
  if (heading) {
    return { block: heading, nextIndex: index + 1 };
  }
  return (
    parseListBlock(lines, index, false) ??
    parseListBlock(lines, index, true) ??
    parseParagraphBlock(lines, index)
  );
}

function parseCodeBlock(lines: string[], index: number): ParsedMarkdownBlock {
  const codeLines: string[] = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && !isFenceLine(lines[nextIndex] ?? "")) {
    codeLines.push(lines[nextIndex] ?? "");
    nextIndex += 1;
  }
  return {
    block: { kind: "code", text: codeLines.join("\n") },
    nextIndex: nextIndex < lines.length ? nextIndex + 1 : nextIndex,
  };
}

function parseHeadingBlock(line: string): MarkdownBlock | null {
  const heading = /^(#{1,4})\s+(.+)$/.exec(line);
  if (!heading) {
    return null;
  }
  const markers = heading[1] ?? "";
  return {
    kind: "heading",
    level: markers.length as 1 | 2 | 3 | 4,
    text: heading[2] ?? "",
  };
}

function parseListBlock(
  lines: string[],
  index: number,
  ordered: boolean,
): ParsedMarkdownBlock | null {
  const expression = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/;
  if (!expression.test(lines[index] ?? "")) {
    return null;
  }
  const items: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const match = expression.exec(lines[nextIndex] ?? "");
    if (!match) {
      break;
    }
    items.push(match[1] ?? "");
    nextIndex += 1;
  }
  return { block: { kind: "list", ordered, items }, nextIndex };
}

function parseParagraphBlock(lines: string[], index: number): ParsedMarkdownBlock {
  const paragraph: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length && lineStartsParagraph(lines[nextIndex] ?? "")) {
    paragraph.push((lines[nextIndex] ?? "").trim());
    nextIndex += 1;
  }
  return { block: { kind: "paragraph", text: paragraph.join(" ") }, nextIndex };
}

function lineIsBlank(line: string): boolean {
  return line.trim() === "";
}

function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith("```");
}

function lineStartsParagraph(line: string): boolean {
  return (
    !lineIsBlank(line) &&
    !isFenceLine(line) &&
    !/^(#{1,4})\s+/.test(line) &&
    !/^[-*]\s+/.test(line) &&
    !/^\d+[.)]\s+/.test(line)
  );
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
