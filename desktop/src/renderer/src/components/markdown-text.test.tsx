import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { MarkdownText } from "./markdown-text";

describe("MarkdownText", () => {
  test("renders common markdown structures with dense chat styling", () => {
    const html = renderToString(
      <MarkdownText
        text={`# Heading

Paragraph with **strong**, *emphasis*, [safe link](https://example.test/path), and \`inline code\`.

- first
  - nested
- second

1. ordered
2. list

> quoted

| Name | Value |
| --- | --- |
| alpha | beta |

hard break\\
next line`}
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
    expect(html).toContain('href="https://example.test/path"');
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<table");
    expect(html).toContain("<br");
    expect(html).toContain("[overflow-wrap:anywhere]");
  });

  test("does not trust raw html from markdown", () => {
    const html = renderToString(<MarkdownText text={`Before\n\n<script>alert("x")</script>`} />);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("renders unsupported link schemes as inert text", () => {
    const html = renderToString(
      <MarkdownText
        text={[
          "[external](https://example.test/ok)",
          "[file](file:///tmp/secret)",
          "[script](javascript:alert(1))",
          "[local](/Users/example/file.txt)",
        ].join(" ")}
      />,
    );

    expect(html).toContain('href="https://example.test/ok"');
    expect(html).not.toContain('href="file:///tmp/secret"');
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain('href="/Users/example/file.txt"');
    expect(html).toContain("file");
    expect(html).toContain("script");
    expect(html).toContain("local");
  });

  test("routes fenced code through the shared highlighter", () => {
    const html = renderToString(
      <MarkdownText
        text={`\`\`\`ts
const answer: number = 42;
\`\`\``}
      />,
    );

    expect(html).toContain("hljs");
    expect(html).toContain("answer");
    expect(html).toContain("number");
    expect(html).not.toContain("overflow-x-auto");
  });

  test("keeps long tokens inside the chat column", () => {
    const html = renderToString(<MarkdownText text={`\`${"x".repeat(160)}\``} />);

    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("overflow-x-auto");
  });
});
