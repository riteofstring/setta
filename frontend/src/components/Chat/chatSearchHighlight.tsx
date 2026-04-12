import { ReactNode } from "react";
import {
  type ConversationSearchTextRange,
  findConversationSearchTextRanges,
} from "utils/conversationSearch";

type HastNode = {
  type: "root" | "element" | "text";
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Array<HastNode>;
};

const CHAT_SEARCH_HIGHLIGHT_CLASS_NAME =
  "rounded-sm bg-amber-200/80 px-[0.06rem] text-inherit dark:bg-amber-500/20";
const CHAT_SEARCH_HIGHLIGHT_SKIP_TAGS = new Set([
  "code",
  "pre",
  "script",
  "style",
]);

function buildConversationSearchHighlightNodes(
  value: string,
  ranges: Array<ConversationSearchTextRange>,
): Array<HastNode> {
  if (ranges.length === 0) {
    return [{ type: "text", value }];
  }
  const nodes: Array<HastNode> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      nodes.push({
        type: "text",
        value: value.slice(cursor, range.start),
      });
    }
    nodes.push({
      type: "element",
      tagName: "mark",
      properties: {
        className: [CHAT_SEARCH_HIGHLIGHT_CLASS_NAME],
        "data-chat-search-highlight": "true",
      },
      children: [
        {
          type: "text",
          value: value.slice(range.start, range.end),
        },
      ],
    });
    cursor = range.end;
  }
  if (cursor < value.length) {
    nodes.push({
      type: "text",
      value: value.slice(cursor),
    });
  }
  return nodes;
}

function findConversationSearchReplacementNodes(
  child: HastNode,
  normalizedSearchTerms: Array<string>,
): Array<HastNode> | null {
  if (child.type !== "text" || typeof child.value !== "string") {
    return null;
  }
  const ranges = findConversationSearchTextRanges(
    child.value,
    normalizedSearchTerms,
  );
  if (ranges.length === 0) {
    return null;
  }
  return buildConversationSearchHighlightNodes(child.value, ranges);
}

function shouldSkipConversationSearchChild(child: HastNode): boolean {
  return (
    child.type === "element" &&
    typeof child.tagName === "string" &&
    CHAT_SEARCH_HIGHLIGHT_SKIP_TAGS.has(child.tagName)
  );
}

function highlightConversationSearchTextNodes(
  node: HastNode,
  normalizedSearchTerms: Array<string>,
): void {
  const children = node.children;
  if (!children || children.length === 0) {
    return;
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    const replacementNodes = findConversationSearchReplacementNodes(
      child,
      normalizedSearchTerms,
    );
    if (replacementNodes) {
      children.splice(index, 1, ...replacementNodes);
      index += replacementNodes.length - 1;
      continue;
    }
    if (shouldSkipConversationSearchChild(child)) {
      continue;
    }
    highlightConversationSearchTextNodes(child, normalizedSearchTerms);
  }
}

function buildConversationSearchHighlightPlugin(
  normalizedSearchTerms: Array<string>,
) {
  return () => {
    return (tree: HastNode) => {
      highlightConversationSearchTextNodes(tree, normalizedSearchTerms);
    };
  };
}

export function getConversationSearchRehypePlugins(
  normalizedSearchTerms: Array<string>,
): Array<() => (tree: HastNode) => void> | undefined {
  if (normalizedSearchTerms.length === 0) {
    return undefined;
  }
  return [buildConversationSearchHighlightPlugin(normalizedSearchTerms)];
}

export function renderConversationSearchHighlightedText(
  text: string,
  normalizedSearchTerms: Array<string>,
): ReactNode {
  const ranges = findConversationSearchTextRanges(text, normalizedSearchTerms);
  if (ranges.length === 0) {
    return text;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <mark
        key={`${range.start}-${range.end}`}
        className={CHAT_SEARCH_HIGHLIGHT_CLASS_NAME}
        data-chat-search-highlight="true"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}
