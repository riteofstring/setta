import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getConversationSearchRehypePlugins,
  renderConversationSearchHighlightedText,
} from "./chatSearchHighlight";

type SearchHighlightTestTree = {
  children: Array<{
    children: unknown[];
  }>;
};

function applySearchHighlightTransform(
  normalizedSearchTerms: string[],
  tree: SearchHighlightTestTree,
) {
  const plugin = getConversationSearchRehypePlugins(normalizedSearchTerms)?.[0];
  if (!plugin) {
    throw new Error("Expected search highlight plugin.");
  }
  plugin()(tree as never);
}

function serializedChildNodes(
  tree: SearchHighlightTestTree,
  childIndex: number,
): string {
  const child = tree.children[childIndex];
  if (!child) {
    throw new Error(`Expected child node ${childIndex}.`);
  }
  return JSON.stringify(child.children);
}

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

    applySearchHighlightTransform(["alpha"], tree);

    expect(serializedChildNodes(tree, 0)).toContain(
      '"data-chat-search-highlight":"true"',
    );
    expect(serializedChildNodes(tree, 1)).toContain("alpha inside code");
    expect(serializedChildNodes(tree, 1)).not.toContain(
      '"data-chat-search-highlight":"true"',
    );
  });

  it("recurses through nested elements but still skips nested pre blocks", () => {
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

    applySearchHighlightTransform(["alpha"], tree);

    expect(serializedChildNodes(tree, 0)).toContain(
      '"data-chat-search-highlight":"true"',
    );
    expect(serializedChildNodes(tree, 1)).toContain("alpha hidden");
    expect(serializedChildNodes(tree, 1)).not.toContain(
      '"data-chat-search-highlight":"true"',
    );
  });
});
