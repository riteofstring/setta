import { Fragment, memo, type ReactNode } from "react";

type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: MarkdownListItem[] }
  | { kind: "code"; text: string };

/**
 * A list item, and whether it was written as a task.
 *
 * `- [ ] thing` is how a model writes a checklist, and rendering the brackets
 * literally is the single most common way generated prose looks broken.
 */
interface MarkdownListItem {
  checked: boolean | null;
  text: string;
}

type ParsedMarkdownBlock = {
  block: MarkdownBlock;
  nextIndex: number;
};

export const MarkdownText = memo(function MarkdownText({
  headingLevelOffset = 0,
  text,
}: {
  headingLevelOffset?: 0 | 1;
  text: string;
}) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="markdown-text">
      {blocks.map((block, index) => (
        <MarkdownBlockView block={block} headingLevelOffset={headingLevelOffset} key={index} />
      ))}
    </div>
  );
});

function MarkdownBlockView({
  block,
  headingLevelOffset,
}: {
  block: MarkdownBlock;
  headingLevelOffset: 0 | 1;
}) {
  switch (block.kind) {
    case "heading": {
      const Tag = headingTagFor(block.level + headingLevelOffset);
      return <Tag>{renderInlineMarkdown(block.text)}</Tag>;
    }
    case "paragraph":
      return <p>{renderInlineMarkdown(block.text)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li data-task={item.checked === null ? undefined : String(item.checked)} key={index}>
              {item.checked === null ? null : (
                <span aria-hidden="true" className="markdown-task-mark">
                  {item.checked ? "✓" : "○"}
                </span>
              )}
              {item.checked === null ? null : (
                <span className="sr-only">{item.checked ? "Done: " : "To do: "}</span>
              )}
              {renderInlineMarkdown(item.text)}
            </li>
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

function headingTagFor(level: number): "h1" | "h2" | "h3" | "h4" | "h5" {
  switch (level) {
    case 1:
      return "h1";
    case 2:
      return "h2";
    case 3:
      return "h3";
    case 4:
      return "h4";
    case 5:
      return "h5";
    default:
      throw new Error(`unsupported Markdown heading level ${level}`);
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
  const items: MarkdownListItem[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const match = expression.exec(lines[nextIndex] ?? "");
    if (!match) {
      break;
    }
    items.push(parseMarkdownListItem(match[1] ?? ""));
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

const taskItemExpression = /^\[([ xX])\]\s+/;

function parseMarkdownListItem(text: string): MarkdownListItem {
  const match = taskItemExpression.exec(text);
  if (match === null) {
    return { checked: null, text };
  }
  return {
    checked: (match[1] ?? " ").toLowerCase() === "x",
    text: text.slice(match[0].length),
  };
}

/**
 * Inline spans: code first, then emphasis.
 *
 * Code is split off first because its content is verbatim — an asterisk inside
 * backticks is an asterisk. Emphasis is then applied only to the remainder, so
 * `**bold**` cannot eat a code span's markers.
 */
export function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{renderInlineEmphasis(part)}</Fragment>;
  });
}

// `**` before `*` so a bold run is not read as two italics, and `_` only at a
// word boundary so snake_case identifiers survive.
const emphasisExpression = /(\*\*[^*]+\*\*|\*[^*]+\*|\b_[^_]+_\b)/g;

function renderInlineEmphasis(text: string): ReactNode {
  const parts = text.split(emphasisExpression);
  return parts.map(renderInlineEmphasisPart);
}

function renderInlineEmphasisPart(part: string, index: number): ReactNode {
  if (hasInlineDelimiter(part, "**", 4)) {
    return <strong key={index}>{part.slice(2, -2)}</strong>;
  }
  if (hasInlineDelimiter(part, "*", 2)) {
    return <em key={index}>{part.slice(1, -1)}</em>;
  }
  if (hasInlineDelimiter(part, "_", 2)) {
    return <em key={index}>{part.slice(1, -1)}</em>;
  }
  return <Fragment key={index}>{part}</Fragment>;
}

function hasInlineDelimiter(part: string, delimiter: string, minimumLength: number): boolean {
  return part.startsWith(delimiter) && part.endsWith(delimiter) && part.length > minimumLength;
}
