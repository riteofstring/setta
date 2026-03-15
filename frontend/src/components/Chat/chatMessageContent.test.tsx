import { renderToStaticMarkup } from "react-dom/server";
import { ChatRoleEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { InlineMarkdownText, MarkdownContent } from "./chatMessageContent";

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

describe("chatMessageContent markdown rendering", () => {
  it("renders inline code and fenced code blocks with monospace formatting hooks", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          "Path: `frontend/src/components/Chat/ChatMessages.tsx`",
          "",
          "```ts",
          "const path = 'frontend/src/components/Chat/ChatMessages.tsx';",
          "console.log(path);",
          "```",
        ].join("\n")}
        className="prose prose-sm"
        role={ChatRoleEnum.assistant}
        isStreaming={false}
      />,
    );

    expect(markup).toContain('data-setta-inline-code="true"');
    expect(markup).toContain("frontend/src/components/Chat/ChatMessages.tsx");
    expect(markup).toContain('data-setta-code-block="true"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain("cm-line");
  });

  it("wraps markdown tables in an internal overflow container", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          "## Summary: What to Cut/Simplify",
          "",
          "| Feature | Action |",
          "| --- | --- |",
          "| MetaControl sections | Merge with regular params |",
          "| Name sanitization ceremony | Use IDs primarily; name mapping only when needed |",
          "",
          "```ts",
          "const sectionKinds = ['chart', 'browser', 'terminal'];",
          "```",
        ].join("\n")}
        className="prose prose-sm"
        role={ChatRoleEnum.assistant}
        isStreaming={false}
      />,
    );

    expect(markup).toContain('data-chat-markdown-table-wrapper="true"');
    expect(markup).toContain('class="w-full table-fixed');
    expect(markup).toContain('data-setta-code-block="true"');
  });

  it("renders assistant markdown as markdown while the response is streaming", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          "Based on the docs:",
          "",
          "## Core Purpose",
          "",
          "- Build apps",
          "- Stream markdown",
          "Cur",
        ].join("\n")}
        className="prose prose-sm"
        role={ChatRoleEnum.assistant}
        isStreaming={true}
      />,
    );

    expect(markup).toContain('data-chat-streaming-markdown="true"');
    expect(markup).toContain(
      'data-chat-streaming-markdown-mode="full-markdown"',
    );
    expect(markup).toContain("<h2>Core Purpose</h2>");
    expect(markup).toContain("<li>Build apps</li>");
    expect(markup).toContain("Stream markdown");
    expect(markup).toContain("Cur");
    expect(markup).not.toContain("## Core Purpose");
    expect(markup).not.toContain('data-chat-streaming-markdown-tail="true"');
    expect(markup).not.toContain('data-chat-streaming-character="settled"');
  });
});

describe("chatMessageContent search highlighting", () => {
  it("highlights visible markdown text while skipping fenced and inline code", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content="Visible alpha\n\n```ts\nalpha in code\n```\n`alpha inline`\nalpha outside"
        className="prose prose-sm"
        role={ChatRoleEnum.assistant}
        isStreaming={false}
        highlightTerms={["alpha"]}
      />,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      2,
    );
    expect(markup).toContain(">alpha</mark>");
    expect(markup).not.toContain(">alpha in code</mark>");
    expect(markup).not.toContain(">alpha inline</mark>");
  });

  it("renders inline markdown labels with visible-term highlights only", () => {
    const markup = renderToStaticMarkup(
      <div className="truncate [&_p]:inline">
        <InlineMarkdownText
          content="Queue `queue code` queue"
          highlightTerms={["queue"]}
        />
      </div>,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      2,
    );
    expect(markup).toContain(">Queue</mark>");
    expect(markup).toContain(">queue</mark>");
    expect(markup).not.toContain(">queue code</mark>");
  });
});
