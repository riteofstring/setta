import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getConversationSearchRehypePlugins,
  renderConversationSearchHighlightedText,
} from "./chatSearchHighlight";

describe("chatSearchHighlight", () => {
  it("renders highlighted inline transcript text", () => {
    const markup = renderToStaticMarkup(
      <>
        {renderConversationSearchHighlightedText("release-plan.md", [
          "release",
        ])}
      </>,
    );

    expect(markup).toContain('data-chat-search-highlight="true"');
    expect(markup).toContain(">release</mark>-plan.md");
  });

  it("highlights plain text nodes but skips code blocks", () => {
    const plugins = getConversationSearchRehypePlugins(["alpha"]);
    const transform = plugins?.[0]?.();
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [{ type: "text", value: "alpha outside code" }],
        },
        {
          type: "element",
          tagName: "code",
          children: [{ type: "text", value: "alpha inside code" }],
        },
      ],
    };

    transform?.(tree);

    expect(JSON.stringify(tree.children?.[0]?.children ?? [])).toContain(
      '"data-chat-search-highlight":"true"',
    );
    expect(JSON.stringify(tree.children?.[1]?.children ?? [])).toContain(
      "alpha inside code",
    );
    expect(JSON.stringify(tree.children?.[1]?.children ?? [])).not.toContain(
      '"data-chat-search-highlight":"true"',
    );
  });

  it("recurses through nested elements but still skips nested pre blocks", () => {
    const plugins = getConversationSearchRehypePlugins(["alpha"]);
    const transform = plugins?.[0]?.();
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "div",
          children: [
            {
              type: "element",
              tagName: "span",
              children: [{ type: "text", value: "alpha nested" }],
            },
          ],
        },
        {
          type: "element",
          tagName: "pre",
          children: [
            {
              type: "element",
              tagName: "span",
              children: [{ type: "text", value: "alpha hidden" }],
            },
          ],
        },
      ],
    };

    transform?.(tree);

    expect(JSON.stringify(tree.children?.[0]?.children ?? [])).toContain(
      '"data-chat-search-highlight":"true"',
    );
    expect(JSON.stringify(tree.children?.[1]?.children ?? [])).toContain(
      "alpha hidden",
    );
    expect(JSON.stringify(tree.children?.[1]?.children ?? [])).not.toContain(
      '"data-chat-search-highlight":"true"',
    );
  });
});
