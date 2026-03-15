import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  type ConversationSearchTextRange,
  findConversationSearchTextRanges,
} from "utils/conversationSearch";
import { ChatRoleEnum } from "utils/generatedTypes";
import {
  type AnimatedStreamingCharacter,
  reconcileAnimatedStreamingCharacters,
  splitStreamingMarkdownText,
} from "./streamingMarkdown";
import { useTypewriterEffect } from "./useTypewriterEffect";

type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
  highlightTerms?: Array<string>;
};

type HastNode = {
  type: string;
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

const CHAT_MARKDOWN_COMPONENTS: Components = {
  code: (props) => <CodeBlock {...props} wrapLines />,
  pre: MarkdownCodePre,
  table: ({ children }) => (
    <div
      data-chat-markdown-table-wrapper="true"
      className="my-2 max-w-full overflow-x-auto"
    >
      <table className="w-full table-fixed border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="break-words px-2 py-1 text-left align-top font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="break-words px-2 py-1 align-top">{children}</td>
  ),
};

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
    if (child.type === "text" && typeof child.value === "string") {
      const ranges = findConversationSearchTextRanges(
        child.value,
        normalizedSearchTerms,
      );
      if (ranges.length === 0) {
        continue;
      }
      const replacementNodes = buildConversationSearchHighlightNodes(
        child.value,
        ranges,
      );
      children.splice(index, 1, ...replacementNodes);
      index += replacementNodes.length - 1;
      continue;
    }
    if (
      child.type === "element" &&
      typeof child.tagName === "string" &&
      CHAT_SEARCH_HIGHLIGHT_SKIP_TAGS.has(child.tagName)
    ) {
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

function getConversationSearchRehypePlugins(
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

function buildInitialAnimatedStreamingCharacters(
  text: string,
): Array<AnimatedStreamingCharacter> {
  let nextId = 0;
  return Array.from(text || "").map((value) => ({
    id: nextId++,
    value,
    animate: false,
  }));
}

function useAnimatedStreamingCharacters(
  text: string,
  enabled: boolean,
): Array<AnimatedStreamingCharacter> {
  const nextIdRef = useRef(0);
  const [characters, setCharacters] = useState<
    Array<AnimatedStreamingCharacter>
  >(() => {
    const initialCharacters = buildInitialAnimatedStreamingCharacters(text);
    nextIdRef.current = initialCharacters.length;
    return initialCharacters;
  });

  useEffect(() => {
    const normalizedText = text || "";
    if (!enabled) {
      const nextCharacters =
        buildInitialAnimatedStreamingCharacters(normalizedText);
      nextIdRef.current = nextCharacters.length;
      setCharacters((previousCharacters) => {
        const previousText = previousCharacters
          .map((character) => character.value)
          .join("");
        if (previousText === normalizedText) {
          return previousCharacters.every((character) => !character.animate)
            ? previousCharacters
            : previousCharacters.map((character) => ({
                ...character,
                animate: false,
              }));
        }
        return nextCharacters;
      });
      return;
    }
    setCharacters((previousCharacters) => {
      const reconciledCharacters = reconcileAnimatedStreamingCharacters(
        previousCharacters.map(({ id, value }) => ({ id, value })),
        normalizedText,
        nextIdRef.current,
      );
      nextIdRef.current = reconciledCharacters.nextId;
      return reconciledCharacters.characters;
    });
  }, [enabled, text]);

  useEffect(() => {
    if (!enabled || !characters.some((character) => character.animate)) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCharacters((previousCharacters) =>
        previousCharacters.some((character) => character.animate)
          ? previousCharacters.map((character) =>
              character.animate
                ? {
                    ...character,
                    animate: false,
                  }
                : character,
            )
          : previousCharacters,
      );
    }, 180);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [characters, enabled]);

  return characters;
}

function useStreamingCommitAnimationClass(
  committedLineCount: number,
  enabled: boolean,
): string {
  const previousCommittedLineCountRef = useRef(committedLineCount);
  const [commitAnimationPhase, setCommitAnimationPhase] = useState(0);

  useEffect(() => {
    if (!enabled) {
      previousCommittedLineCountRef.current = committedLineCount;
      return;
    }
    if (committedLineCount > previousCommittedLineCountRef.current) {
      setCommitAnimationPhase((previousPhase) => previousPhase + 1);
    }
    previousCommittedLineCountRef.current = committedLineCount;
  }, [committedLineCount, enabled]);

  if (commitAnimationPhase === 0) {
    return "";
  }
  return commitAnimationPhase % 2 === 0
    ? "chat-stream-commit-b"
    : "chat-stream-commit-a";
}

function useStreamingGrowthAnimation(
  elementRef: Ref<HTMLDivElement>,
  animationSignal: number,
  enabled: boolean,
) {
  const previousHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (
      !enabled ||
      typeof window === "undefined" ||
      !(elementRef && "current" in elementRef)
    ) {
      return;
    }
    const element = elementRef.current;
    if (!element) {
      return;
    }
    const nextHeightPx = element.getBoundingClientRect().height;
    const previousHeightPx = previousHeightRef.current;
    previousHeightRef.current = nextHeightPx;
    if (previousHeightPx === null) {
      return;
    }
    const growthPx = nextHeightPx - previousHeightPx;
    if (growthPx <= 1 || typeof element.animate !== "function") {
      return;
    }
    element.animate([{ opacity: 0.96 }, { opacity: 1 }], {
      duration: 170,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [animationSignal, elementRef, enabled]);
}

function StreamingTailText({
  text,
  className,
  highlightTerms = [],
  animateCharacters,
  dataAttributeName,
}: {
  text: string;
  className: string;
  highlightTerms?: Array<string>;
  animateCharacters: boolean;
  dataAttributeName: string;
}) {
  const characters = useAnimatedStreamingCharacters(
    text,
    animateCharacters && highlightTerms.length === 0,
  );
  const attribute =
    dataAttributeName === "data-chat-streaming-markdown-tail"
      ? { "data-chat-streaming-markdown-tail": "true" }
      : { "data-chat-assistant-activity-thought-stream-tail": "true" };

  return (
    <div {...attribute} className={className}>
      {highlightTerms.length > 0
        ? renderConversationSearchHighlightedText(text, highlightTerms)
        : characters.map((character) => (
            <span
              key={character.id}
              className={
                character.animate ? "chat-stream-char-enter" : undefined
              }
              data-chat-streaming-character={
                character.animate ? "entering" : "settled"
              }
            >
              {character.value === " " ? "\u00A0" : character.value}
            </span>
          ))}
    </div>
  );
}

function StreamingMarkdownContent({
  content,
  className,
  highlightTerms = [],
}: {
  content: string;
  className: string;
  highlightTerms?: Array<string>;
}) {
  const displayText = useTypewriterEffect(content, true, {
    typingSpeed: 8,
    baseMaxCharsPerFrame: 1,
    maxCharsPerFrameCap: 4,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rehypePlugins = useMemo(() => {
    if (highlightTerms.length === 0) {
      return [rehypeKatex];
    }
    return [rehypeKatex, ...getConversationSearchRehypePlugins(highlightTerms)];
  }, [highlightTerms]);

  useStreamingGrowthAnimation(rootRef, displayText.length, true);

  return (
    <div
      ref={rootRef}
      className="inline-block max-w-full align-top"
      data-chat-streaming-markdown="true"
      data-chat-streaming-markdown-mode="full-markdown"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        className={className}
        components={CHAT_MARKDOWN_COMPONENTS}
      >
        {displayText}
      </ReactMarkdown>
    </div>
  );
}

export function ThoughtPreviewMarkdown({
  text,
  animate,
  markdownClassName,
  tailClassName,
}: {
  text: string;
  animate: boolean;
  markdownClassName: string;
  tailClassName: string;
}) {
  const displayText = useTypewriterEffect(text, animate, {
    typingSpeed: 9,
    baseMaxCharsPerFrame: 1,
    maxCharsPerFrameCap: 3,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { committedMarkdown, activeTailText, committedLineCount } = useMemo(
    () =>
      animate
        ? splitStreamingMarkdownText(displayText)
        : {
            committedMarkdown: displayText,
            activeTailText: "",
            committedLineCount: 0,
          },
    [animate, displayText],
  );
  const commitAnimationClass = useStreamingCommitAnimationClass(
    committedLineCount,
    animate,
  );

  useStreamingGrowthAnimation(rootRef, committedLineCount, animate);

  return (
    <div
      ref={rootRef}
      data-chat-assistant-activity-thought-markdown-preview="true"
      data-chat-assistant-activity-thought-markdown-mode={
        animate ? "line-committed" : "static"
      }
    >
      {committedMarkdown ? (
        <div className={commitAnimationClass}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className={markdownClassName}
            components={CHAT_MARKDOWN_COMPONENTS}
          >
            {committedMarkdown}
          </ReactMarkdown>
        </div>
      ) : null}
      {activeTailText ? (
        <StreamingTailText
          text={activeTailText}
          className={tailClassName}
          animateCharacters={animate}
          dataAttributeName="data-chat-assistant-activity-thought-stream-tail"
        />
      ) : null}
    </div>
  );
}

function StaticMarkdownContent({
  content,
  className,
  highlightTerms = [],
}: {
  content: string;
  className: string;
  highlightTerms?: Array<string>;
}) {
  const rehypePlugins = useMemo(() => {
    if (highlightTerms.length === 0) {
      return [rehypeKatex];
    }
    return [rehypeKatex, ...getConversationSearchRehypePlugins(highlightTerms)];
  }, [highlightTerms]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={rehypePlugins}
      className={className}
      components={CHAT_MARKDOWN_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
}

export function InlineMarkdownText({
  content,
  highlightTerms = [],
}: {
  content: string;
  highlightTerms?: Array<string>;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={getConversationSearchRehypePlugins(highlightTerms)}
      components={{
        p: ({ children }) => <span>{children}</span>,
        a: ({ children }) => <span>{children}</span>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function MarkdownContent({
  content,
  className,
  role,
  isStreaming,
  highlightTerms = [],
}: MarkdownContentProps) {
  if (role === ChatRoleEnum.assistant && isStreaming) {
    return (
      <StreamingMarkdownContent
        content={content}
        className={className}
        highlightTerms={highlightTerms}
      />
    );
  }

  const markdownWidthClassName =
    role === ChatRoleEnum.assistant
      ? "inline-block max-w-full align-top"
      : "w-full max-w-full";

  return (
    <StaticMarkdownContent
      content={content}
      className={`${markdownWidthClassName} ${className}`}
      highlightTerms={highlightTerms}
    />
  );
}
