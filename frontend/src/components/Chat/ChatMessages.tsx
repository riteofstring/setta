import * as Accordion from "@radix-ui/react-accordion";
import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";
import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  ReactNode,
  type PointerEvent as ReactPointerEvent,
  Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaBrain } from "react-icons/fa6";
import {
  FiArchive,
  FiCopy,
  FiCpu,
  FiEdit3,
  FiFileText,
  FiRotateCcw,
  FiTerminal,
  FiTrash2,
} from "react-icons/fi";
import { IoMdCheckmark } from "react-icons/io";
import {
  MdChevronLeft,
  MdChevronRight,
  MdErrorOutline,
  MdKeyboardArrowDown,
  MdOutlineSmartToy,
} from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import {
  APPROVAL_TOOL_NAME,
  type ApprovalPayload,
  type AskUserQuestionPayload,
  normalizeToolName,
  parseAnswers,
  parseApprovalPayload,
  parseAskUserQuestionPayload,
  parseTodoPayload,
  QUESTION_TOOL_NAME,
  resolveToolCallArguments,
  TODO_TOOL_NAME,
  type TodoListPayload,
} from "utils/claudeTools";
import {
  type ConversationSearchTextRange,
  findConversationSearchTextRanges,
} from "utils/conversationSearch";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";
import { ApprovalCard } from "./ApprovalCard";
import {
  type ActivityMessageContext,
  type ActivityPreviewData,
  type ActivityTimelineEntry,
  type AssistantChatMessage,
  buildActivityTimelineEntries,
  buildCopyTextForActivityTimelineEntry,
  buildCopyTextForMessage,
  type ChatContentItem,
  extractNonEmptyStringArg,
  getStreamActivitySummary,
  hasAssistantActivityContent,
  hasMeaningfulAssistantDisplayItems,
  isAssistantActivityOnlyMessage,
  isAssistantErrorText,
  partitionAssistantContent,
  resolveActionLabel,
  resolveActivityTimestampMs,
  resolveCollapsedThinkingActivityLabel,
  resolveCompactionEntryLabel,
  resolveCompactionSummaryText,
  resolveDisplayArgsForToolCallEntry,
  resolveLatestActivityPreview,
  resolveLatestThinkingSummary,
  resolveMessageCreatedAtMs,
  resolveThinkingSummaryHeadline,
  stripAssistantErrorPrefix,
  type ThinkingContentItem,
  type ThinkingRenderEntry,
  type ToolCallRenderEntry,
  type ToolResultValue,
} from "./chatAssistantActivity";
import { ChatAttachmentList, ChatImage } from "./chatAttachmentPreviews";
import {
  type ChatAttachmentUrlMap,
  type RequestChatAttachmentUrls,
  useChatAttachmentPreviewUrls,
} from "./chatAttachmentPreviewUrls";
import { ChatMessageEditor } from "./ChatMessageEditor";
import {
  formatStructuredToolResult as formatToolResult,
  resolveDiffTextFromUnknown,
  resolveStructuredOutputFallbackPayload,
  resolveStructuredOutputPayload,
  StructuredOutputBlock,
  type StructuredOutputOwner,
  type StructuredOutputPayload,
  type StructuredOutputRunState,
} from "./chatStructuredOutput";
import { QuestionCard } from "./QuestionCard";
import {
  type AnimatedStreamingCharacter,
  reconcileAnimatedStreamingCharacters,
  splitStreamingMarkdownText,
} from "./streamingMarkdown";
import { TodoListCard } from "./TodoListCard";
import { useTypewriterEffect } from "./useTypewriterEffect";

export { buildCopyTextForMessage };
type ActivityToolLikeRowKind = StructuredOutputOwner;

type ToolCallContext = {
  todoPayloadById: Record<string, TodoListPayload>;
  questionPayloadById: Record<string, AskUserQuestionPayload>;
  approvalPayloadById: Record<string, ApprovalPayload>;
  latestTodoCallId: string | null;
};

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;
const ATTACHMENT_URL_REFRESH_BUFFER_MS = 30_000;
const CHAT_BUBBLE_MAX_WIDTH_CLASS = "max-w-[min(90%,820px)]";
const ASSISTANT_BUBBLE_MAX_WIDTH_CLASS = CHAT_BUBBLE_MAX_WIDTH_CLASS;
const CHAT_MARKDOWN_BASE_CLASS =
  "prose prose-sm max-w-full prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-snug prose-headings:mt-5 prose-headings:mb-2 prose-h1:text-[1.05rem] prose-h2:text-[1rem] prose-h3:text-[0.95rem] prose-h4:text-[0.9rem] prose-p:my-0 prose-p:leading-[1.45] prose-ul:my-1 prose-ol:my-1 prose-ul:pl-5 prose-ol:pl-5 prose-ul:leading-[1.45] prose-ol:leading-[1.45] prose-li:my-0 prose-li:leading-[1.45] prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 prose-pre:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p+p]:mt-2.5 [&_p+ul]:mt-2 [&_p+ol]:mt-2 [&_ul+p]:mt-2.5 [&_ol+p]:mt-2.5 [&_li+li]:mt-0.5 [&_li_p]:my-0 [&_*]:break-words";
const ASSISTANT_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;
const STREAMING_ASSISTANT_TAIL_CLASS =
  "whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-setta-700 dark:text-setta-100";
const THOUGHT_PREVIEW_MARKDOWN_CLASS =
  "prose prose-sm max-w-none text-[9px] leading-[1.35] text-setta-400 dark:prose-invert dark:text-setta-400/90 prose-headings:my-0 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-[10px] prose-h2:text-[9.5px] prose-h3:text-[9px] prose-h4:text-[9px] prose-p:my-0 prose-p:text-[9px] prose-p:leading-[1.35] prose-ul:my-0.5 prose-ol:my-0.5 prose-ul:pl-3.5 prose-ol:pl-3.5 prose-ul:text-[9px] prose-ol:text-[9px] prose-li:my-0 prose-li:text-[9px] prose-li:leading-[1.35] prose-code:before:hidden prose-code:after:hidden prose-code:text-[8px] prose-pre:my-1 prose-pre:px-2 prose-pre:py-1.5 prose-pre:text-[8px] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_li+li]:mt-0.5 [&_*]:break-words";
const THOUGHT_PREVIEW_TAIL_CLASS =
  "whitespace-pre-wrap break-words text-[9px] leading-[1.35] text-setta-400 dark:text-setta-400/90";
const TOOL_CALL_RAIL_GRID_CLASS = "grid-cols-[1.75rem_minmax(0,1fr)]";
const TOOL_CALL_RAIL_BACKGROUND_CLASS = "bg-setta-100/75 dark:bg-setta-800/75";
const ACTIVITY_ROW_HOVER_CLASS =
  "hover:bg-setta-100/35 dark:hover:bg-setta-900/55";
const ACTIVITY_CHILD_TRIGGER_CLASS =
  "bg-setta-50/95 hover:bg-setta-100/95 dark:bg-setta-875 dark:hover:bg-setta-850";
const ACTIVITY_ACCORDION_CONTENT_CLASS =
  "overflow-hidden data-[state=closed]:hidden data-[state=open]:block";
const ASSISTANT_ACTIVITY_CONTENT_CLASS = `${ACTIVITY_ACCORDION_CONTENT_CLASS} pt-1`;
const TOOL_SECTION_CARD_CLASS = "w-full overflow-hidden";
const TOOL_SECTION_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const TOOL_ROW_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const ASSISTANT_ACTIVITY_PARENT_CLASS = "w-full overflow-hidden bg-transparent";
const ASSISTANT_ACTIVITY_TRIGGER_CLASS = `group group/chat-activity-parent flex w-full flex-col cursor-pointer items-stretch text-left transition-colors ${ACTIVITY_ROW_HOVER_CLASS} [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const ACTIVITY_COUNT_BADGE_CLASS =
  "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200";
const ACTIVITY_COPY_BUTTON_BASE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-setta-500 transition-colors hover:bg-setta-200/80 hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:text-setta-300 dark:hover:bg-setta-700 dark:hover:text-setta-100";
const ACTIVITY_SECTION_COPY_BUTTON_CLASS = `${ACTIVITY_COPY_BUTTON_BASE_CLASS} bg-setta-100/90 dark:bg-setta-800/85`;
const ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS = `${ACTIVITY_SECTION_COPY_BUTTON_CLASS} opacity-0 pointer-events-none transition-opacity group-hover/chat-activity-row:opacity-100 group-hover/chat-activity-row:pointer-events-auto group-focus-within/chat-activity-row:opacity-100 group-focus-within/chat-activity-row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto`;
const ACTIVITY_PARENT_HOVER_META_CLASS =
  "pointer-events-none absolute right-6 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-end gap-x-1 gap-y-0.5 opacity-0 transition-opacity group-hover/chat-activity-parent:opacity-100 group-focus-within/chat-activity-parent:opacity-100";
const ACTIVITY_ITEM_HOVER_META_CLASS =
  "pointer-events-none absolute right-6 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-end gap-x-1 gap-y-0.5 opacity-0 transition-opacity group-hover/chat-activity-row:opacity-100 group-focus-within/chat-activity-row:opacity-100";
const ACTIVITY_PARENT_LABEL_CLASS =
  "min-w-0 flex-1 pr-5 transition-[padding-right] group-hover/chat-activity-parent:pr-[12rem] group-focus-within/chat-activity-parent:pr-[12rem]";
const ACTIVITY_ITEM_LABEL_CLASS =
  "min-w-0 flex-1 pr-5 transition-[padding-right] group-hover/chat-activity-row:pr-[8.5rem] group-focus-within/chat-activity-row:pr-[8.5rem]";
const ACTIVITY_THOUGHT_TOP_ONLY_MASK =
  "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)";
const CHAT_TIMESTAMP_CLASS =
  "shrink-0 text-[10px] font-medium tabular-nums text-setta-400 dark:text-setta-500";
const CHAT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const CHAT_TIMESTAMP_TOOLTIP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long",
});
const COUNT_BADGE_STEP_ANIMATION_MS = 120;
const COUNT_BADGE_STEP_PAUSE_MS = 24;
const ASSISTANT_ACTIVITY_DETAILS_VALUE = "assistant-activity-details";
const ACTIVITY_ROW_DETAILS_VALUE = "details";

type AssistantActivityChildAccordionControl = {
  defaultOpen: boolean;
  expandAllSignal: number;
  collapseAllSignal: number;
  suppressSummaries: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
};

type ChatMessageListProps = {
  messages: Array<BaseChatMessageUnion>;
  allMessagesForToolResults?: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments?: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  activeSearchMatchIndex?: number | null;
  conversationSearchTerms?: Array<string>;
  className?: string;
  contentClassName?: string;
  scrollRef?: Ref<HTMLDivElement>;
  editDisabledReason?: string | null;
  onConversationSearchMatchCountChange?: (count: number) => void;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfoByMessage?: Record<string, ChatMessageBranchInfo>;
};

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

function renderConversationSearchHighlightedText(
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

function ThoughtPreviewMarkdown({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
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
            className={THOUGHT_PREVIEW_MARKDOWN_CLASS}
            components={CHAT_MARKDOWN_COMPONENTS}
          >
            {committedMarkdown}
          </ReactMarkdown>
        </div>
      ) : null}
      {activeTailText ? (
        <StreamingTailText
          text={activeTailText}
          className={THOUGHT_PREVIEW_TAIL_CLASS}
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

function MarkdownContent({
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

function copyTextWithNotifications({
  text,
  emptyMessage,
  successMessage,
  failureMessage,
}: {
  text: string;
  emptyMessage: string;
  successMessage: string;
  failureMessage: string;
}) {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    addTemporaryNotification(emptyMessage, "warning");
    return;
  }
  void navigator.clipboard
    .writeText(normalizedText)
    .then(() => {
      addTemporaryNotification(successMessage);
    })
    .catch((error) => {
      console.error("Failed to copy text:", error);
      addTemporaryNotification(failureMessage, "error");
    });
}

const FILE_READ_ACTION_NAMES = new Set<string>([
  "read_file",
  "list_files",
  "search_files",
  "find_files",
  "glob",
  "grep",
]);
const FILE_EDIT_ACTION_NAMES = new Set<string>([
  "file_change",
  "write_file",
  "edit_file",
  "update_file",
  "apply_patch",
  "append_file",
  "create_file",
]);
const FILE_DELETE_ACTION_NAMES = new Set<string>([
  "delete_file",
  "remove_file",
  "unlink_file",
]);

function resolveToolNameSuffix(name: string): string {
  const segments = name.split("__");
  const suffix = segments[segments.length - 1];
  return suffix ?? name;
}

function toolNameMatchesActionSet(
  name: string,
  actionNames: Set<string>,
): boolean {
  if (actionNames.has(name)) {
    return true;
  }
  return actionNames.has(resolveToolNameSuffix(name));
}

function resolveActionOperation(args: unknown): string | null {
  const operationKeys = [
    "operation",
    "action",
    "changeType",
    "editType",
    "mode",
  ];
  for (const key of operationKeys) {
    const operation = extractNonEmptyStringArg(args, key);
    if (operation) {
      return operation.toLowerCase();
    }
  }
  return null;
}

function diffRepresentsDeletion(diffText: string): boolean {
  const normalized = diffText.toLowerCase();
  return (
    normalized.includes("deleted file mode ") ||
    normalized.includes("+++ /dev/null")
  );
}

function resolveActionRailIcon({
  name,
  args,
  result,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
}): ReactNode {
  const normalizedName = (normalizeToolName(name) ?? name).toLowerCase();
  if (normalizedName === "command_execution") {
    return <FiTerminal size={13} className="min-w-4" />;
  }
  const operation = resolveActionOperation(args);
  if (operation && /(delete|remove|unlink|rm)/u.test(operation)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (operation && /(read|view|list|search|find)/u.test(operation)) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  if (
    operation &&
    /(edit|write|update|patch|append|create|insert|replace)/u.test(operation)
  ) {
    return <FiEdit3 size={12} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_DELETE_ACTION_NAMES)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (
    normalizedName === "file_change" &&
    ((typeof args === "object" && args !== null
      ? diffRepresentsDeletion(resolveDiffTextFromUnknown(args) ?? "")
      : false) ||
      (typeof result === "object" && result !== null
        ? diffRepresentsDeletion(resolveDiffTextFromUnknown(result) ?? "")
        : false))
  ) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_EDIT_ACTION_NAMES)) {
    return <FiEdit3 size={12} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_READ_ACTION_NAMES)) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  if (
    normalizedName.includes("read_file") ||
    normalizedName.includes("list_files")
  ) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  return <PiWrenchFill size={13} className="min-w-4" />;
}

function resolveStreamingAssistantMessageId(
  messages: Array<BaseChatMessageUnion>,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === ChatRoleEnum.assistant) {
      return message.id;
    }
  }
  return null;
}

function useIdleStreamSpinner(
  shouldTrack: boolean,
  activityKey: string,
  delayMs: number,
): boolean {
  const [showSpinner, setShowSpinner] = useState(shouldTrack && delayMs <= 0);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!shouldTrack) {
      setShowSpinner(false);
      return;
    }
    lastActivityRef.current = Date.now();
    setShowSpinner(delayMs <= 0);
  }, [activityKey, delayMs, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack) {
      return undefined;
    }
    if (delayMs <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= delayMs) {
        setShowSpinner(true);
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [activityKey, delayMs, shouldTrack]);

  return showSpinner;
}

function formatElapsedDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveDurationLabel({
  elapsedMs,
  elapsedSeconds,
  hasKnownDuration,
  isRunning,
}: {
  elapsedMs: number;
  elapsedSeconds: number;
  hasKnownDuration: boolean;
  isRunning: boolean;
}): string | null {
  if (!hasKnownDuration) {
    return null;
  }
  if (!isRunning && elapsedSeconds === 0) {
    return "<1s";
  }
  return formatElapsedDuration(elapsedSeconds);
}

function resolveTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatChatTimestamp(timestampMs: number | null): string | null {
  const resolvedTimestampMs = resolveTimestampMs(timestampMs);
  if (resolvedTimestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_FORMATTER.format(resolvedTimestampMs);
}

function formatChatTimestampTitle(timestampMs: number | null): string | null {
  const resolvedTimestampMs = resolveTimestampMs(timestampMs);
  if (resolvedTimestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_TOOLTIP_FORMATTER.format(resolvedTimestampMs);
}

function ChatTimestamp({
  timestampMs,
  kind,
}: {
  timestampMs: number | null;
  kind: "message" | "activity-item";
}) {
  const label = formatChatTimestamp(timestampMs);
  if (!label) {
    return null;
  }
  const title = formatChatTimestampTitle(timestampMs) ?? undefined;
  if (kind === "activity-item") {
    return (
      <span
        data-chat-activity-item-timestamp="true"
        className={CHAT_TIMESTAMP_CLASS}
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      data-chat-message-timestamp="true"
      className={CHAT_TIMESTAMP_CLASS}
      title={title}
    >
      {label}
    </span>
  );
}

function ChatMessageTimestampFooter({
  timestampMs,
}: {
  timestampMs: number | null;
}) {
  if (timestampMs === null) {
    return null;
  }
  return (
    <div className="mt-0.5 flex justify-end">
      <ChatTimestamp timestampMs={timestampMs} kind="message" />
    </div>
  );
}

const SCRAMBLE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SCRAMBLE_UPDATE_INTERVAL_MS = 120;
const SCRAMBLE_REVEAL_DURATION_MS = 220;
const SCRAMBLE_MAX_HOLD_MS = 240;

function sampleScrambleChar(): string {
  const index = Math.floor(Math.random() * SCRAMBLE_CHARSET.length);
  return SCRAMBLE_CHARSET[index] ?? "X";
}

function buildScramblePlaceholder(length: number): string {
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

function buildScrambleRevealText({
  targetText,
  length,
  revealCount,
}: {
  targetText: string;
  length: number;
  revealCount: number;
}): string {
  if (length <= 0) {
    return "";
  }
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const targetChar = targetText[index];
    if (index < revealCount && targetChar !== undefined) {
      chars.push(targetChar);
      continue;
    }
    if (targetChar === " ") {
      chars.push(" ");
      continue;
    }
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

function useScrambledLabel({
  label,
  scramble,
}: {
  label: string;
  scramble: boolean;
}): string {
  const [displayText, setDisplayText] = useState(label);
  const displayRef = useRef(label);
  const scrambleSeedRef = useRef(label.length > 0 ? label.length : 24);
  const previousScrambleRef = useRef(scramble);

  useEffect(() => {
    displayRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayText(label);
      return;
    }
    let intervalId: number | null = null;
    let frameId: number | null = null;
    let holdTimeoutId: number | null = null;
    if (scramble) {
      scrambleSeedRef.current = Math.max(
        18,
        Math.min(64, displayRef.current.length || label.length || 24),
      );
      const updateScramble = () => {
        setDisplayText(buildScramblePlaceholder(scrambleSeedRef.current));
      };
      updateScramble();
      intervalId = window.setInterval(
        updateScramble,
        SCRAMBLE_UPDATE_INTERVAL_MS,
      );
      holdTimeoutId = window.setTimeout(() => {
        if (!previousScrambleRef.current) {
          return;
        }
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        setDisplayText(label);
      }, SCRAMBLE_MAX_HOLD_MS);
      previousScrambleRef.current = true;
      return () => {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        if (holdTimeoutId !== null) {
          window.clearTimeout(holdTimeoutId);
        }
      };
    }
    const wasScrambling = previousScrambleRef.current;
    previousScrambleRef.current = false;
    if (!wasScrambling) {
      setDisplayText(label);
      return undefined;
    }
    const startText = displayRef.current;
    const startLength = startText.length;
    const targetLength = label.length;
    const durationMs = SCRAMBLE_REVEAL_DURATION_MS;
    const startTs = window.performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startTs) / durationMs);
      const nextLength = Math.max(
        1,
        Math.round(startLength + (targetLength - startLength) * progress),
      );
      const revealCount = Math.floor(targetLength * progress);
      if (progress >= 1) {
        setDisplayText(label);
        return;
      }
      setDisplayText(
        buildScrambleRevealText({
          targetText: label,
          length: nextLength,
          revealCount,
        }),
      );
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (holdTimeoutId !== null) {
        window.clearTimeout(holdTimeoutId);
      }
    };
  }, [label, scramble]);

  return displayText;
}

function normalizeCountBadgeValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

type CountBadgeTransition = {
  from: number;
  to: number;
  direction: 1 | -1;
  animate: boolean;
};

const AnimatedCountBadgeValue = memo(function AnimatedCountBadgeValue({
  value,
  animateOnChange,
}: {
  value: number;
  animateOnChange: boolean;
}) {
  const normalizedValue = normalizeCountBadgeValue(value);
  const [displayValue, setDisplayValue] = useState<number>(normalizedValue);
  const [transition, setTransition] = useState<CountBadgeTransition | null>(
    null,
  );
  const displayValueRef = useRef<number>(normalizedValue);
  const targetValueRef = useRef<number>(normalizedValue);
  const hasMountedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const stepTimeoutRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);

  const clearAnimationTimers = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (stepTimeoutRef.current !== null) {
      window.clearTimeout(stepTimeoutRef.current);
      stepTimeoutRef.current = null;
    }
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
  }, []);

  const runNextAnimationStep = useCallback(() => {
    const currentValue = displayValueRef.current;
    const targetValue = targetValueRef.current;
    if (currentValue === targetValue) {
      setTransition(null);
      return;
    }
    const direction: 1 | -1 = targetValue > currentValue ? 1 : -1;
    const nextValue = currentValue + direction;
    setTransition({
      from: currentValue,
      to: nextValue,
      direction,
      animate: false,
    });
    frameRef.current = window.requestAnimationFrame(() => {
      setTransition((currentTransition) => {
        if (!currentTransition) {
          return currentTransition;
        }
        return { ...currentTransition, animate: true };
      });
      frameRef.current = null;
    });
    stepTimeoutRef.current = window.setTimeout(() => {
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      setTransition(null);
      stepTimeoutRef.current = null;
      pauseTimeoutRef.current = window.setTimeout(() => {
        runNextAnimationStep();
      }, COUNT_BADGE_STEP_PAUSE_MS);
    }, COUNT_BADGE_STEP_ANIMATION_MS);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      displayValueRef.current = normalizedValue;
      setDisplayValue(normalizedValue);
      setTransition(null);
      hasMountedRef.current = true;
      return;
    }
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      displayValueRef.current = normalizedValue;
      setDisplayValue(normalizedValue);
      setTransition(null);
      return;
    }
    targetValueRef.current = normalizedValue;
    if (!animateOnChange) {
      clearAnimationTimers();
      displayValueRef.current = normalizedValue;
      setDisplayValue(normalizedValue);
      setTransition(null);
      return;
    }
    if (displayValueRef.current === normalizedValue) {
      return;
    }
    clearAnimationTimers();
    runNextAnimationStep();
  }, [
    animateOnChange,
    clearAnimationTimers,
    normalizedValue,
    runNextAnimationStep,
  ]);

  useEffect(() => {
    return () => {
      clearAnimationTimers();
    };
  }, [clearAnimationTimers]);

  if (!transition) {
    return (
      <span
        data-chat-count-badge-value="true"
        data-chat-count-badge-animating="false"
        className="inline-block min-w-[1ch] tabular-nums"
      >
        {displayValue}
      </span>
    );
  }

  let outgoingTransform = "translateY(0%)";
  let incomingTransform = "translateY(100%)";
  if (transition.direction === 1) {
    if (transition.animate) {
      outgoingTransform = "translateY(-100%)";
      incomingTransform = "translateY(0%)";
    }
  } else {
    incomingTransform = "translateY(-100%)";
    if (transition.animate) {
      outgoingTransform = "translateY(100%)";
      incomingTransform = "translateY(0%)";
    }
  }

  return (
    <span
      data-chat-count-badge-value="true"
      data-chat-count-badge-animating="true"
      className="relative inline-flex h-[1em] min-w-[1ch] overflow-hidden align-middle tabular-nums"
    >
      <span
        className="block"
        style={{
          transform: outgoingTransform,
          transition: `transform ${COUNT_BADGE_STEP_ANIMATION_MS}ms ease-out`,
        }}
      >
        {transition.from}
      </span>
      <span
        className="absolute left-0 top-0 block"
        style={{
          transform: incomingTransform,
          transition: `transform ${COUNT_BADGE_STEP_ANIMATION_MS}ms ease-out`,
        }}
      >
        {transition.to}
      </span>
    </span>
  );
});

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

type RunTimerStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type RunTimerSnapshot = {
  startMs: number | null;
  endMs: number | null;
  hasBeenActive: boolean;
};

const RUN_TIMER_STORAGE_KEY_PREFIX = "setta.chat.runTimer.v1";
const RUN_TIMER_MEMORY_FALLBACK = new Map<string, string>();
const RUN_TIMER_STORAGE_PROBE_KEY = `${RUN_TIMER_STORAGE_KEY_PREFIX}.__probe__`;
let cachedRunTimerStorageAdapter: RunTimerStorageAdapter | null | undefined;

function getRunTimerStorageAdapter(): RunTimerStorageAdapter | null {
  if (cachedRunTimerStorageAdapter !== undefined) {
    return cachedRunTimerStorageAdapter;
  }
  if (typeof window === "undefined") {
    cachedRunTimerStorageAdapter = {
      getItem: (key) => RUN_TIMER_MEMORY_FALLBACK.get(key) ?? null,
      setItem: (key, value) => {
        RUN_TIMER_MEMORY_FALLBACK.set(key, value);
      },
    };
    return cachedRunTimerStorageAdapter;
  }
  try {
    const storage = window.localStorage;
    storage.setItem(RUN_TIMER_STORAGE_PROBE_KEY, "1");
    storage.removeItem(RUN_TIMER_STORAGE_PROBE_KEY);
    cachedRunTimerStorageAdapter = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        storage.setItem(key, value);
      },
    };
    return cachedRunTimerStorageAdapter;
  } catch {
    cachedRunTimerStorageAdapter = {
      getItem: (key) => RUN_TIMER_MEMORY_FALLBACK.get(key) ?? null,
      setItem: (key, value) => {
        RUN_TIMER_MEMORY_FALLBACK.set(key, value);
      },
    };
    return cachedRunTimerStorageAdapter;
  }
}

function getRunTimerStorageKey(runKey: string): string {
  return `${RUN_TIMER_STORAGE_KEY_PREFIX}.${runKey}`;
}

function readRunTimerSnapshot(runKey: string): RunTimerSnapshot | null {
  const adapter = getRunTimerStorageAdapter();
  if (!adapter) {
    return null;
  }
  let raw: string | null = null;
  try {
    raw = adapter.getItem(getRunTimerStorageKey(runKey));
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RunTimerSnapshot>;
    const startMs =
      typeof parsed.startMs === "number" && Number.isFinite(parsed.startMs)
        ? parsed.startMs
        : null;
    const endMs =
      typeof parsed.endMs === "number" && Number.isFinite(parsed.endMs)
        ? parsed.endMs
        : null;
    const hasBeenActive = parsed.hasBeenActive === true;
    return { startMs, endMs, hasBeenActive };
  } catch {
    return null;
  }
}

function writeRunTimerSnapshot(
  runKey: string,
  snapshot: RunTimerSnapshot,
): void {
  const adapter = getRunTimerStorageAdapter();
  if (!adapter) {
    return;
  }
  try {
    adapter.setItem(getRunTimerStorageKey(runKey), JSON.stringify(snapshot));
  } catch {
    // Intentionally ignored: timer writes should never block UI updates.
  }
}

function useRunElapsedDuration({
  active,
  startedAtMs,
  completedAtMs,
  runKey,
}: {
  active: boolean;
  startedAtMs?: number | null;
  completedAtMs?: number | null;
  runKey?: string;
}): { elapsedSeconds: number; elapsedMs: number; hasKnownDuration: boolean } {
  const [, setTick] = useState(0);
  const localStartMsRef = useRef<number | null>(null);
  const finalizedEndMsRef = useRef<number | null>(null);
  const hasBeenActiveRef = useRef(false);
  const storageAvailableRef = useRef<boolean>(
    getRunTimerStorageAdapter() !== null,
  );

  const persistSnapshot = useCallback(() => {
    if (!storageAvailableRef.current || !runKey) {
      return;
    }
    writeRunTimerSnapshot(runKey, {
      startMs: localStartMsRef.current,
      endMs: finalizedEndMsRef.current,
      hasBeenActive: hasBeenActiveRef.current,
    });
  }, [runKey]);

  useEffect(() => {
    const nextRunKey = runKey ?? null;
    localStartMsRef.current = null;
    finalizedEndMsRef.current = null;
    hasBeenActiveRef.current = false;
    storageAvailableRef.current = getRunTimerStorageAdapter() !== null;
    if (storageAvailableRef.current && nextRunKey) {
      const persisted = readRunTimerSnapshot(nextRunKey);
      if (persisted) {
        localStartMsRef.current = persisted.startMs;
        finalizedEndMsRef.current = persisted.endMs;
        hasBeenActiveRef.current = persisted.hasBeenActive;
      }
    }
    setTick((current) => current + 1);
  }, [runKey]);

  useEffect(() => {
    if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
      return;
    }
    if (
      localStartMsRef.current === null ||
      startedAtMs < localStartMsRef.current
    ) {
      localStartMsRef.current = startedAtMs;
      persistSnapshot();
      setTick((current) => current + 1);
    }
  }, [persistSnapshot, startedAtMs]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    hasBeenActiveRef.current = true;
    if (localStartMsRef.current === null) {
      localStartMsRef.current =
        typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
          ? startedAtMs
          : Date.now();
    }
    finalizedEndMsRef.current = null;
    persistSnapshot();
    setTick((current) => current + 1);
    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, persistSnapshot, startedAtMs]);

  useEffect(() => {
    if (active) {
      return;
    }
    const normalizedCompletedAtMs =
      typeof completedAtMs === "number" && Number.isFinite(completedAtMs)
        ? completedAtMs
        : null;
    if (normalizedCompletedAtMs !== null) {
      finalizedEndMsRef.current = normalizedCompletedAtMs;
      persistSnapshot();
      setTick((current) => current + 1);
      return;
    }
    if (hasBeenActiveRef.current && finalizedEndMsRef.current === null) {
      finalizedEndMsRef.current = Date.now();
      persistSnapshot();
      setTick((current) => current + 1);
    }
  }, [active, completedAtMs, persistSnapshot]);

  if (!runKey) {
    return { elapsedSeconds: 0, elapsedMs: 0, hasKnownDuration: false };
  }

  const normalizedStartedAtMs =
    typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
      ? startedAtMs
      : null;
  const startMs =
    normalizedStartedAtMs ??
    localStartMsRef.current ??
    (active ? Date.now() : null);
  if (startMs === null) {
    return { elapsedSeconds: 0, elapsedMs: 0, hasKnownDuration: false };
  }
  if (active) {
    const elapsedMs = Math.max(0, Date.now() - startMs);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    return {
      elapsedSeconds: Math.max(0, elapsedSeconds),
      elapsedMs,
      hasKnownDuration: true,
    };
  }
  const normalizedCompletedAtMs =
    typeof completedAtMs === "number" && Number.isFinite(completedAtMs)
      ? completedAtMs
      : null;
  const endMs = normalizedCompletedAtMs ?? finalizedEndMsRef.current;
  if (endMs === null) {
    if (!hasBeenActiveRef.current) {
      return { elapsedSeconds: 0, elapsedMs: 0, hasKnownDuration: false };
    }
    return { elapsedSeconds: 0, elapsedMs: 0, hasKnownDuration: true };
  }
  const elapsedMs = Math.max(0, endMs - startMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return {
    elapsedSeconds: Math.max(0, elapsedSeconds),
    elapsedMs,
    hasKnownDuration: true,
  };
}

const ThinkingBox = memo(function ThinkingBox({
  activityKey,
  content,
  summary,
  timestampMs,
  isStreaming,
  wasInterrupted,
  runKey,
  railIcon,
  activityHint,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  suppressCollapsedSummary = false,
  conversationSearchTerms = [],
  onExpansionChange,
}: {
  activityKey: string;
  content: string;
  summary: string | null | undefined;
  timestampMs: number | null;
  isStreaming: boolean;
  wasInterrupted: boolean;
  runKey: string;
  railIcon?: ReactNode;
  activityHint?: string | null;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  suppressCollapsedSummary?: boolean;
  conversationSearchTerms?: Array<string>;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const streaming = isStreaming;
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHasAdditionalLines = /\r?\n/u.test(summaryText);
  const resolvedSummaryHeadlineText = resolveThinkingSummaryHeadline({
    content,
    summary,
    isStreaming: streaming,
  });
  const summaryHeadlineText = suppressCollapsedSummary
    ? resolveCollapsedThinkingActivityLabel({
        isStreaming: streaming,
      })
    : resolvedSummaryHeadlineText;
  const collapsedSummaryText = summaryHeadlineText;
  const collapsedSummaryWithHint =
    activityHint && !hasThinkingText
      ? `${collapsedSummaryText} - ${activityHint}`
      : collapsedSummaryText;
  const shouldRenderPlainSummaryWithHint = Boolean(
    !suppressCollapsedSummary && activityHint && !hasThinkingText,
  );
  const shouldMeasureSummaryOverflow =
    !suppressCollapsedSummary &&
    !hasThinkingText &&
    collapsedSummaryText.length > 0;
  const [isSummaryTitleTruncated, setIsSummaryTitleTruncated] = useState(false);
  const hasExpandableContent =
    hasThinkingText ||
    isSummaryTitleTruncated ||
    (!hasThinkingText && summaryHasAdditionalLines);
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    () =>
      hasExpandableContent && defaultOpen
        ? ACTIVITY_ROW_DETAILS_VALUE
        : undefined,
  );
  const lastExpandAllSignalRef = useRef(expandAllSignal);
  const lastCollapseAllSignalRef = useRef(collapseAllSignal);
  const expandedContent = hasThinkingText ? content : summaryText;
  const isExpanded =
    hasExpandableContent && accordionValue === ACTIVITY_ROW_DETAILS_VALUE;
  const thinkingRunState: ToolCallSectionState = streaming
    ? "running"
    : wasInterrupted
      ? "stopped"
      : "complete";
  const thinkingRowRunState: ToolCallRunState =
    thinkingRunState === "running"
      ? "running"
      : thinkingRunState === "stopped"
        ? "stopped"
        : "success";
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: streaming,
      runKey,
    },
  );
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: thinkingRunState === "running",
  });
  useEffect(() => {
    if (!hasExpandableContent) {
      setAccordionValue(undefined);
      lastExpandAllSignalRef.current = expandAllSignal;
      lastCollapseAllSignalRef.current = collapseAllSignal;
      return;
    }
    if (collapseAllSignal !== lastCollapseAllSignalRef.current) {
      lastCollapseAllSignalRef.current = collapseAllSignal;
      if (collapseAllSignal > 0) {
        setAccordionValue(undefined);
      }
    }
    if (expandAllSignal !== lastExpandAllSignalRef.current) {
      lastExpandAllSignalRef.current = expandAllSignal;
      if (expandAllSignal > 0) {
        setAccordionValue(ACTIVITY_ROW_DETAILS_VALUE);
      }
    }
  }, [collapseAllSignal, expandAllSignal, hasExpandableContent]);

  useEffect(() => {
    if (!shouldMeasureSummaryOverflow) {
      setIsSummaryTitleTruncated(false);
      return;
    }
    const measure = () => {
      const element = summaryPreviewRef.current;
      if (!element) {
        setIsSummaryTitleTruncated(false);
        return;
      }
      const verticallyTruncated =
        element.scrollHeight > element.clientHeight + 1;
      const horizontallyTruncated =
        element.scrollWidth > element.clientWidth + 1;
      const truncated = verticallyTruncated || horizontallyTruncated;
      setIsSummaryTitleTruncated((prev) =>
        prev === truncated ? prev : truncated,
      );
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && summaryPreviewRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(summaryPreviewRef.current);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [activityHint, shouldMeasureSummaryOverflow, summaryHeadlineText]);

  useEffect(() => {
    onExpansionChange?.(activityKey, isExpanded);
  }, [activityKey, isExpanded, onExpansionChange]);

  const triggerClassName = `grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} max-w-full overflow-hidden text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent ? "cursor-pointer" : "cursor-default"
  }`;

  return (
    <Accordion.Root
      type="single"
      collapsible
      className="w-full"
      value={accordionValue}
      onValueChange={(nextValue) => {
        setAccordionValue(
          nextValue === ACTIVITY_ROW_DETAILS_VALUE
            ? ACTIVITY_ROW_DETAILS_VALUE
            : undefined,
        );
      }}
    >
      <Accordion.Item
        value={ACTIVITY_ROW_DETAILS_VALUE}
        className="group/chat-activity-row w-full overflow-hidden border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-thinking-section="true"
      >
        <div className="relative flex w-full items-stretch">
          <Accordion.Trigger
            disabled={!hasExpandableContent}
            data-chat-thinking-trigger="true"
            data-chat-thinking-expandable={
              hasExpandableContent ? "true" : "false"
            }
            className={`${triggerClassName} min-w-0 flex-1`}
          >
            <div
              className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
              data-chat-thinking-item-rail-state={thinkingRowRunState}
              title={`Thought state: ${thinkingRowRunState}`}
              aria-label={`Thought state: ${thinkingRowRunState}`}
            >
              {railIcon ?? <FaBrain size={13} className="min-w-4" />}
            </div>
            <div className="flex min-w-0 items-start gap-2 py-1 pl-2 pr-2">
              <div
                data-chat-activity-item-label="true"
                className={ACTIVITY_ITEM_LABEL_CLASS}
              >
                <div
                  ref={summaryPreviewRef}
                  className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200 [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80 [&_p]:m-0 [&_p]:inline"
                >
                  {shouldRenderPlainSummaryWithHint ? (
                    <span>
                      {renderConversationSearchHighlightedText(
                        collapsedSummaryWithHint,
                        conversationSearchTerms,
                      )}
                    </span>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={getConversationSearchRehypePlugins(
                        conversationSearchTerms,
                      )}
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        a: ({ children }) => <span>{children}</span>,
                      }}
                    >
                      {summaryHeadlineText}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
              <div className="ml-auto inline-flex shrink-0 items-center gap-1 self-center">
                {hasExpandableContent ? (
                  <MdKeyboardArrowDown
                    data-chat-thinking-chevron="true"
                    className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  />
                ) : null}
              </div>
            </div>
          </Accordion.Trigger>
          <div
            data-chat-activity-item-hover-meta="true"
            className={ACTIVITY_ITEM_HOVER_META_CLASS}
          >
            {onCopy ? (
              <button
                type="button"
                aria-label="Copy activity item"
                data-chat-activity-item-copy-button="true"
                data-chat-activity-item-copy-kind="thought"
                className={ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopy();
                }}
              >
                <FiCopy />
              </button>
            ) : null}
            <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />
            {thinkingRunState === "complete" ? (
              durationLabel ? (
                <span
                  data-chat-thinking-status="true"
                  className="inline-flex items-center gap-1 text-setta-500 dark:text-setta-300"
                >
                  <span
                    data-chat-thinking-timer="true"
                    className="font-mono text-[10px] text-setta-400 dark:text-setta-400/90"
                  >
                    {durationLabel}
                  </span>
                </span>
              ) : null
            ) : thinkingRunState === "stopped" ? (
              <span
                data-chat-thinking-status="true"
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300"
              >
                <MdErrorOutline className="text-[11px]" />
                Stopped
                {durationLabel ? (
                  <span
                    data-chat-thinking-timer="true"
                    className="font-mono text-[10px] normal-case tracking-normal text-amber-700 dark:text-amber-200"
                  >
                    {durationLabel}
                  </span>
                ) : null}
              </span>
            ) : (
              <span
                data-chat-thinking-status="true"
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-500 dark:text-setta-300"
              >
                <BrailleSpinner
                  className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
                />
                Working
                {durationLabel ? (
                  <span
                    data-chat-thinking-timer="true"
                    className="font-mono text-[10px] normal-case tracking-normal text-setta-400 dark:text-setta-400/90"
                  >
                    {durationLabel}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>
        {hasExpandableContent ? (
          <Accordion.Content
            className={ACTIVITY_ACCORDION_CONTENT_CLASS}
            data-chat-thinking-content="true"
          >
            {hasThinkingText ? (
              <div className="px-2 py-1">
                <MarkdownContent
                  content={expandedContent}
                  className={ASSISTANT_MARKDOWN_CLASS}
                  role={ChatRoleEnum.assistant}
                  isStreaming={isStreaming}
                  highlightTerms={conversationSearchTerms}
                />
              </div>
            ) : (
              <div
                data-chat-thinking-summary-expanded="true"
                className="px-2 py-1"
              >
                <MarkdownContent
                  content={expandedContent}
                  className={ASSISTANT_MARKDOWN_CLASS}
                  role={ChatRoleEnum.assistant}
                  isStreaming={false}
                  highlightTerms={conversationSearchTerms}
                />
              </div>
            )}
          </Accordion.Content>
        ) : null}
      </Accordion.Item>
    </Accordion.Root>
  );
});

function resolveThinkingSectionState({
  isStreaming,
  wasInterrupted,
}: {
  isStreaming: boolean;
  wasInterrupted: boolean;
}): ToolCallSectionState {
  if (isStreaming) {
    return "running";
  }
  if (wasInterrupted) {
    return "stopped";
  }
  return "complete";
}

function thinkingItemHasExpandableDetail(item: ThinkingContentItem): boolean {
  if (item.thinking.trim().length > 0) {
    return true;
  }
  const summaryText = item.summary?.trim() ?? "";
  return /\r?\n/u.test(summaryText);
}

const ThinkingSection = memo(function ThinkingSection({
  children,
  thoughtCount,
  latestSummary,
  sectionState,
  runKey,
  hasExpandableDetails,
  conversationSearchTerms = [],
}: {
  children: ReactNode;
  thoughtCount: number;
  latestSummary: string;
  sectionState: ToolCallSectionState;
  runKey: string;
  hasExpandableDetails: boolean;
  conversationSearchTerms?: Array<string>;
}) {
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const [isSummaryTitleTruncated, setIsSummaryTitleTruncated] = useState(false);
  const shouldMeasureSummaryOverflow =
    thoughtCount <= 1 &&
    !hasExpandableDetails &&
    latestSummary.trim().length > 0;
  const hasExpandableContent =
    thoughtCount > 1 || hasExpandableDetails || isSummaryTitleTruncated;
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: sectionState === "running",
      runKey,
    },
  );

  useEffect(() => {
    if (!shouldMeasureSummaryOverflow) {
      setIsSummaryTitleTruncated(false);
      return;
    }
    const measure = () => {
      const element = summaryPreviewRef.current;
      if (!element) {
        setIsSummaryTitleTruncated(false);
        return;
      }
      const verticallyTruncated =
        element.scrollHeight > element.clientHeight + 1;
      const horizontallyTruncated =
        element.scrollWidth > element.clientWidth + 1;
      const truncated = verticallyTruncated || horizontallyTruncated;
      setIsSummaryTitleTruncated((prev) =>
        prev === truncated ? prev : truncated,
      );
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && summaryPreviewRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(summaryPreviewRef.current);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [latestSummary, shouldMeasureSummaryOverflow]);

  const triggerClassName = `group grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent ? "cursor-pointer" : "cursor-default"
  }`;

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="thinking-list-details"
        className={TOOL_SECTION_CARD_CLASS}
        data-chat-thinking-section="true"
        data-chat-thinking-list-section="true"
      >
        <Accordion.Trigger
          disabled={!hasExpandableContent}
          className={triggerClassName}
          data-chat-thinking-list-trigger="true"
          data-chat-thinking-list-expandable={
            hasExpandableContent ? "true" : "false"
          }
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-thinking-list-rail="true"
          >
            <FaBrain size={13} className="min-w-4" />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200">
                  Thoughts
                </span>
                <span
                  data-chat-thinking-list-count-badge="true"
                  className={ACTIVITY_COUNT_BADGE_CLASS}
                  title={`${thoughtCount} thought sections`}
                >
                  <AnimatedCountBadgeValue
                    value={thoughtCount}
                    animateOnChange={sectionState === "running"}
                  />
                </span>
              </div>
              <div
                data-chat-thinking-list-latest-summary="true"
                ref={summaryPreviewRef}
                className="truncate text-[10px] text-setta-400 dark:text-setta-400/90 [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80 [&_p]:m-0 [&_p]:inline"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={getConversationSearchRehypePlugins(
                    conversationSearchTerms,
                  )}
                  components={{
                    p: ({ children }) => <span>{children}</span>,
                    a: ({ children }) => <span>{children}</span>,
                  }}
                >
                  {latestSummary}
                </ReactMarkdown>
              </div>
            </div>
            <div className="ml-auto inline-flex shrink-0 items-center gap-1 self-center">
              <ToolCallSectionStatus
                sectionState={sectionState}
                elapsedSeconds={elapsedSeconds}
                elapsedMs={elapsedMs}
                hasKnownDuration={hasKnownDuration}
                includeThinkingDataAttrs
                hideCompleteIcon
              />
              {hasExpandableContent ? (
                <MdKeyboardArrowDown
                  data-chat-thinking-list-chevron="true"
                  className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                />
              ) : null}
            </div>
          </div>
        </Accordion.Trigger>
        {hasExpandableContent ? (
          <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=open]:block data-[state=closed]:hidden dark:border-setta-700/70">
            <div className="flex w-full flex-col">{children}</div>
          </Accordion.Content>
        ) : null}
      </Accordion.Item>
    </Accordion.Root>
  );
});

const AssistantThinkingSection = memo(function AssistantThinkingSection({
  entries,
  runKey,
  conversationSearchTerms = [],
}: {
  entries: ThinkingRenderEntry[];
  runKey: string;
  conversationSearchTerms?: Array<string>;
}) {
  const thinkingItems = entries.map(({ item }) => item);
  const isStreaming = entries.some(
    ({ isStreaming: entryIsStreaming }) => entryIsStreaming,
  );
  const wasInterrupted =
    !isStreaming &&
    entries.some(
      ({ wasInterrupted: entryWasInterrupted }) => entryWasInterrupted,
    );
  const sectionState = resolveThinkingSectionState({
    isStreaming,
    wasInterrupted,
  });
  const latestSummary = resolveLatestThinkingSummary(
    thinkingItems,
    isStreaming,
  );
  const hasExpandableDetails = thinkingItems.some(
    thinkingItemHasExpandableDetail,
  );
  return (
    <ThinkingSection
      thoughtCount={entries.length}
      latestSummary={latestSummary}
      sectionState={sectionState}
      runKey={runKey}
      hasExpandableDetails={hasExpandableDetails}
      conversationSearchTerms={conversationSearchTerms}
    >
      {entries.map((entry) => (
        <ThinkingBox
          key={`${entry.messageId}-thinking-${entry.itemIndex}`}
          content={entry.item.thinking}
          summary={entry.item.summary}
          timestampMs={entry.timestampMs}
          isStreaming={entry.isStreaming}
          wasInterrupted={entry.wasInterrupted}
          runKey={`${entry.messageId}-thinking-${entry.itemIndex}`}
          conversationSearchTerms={conversationSearchTerms}
        />
      ))}
    </ThinkingSection>
  );
});

const ActivityThoughtPreview = memo(function ActivityThoughtPreview({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(false);
  const previousTextRef = useRef(text);
  const pinnedBottomTextRef = useRef<string | null>(null);
  const animatedScrollTopRef = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      setHasOverflow(false);
      setIsPinnedToBottom(false);
      return;
    }
    const measure = () => {
      const current = scrollRef.current;
      if (!current) {
        setHasOverflow(false);
        return;
      }
      const maxScrollTop = Math.max(
        0,
        current.scrollHeight - current.clientHeight,
      );
      const nextHasOverflow = maxScrollTop > 1 && text.trim().length > 0;
      if (nextHasOverflow && pinnedBottomTextRef.current === text) {
        animatedScrollTopRef.current = maxScrollTop;
        current.scrollTop = maxScrollTop;
        setIsPinnedToBottom(true);
      } else if (!nextHasOverflow) {
        animatedScrollTopRef.current = 0;
        current.scrollTop = 0;
        pinnedBottomTextRef.current = null;
        setIsPinnedToBottom(false);
      }
      setHasOverflow((prev) =>
        prev === nextHasOverflow ? prev : nextHasOverflow,
      );
    };
    measure();
    const frameId = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(element);
    }
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [text]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const previousText = previousTextRef.current;
    const textWasReplaced =
      previousText.length > 0 &&
      (text.length < previousText.length || !text.startsWith(previousText));
    previousTextRef.current = text;
    if (textWasReplaced) {
      pinnedBottomTextRef.current = null;
      animatedScrollTopRef.current = 0;
      element.scrollTop = 0;
      setIsPinnedToBottom(false);
    }
    if (!hasOverflow) {
      animatedScrollTopRef.current = 0;
      element.scrollTop = 0;
      pinnedBottomTextRef.current = null;
      setIsPinnedToBottom(false);
      return;
    }
    const maxScrollTop = Math.max(
      0,
      element.scrollHeight - element.clientHeight,
    );
    if (maxScrollTop <= 0) {
      animatedScrollTopRef.current = 0;
      element.scrollTop = 0;
      pinnedBottomTextRef.current = null;
      setIsPinnedToBottom(false);
      return;
    }
    if (!animate) {
      animatedScrollTopRef.current = maxScrollTop;
      element.scrollTop = maxScrollTop;
      pinnedBottomTextRef.current = text;
      setIsPinnedToBottom(true);
      return;
    }
    if (pinnedBottomTextRef.current === text) {
      animatedScrollTopRef.current = maxScrollTop;
      element.scrollTop = maxScrollTop;
      setIsPinnedToBottom(true);
      return;
    }
    setIsPinnedToBottom(false);
    animatedScrollTopRef.current = Math.min(
      maxScrollTop,
      Math.max(animatedScrollTopRef.current, element.scrollTop),
    );
    let frameId = 0;
    const initialTimestamp = window.performance.now();
    const startScrollTop = animatedScrollTopRef.current;
    const distanceToBottomPx = Math.max(0, maxScrollTop - startScrollTop);
    const durationMs = Math.min(720, Math.max(180, distanceToBottomPx * 7));
    const stepAnimation = (timestamp: number) => {
      const current = scrollRef.current;
      if (!current) {
        return;
      }
      const maxScrollTop = Math.max(
        0,
        current.scrollHeight - current.clientHeight,
      );
      if (maxScrollTop <= 0) {
        animatedScrollTopRef.current = 0;
        current.scrollTop = 0;
        pinnedBottomTextRef.current = null;
        setIsPinnedToBottom(false);
        return;
      }
      if (pinnedBottomTextRef.current === text) {
        animatedScrollTopRef.current = maxScrollTop;
        current.scrollTop = maxScrollTop;
        setIsPinnedToBottom(true);
        return;
      }
      const progress = Math.min(
        1,
        Math.max(0, (timestamp - initialTimestamp) / durationMs),
      );
      const nextScrollTop = startScrollTop + distanceToBottomPx * progress;
      if (progress >= 1 || nextScrollTop >= maxScrollTop) {
        animatedScrollTopRef.current = maxScrollTop;
        current.scrollTop = maxScrollTop;
        pinnedBottomTextRef.current = text;
        setIsPinnedToBottom(true);
        return;
      }
      animatedScrollTopRef.current = nextScrollTop;
      current.scrollTop = nextScrollTop;
      frameId = window.requestAnimationFrame(stepAnimation);
    };
    frameId = window.requestAnimationFrame(stepAnimation);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [animate, hasOverflow, text]);

  const thoughtPreviewMaskStyle = !hasOverflow
    ? {
        WebkitMaskImage: "none",
        maskImage: "none",
      }
    : {
        WebkitMaskImage: ACTIVITY_THOUGHT_TOP_ONLY_MASK,
        maskImage: ACTIVITY_THOUGHT_TOP_ONLY_MASK,
      };

  return (
    <div
      ref={scrollRef}
      data-chat-assistant-activity-thought-scroll="true"
      data-chat-assistant-activity-thought-scroll-enabled={
        animate && hasOverflow ? "true" : "false"
      }
      data-chat-assistant-activity-thought-at-bottom={
        hasOverflow && isPinnedToBottom ? "true" : "false"
      }
      className="top-bottom-fade h-9 overflow-y-auto break-words pb-1.5 pr-1 pt-0.5 text-[10px] leading-[1.4] text-setta-400 dark:text-setta-400/90"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        ...thoughtPreviewMaskStyle,
      }}
    >
      <ThoughtPreviewMarkdown text={text} animate={animate} />
    </div>
  );
});

const AssistantActivitySection = memo(function AssistantActivitySection({
  preview,
  itemCount,
  sectionState,
  startedAtMs,
  completedAtMs,
  runKey,
  suppressThoughtScrollAnimation = false,
  defaultOpen = false,
  defaultChildrenOpen = false,
  conversationSearchTerms = [],
  children,
}: {
  preview: ActivityPreviewData;
  itemCount: number;
  sectionState: ToolCallSectionState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  suppressThoughtScrollAnimation?: boolean;
  defaultOpen?: boolean;
  defaultChildrenOpen?: boolean;
  conversationSearchTerms?: Array<string>;
  children: (
    showItemCopyButtons: boolean,
    childAccordionControl: AssistantActivityChildAccordionControl,
  ) => ReactNode;
}) {
  const scrambledLabel = useScrambledLabel({
    label: preview.label,
    scramble: preview.shouldScrambleTitle,
  });
  const displayLabel = preview.shouldScrambleTitle
    ? scrambledLabel
    : preview.label;
  const showThoughtScroll =
    preview.thoughtText !== null && preview.thoughtText.trim().length > 0;
  const shouldAnimateThoughtScroll =
    showThoughtScroll &&
    preview.hasStreamingThought &&
    !suppressThoughtScrollAnimation;
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: sectionState === "running",
      startedAtMs,
      completedAtMs,
      runKey,
    },
  );
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: sectionState === "running",
  });
  const durationClassName =
    sectionState === "stopped"
      ? "font-mono text-[10px] text-amber-700 dark:text-amber-200"
      : "font-mono text-[10px] text-setta-400 dark:text-setta-400/90";
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    () => (defaultOpen ? ASSISTANT_ACTIVITY_DETAILS_VALUE : undefined),
  );
  const [openAllSignal, setOpenAllSignal] = useState(0);
  const [closeAllSignal, setCloseAllSignal] = useState(0);
  const [allChildrenExpanded, setAllChildrenExpanded] =
    useState(defaultChildrenOpen);
  const isExpanded = accordionValue === ASSISTANT_ACTIVITY_DETAILS_VALUE;
  const suppressSummaries = isExpanded && allChildrenExpanded;
  const [previewThoughtExpanded, setPreviewThoughtExpanded] = useState(
    () => defaultChildrenOpen && preview.thoughtActivityKey !== null,
  );
  const openAllButtonLabel = allChildrenExpanded ? "Close all" : "Open all";
  const openAllButtonTitle = allChildrenExpanded
    ? "Close all activity details"
    : "Open all activity details";
  const handleActivityTriggerClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          '[data-chat-assistant-activity-open-all-button="true"]',
        ) !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setAccordionValue((prev) =>
        prev === ASSISTANT_ACTIVITY_DETAILS_VALUE
          ? undefined
          : ASSISTANT_ACTIVITY_DETAILS_VALUE,
      );
    },
    [],
  );
  const handleOpenAllPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleActivityTriggerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleActivityTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.currentTarget.click();
    },
    [],
  );
  useEffect(() => {
    setAllChildrenExpanded(defaultChildrenOpen);
  }, [defaultChildrenOpen]);
  useEffect(() => {
    setPreviewThoughtExpanded(
      defaultChildrenOpen && preview.thoughtActivityKey !== null,
    );
  }, [defaultChildrenOpen, preview.thoughtActivityKey]);
  const handlePreviewThoughtExpansionChange = useCallback(
    (activityKey: string, nextExpanded: boolean) => {
      if (!nextExpanded) {
        setAllChildrenExpanded(false);
      }
      if (activityKey !== preview.thoughtActivityKey) {
        return;
      }
      setPreviewThoughtExpanded((previous) =>
        previous === nextExpanded ? previous : nextExpanded,
      );
    },
    [preview.thoughtActivityKey],
  );
  const hideThoughtPreview = isExpanded && previewThoughtExpanded;
  const previewShellClassName = hideThoughtPreview
    ? "max-h-0 opacity-0"
    : "max-h-12 opacity-100";
  const activityTitleLabel =
    suppressSummaries && preview.kind === "thought"
      ? preview.hasStreamingThought
        ? "Thinking"
        : "Reasoning"
      : displayLabel;
  const activityPrimaryLabel =
    preview.kind === "thought"
      ? preview.hasStreamingThought
        ? "Thinking"
        : itemCount > 1
          ? "Thoughts"
          : "Reasoning"
      : activityTitleLabel;
  const showActivityPreviewLabel =
    preview.kind === "thought" &&
    activityTitleLabel.trim().length > 0 &&
    activityTitleLabel !== activityPrimaryLabel;
  return (
    <Accordion.Root
      type="single"
      collapsible
      className="w-full"
      value={accordionValue}
      onValueChange={(nextValue) => {
        setAccordionValue(
          nextValue === ASSISTANT_ACTIVITY_DETAILS_VALUE
            ? ASSISTANT_ACTIVITY_DETAILS_VALUE
            : undefined,
        );
      }}
    >
      <Accordion.Item
        value={ASSISTANT_ACTIVITY_DETAILS_VALUE}
        className={ASSISTANT_ACTIVITY_PARENT_CLASS}
        data-chat-assistant-activity-section="true"
      >
        <div
          className={ASSISTANT_ACTIVITY_TRIGGER_CLASS}
          data-chat-assistant-activity-trigger="true"
          data-state={isExpanded ? "open" : "closed"}
          aria-expanded={isExpanded}
          role="button"
          tabIndex={0}
          onPointerDown={handleActivityTriggerPointerDown}
          onKeyDown={handleActivityTriggerKeyDown}
          onClick={handleActivityTriggerClick}
        >
          <div className="w-full @container">
            <div
              data-chat-assistant-activity-header-row="true"
              className="flex w-full min-w-0 flex-col gap-1.5"
            >
              <div
                data-chat-assistant-activity-header-top-row="true"
                className="relative flex min-h-6 w-full min-w-0 items-center gap-2"
              >
                <div
                  data-chat-assistant-activity-label="true"
                  className={ACTIVITY_PARENT_LABEL_CLASS}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-400 dark:text-setta-500">
                      <span
                        data-chat-assistant-activity-icon="robot"
                        className="inline-flex items-center justify-center text-[12px]"
                        title="Project AI activity"
                        aria-label="Project AI activity"
                      >
                        <MdOutlineSmartToy size={13} aria-hidden />
                        <span className="sr-only">Activity</span>
                      </span>
                      <span
                        data-chat-assistant-activity-count-badge="true"
                        className={ACTIVITY_COUNT_BADGE_CLASS}
                        title={`${itemCount} activity items`}
                      >
                        <AnimatedCountBadgeValue
                          value={itemCount}
                          animateOnChange={sectionState === "running"}
                        />
                      </span>
                    </span>
                    <div
                      data-chat-assistant-activity-primary-label="true"
                      className="min-w-0 truncate text-[11px] text-setta-300 dark:text-setta-200"
                    >
                      {renderConversationSearchHighlightedText(
                        activityPrimaryLabel,
                        conversationSearchTerms,
                      )}
                    </div>
                  </div>
                </div>
                <div
                  data-chat-assistant-activity-hover-meta="true"
                  className={ACTIVITY_PARENT_HOVER_META_CLASS}
                >
                  <button
                    type="button"
                    onPointerDown={handleOpenAllPointerDown}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (allChildrenExpanded) {
                        setCloseAllSignal((prev) => prev + 1);
                        setAllChildrenExpanded(false);
                        return;
                      }
                      setAccordionValue(ASSISTANT_ACTIVITY_DETAILS_VALUE);
                      setOpenAllSignal((prev) => prev + 1);
                      setAllChildrenExpanded(true);
                    }}
                    className="pointer-events-none inline-flex h-5 cursor-pointer items-center rounded border border-setta-300/80 bg-setta-100/85 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-600 opacity-0 transition-colors transition-opacity hover:bg-setta-200/90 focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 dark:border-setta-600/80 dark:bg-setta-800/90 dark:text-setta-200 dark:hover:bg-setta-700"
                    data-chat-assistant-activity-open-all-button="true"
                    title={openAllButtonTitle}
                  >
                    {openAllButtonLabel}
                  </button>
                  {durationLabel ? (
                    <span
                      data-chat-assistant-activity-total-timer="true"
                      data-chat-assistant-activity-total-state={sectionState}
                      className={durationClassName}
                    >
                      {durationLabel}
                    </span>
                  ) : null}
                </div>
                <div className="ml-auto inline-flex shrink-0 self-center">
                  <MdKeyboardArrowDown
                    data-chat-assistant-activity-chevron="true"
                    className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  />
                </div>
              </div>
              {showActivityPreviewLabel ? (
                <div
                  data-chat-assistant-activity-preview-row="true"
                  className="h-9 min-w-0 overflow-hidden pl-[2.35rem] pr-6 pt-0.5 text-[11px] text-setta-500 dark:text-setta-300"
                >
                  <div
                    data-chat-assistant-activity-latest="true"
                    data-chat-assistant-activity-latest-scrambling={
                      preview.shouldScrambleTitle ? "true" : "false"
                    }
                    className="min-w-0 overflow-hidden leading-[1.35] [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80 [&_p]:m-0"
                  >
                    {preview.shouldScrambleTitle ? (
                      renderConversationSearchHighlightedText(
                        activityTitleLabel,
                        conversationSearchTerms,
                      )
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={getConversationSearchRehypePlugins(
                          conversationSearchTerms,
                        )}
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                          a: ({ children }) => <span>{children}</span>,
                        }}
                      >
                        {activityTitleLabel}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {showThoughtScroll ? (
            <div
              data-chat-assistant-activity-thought-preview-shell="true"
              data-chat-assistant-activity-thought-preview-visible={
                hideThoughtPreview ? "false" : "true"
              }
              aria-hidden={hideThoughtPreview}
              className={`w-full overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${previewShellClassName}`}
            >
              <ActivityThoughtPreview
                text={preview.thoughtText ?? ""}
                animate={shouldAnimateThoughtScroll}
              />
            </div>
          ) : null}
        </div>
        <Accordion.Content
          forceMount
          data-chat-assistant-activity-content="true"
          className={ASSISTANT_ACTIVITY_CONTENT_CLASS}
        >
          <div className="flex w-full flex-col border border-setta-200/70 dark:border-setta-700/70">
            {children(isExpanded, {
              defaultOpen: defaultChildrenOpen,
              expandAllSignal: openAllSignal,
              collapseAllSignal: closeAllSignal,
              suppressSummaries,
              onThinkingOpenStateChange: handlePreviewThoughtExpansionChange,
            })}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const ContextCompactionSection = memo(function ContextCompactionSection({
  entries,
  toolResultsById,
  toolCallArguments,
}: {
  entries: ToolCallRenderEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}) {
  const summaryText = resolveCompactionSummaryText(
    entries,
    toolResultsById,
    toolCallArguments,
  );
  const compactionStates = entries.map(({ toolCall, isStreaming }) =>
    resolveToolCallRunState(
      toolResultsById[toolCall.id]
        ? !toolResultsById[toolCall.id].is_error
        : undefined,
      isStreaming,
    ),
  );
  const sectionState = resolveToolCallSectionState(compactionStates);
  const { startedAtMs, completedAtMs } = resolveToolSectionTimingAnchors(
    entries,
    toolResultsById,
  );
  const runKey = entries.map((entry) => entry.toolCall.id).join("|");
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: sectionState === "running",
      startedAtMs,
      completedAtMs,
      runKey,
    },
  );
  const isStreaming = sectionState === "running";
  const title = isStreaming ? "Compacting context" : "Context compacted";
  const previewText =
    summaryText ||
    (isStreaming
      ? "Building compact context summary..."
      : "Compaction completed.");
  const displayText = previewText.trim();

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="compaction-details"
        className={TOOL_SECTION_CARD_CLASS}
        data-chat-context-compaction-section="true"
      >
        <Accordion.Trigger className={TOOL_SECTION_TRIGGER_CLASS}>
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
          >
            <FiArchive className="min-w-4" size={14} />
          </div>
          <div className="flex min-w-0 flex-col gap-0 px-2 py-1">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{title}</span>
                <span
                  data-chat-context-compaction-count-badge="true"
                  className={ACTIVITY_COUNT_BADGE_CLASS}
                >
                  <AnimatedCountBadgeValue
                    value={entries.length}
                    animateOnChange={sectionState === "running"}
                  />
                </span>
              </span>
              <div className="ml-auto inline-flex shrink-0 items-center gap-1 self-center">
                <ToolCallSectionStatus
                  sectionState={sectionState}
                  elapsedSeconds={elapsedSeconds}
                  elapsedMs={elapsedMs}
                  hasKnownDuration={hasKnownDuration}
                  runningLabel="Working"
                  stoppedLabel="Stopped"
                />
                <MdKeyboardArrowDown
                  data-chat-context-compaction-chevron="true"
                  className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                />
              </div>
            </div>
            <div
              className="top-bottom-fade h-11 overflow-y-auto break-words text-[11px] text-setta-400 dark:text-setta-500"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {displayText}
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=open]:block data-[state=closed]:hidden dark:border-setta-700/70">
          <div className="px-2 py-1">
            <MarkdownContent
              content={displayText}
              className={ASSISTANT_MARKDOWN_CLASS}
              role={ChatRoleEnum.assistant}
              isStreaming={isStreaming}
            />
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function ToolCallAccordionStatus({ runState }: { runState: ToolCallRunState }) {
  if (runState === "success") {
    return (
      <IoMdCheckmark className="text-[12px] text-setta-400 dark:text-setta-300" />
    );
  }
  if (runState === "failed") {
    return (
      <MdErrorOutline className="text-[11px] text-red-500 dark:text-red-400" />
    );
  }
  if (runState === "stopped") {
    return (
      <MdErrorOutline className="text-[11px] text-amber-600 dark:text-amber-300" />
    );
  }
  return (
    <BrailleSpinner
      className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
    />
  );
}

type ActivityToolLikeMeta = {
  itemAttr: Record<string, string>;
  triggerAttr: Record<string, string>;
  railAttr: Record<string, string>;
  contentAttr: Record<string, string>;
  chevronAttr: Record<string, string>;
  copyKind: string;
  stateLabel: string;
};

function resolveActivityToolLikeMeta(
  rowKind: ActivityToolLikeRowKind,
): ActivityToolLikeMeta {
  if (rowKind === "action") {
    return {
      itemAttr: { "data-chat-action-item": "true" },
      triggerAttr: { "data-chat-action-item-trigger": "true" },
      railAttr: { "data-chat-action-item-rail": "true" },
      contentAttr: { "data-chat-action-item-content": "true" },
      chevronAttr: { "data-chat-action-item-chevron": "true" },
      copyKind: "action",
      stateLabel: "Action",
    };
  }
  if (rowKind === "tool") {
    return {
      itemAttr: { "data-chat-tool-call-item": "true" },
      triggerAttr: { "data-chat-tool-call-item-trigger": "true" },
      railAttr: { "data-chat-tool-call-item-rail": "true" },
      contentAttr: { "data-chat-tool-call-item-content": "true" },
      chevronAttr: { "data-chat-tool-call-item-chevron": "true" },
      copyKind: "tool",
      stateLabel: "Tool",
    };
  }
  if (rowKind === "terminal") {
    return {
      itemAttr: { "data-chat-terminal-item": "true" },
      triggerAttr: { "data-chat-terminal-item-trigger": "true" },
      railAttr: { "data-chat-terminal-item-rail": "true" },
      contentAttr: { "data-chat-terminal-item-content": "true" },
      chevronAttr: { "data-chat-terminal-item-chevron": "true" },
      copyKind: "terminal",
      stateLabel: "Terminal",
    };
  }
  return {
    itemAttr: { "data-chat-subagent-item": "true" },
    triggerAttr: { "data-chat-subagent-item-trigger": "true" },
    railAttr: { "data-chat-subagent-item-rail": "true" },
    contentAttr: { "data-chat-subagent-item-content": "true" },
    chevronAttr: { "data-chat-subagent-item-chevron": "true" },
    copyKind: "subagent",
    stateLabel: "Subagent",
  };
}

const ActivityToolLikeItem = memo(function ActivityToolLikeItem({
  rowKind,
  label,
  inputTitle,
  outputTitle,
  inputPayload,
  resultPayload,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  railIcon,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  rowKind: ActivityToolLikeRowKind;
  label: string;
  inputTitle: string;
  outputTitle: string;
  inputPayload: StructuredOutputPayload | null;
  resultPayload: StructuredOutputPayload | null;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  railIcon: ReactNode;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const activityMeta = resolveActivityToolLikeMeta(rowKind);
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: runState === "running",
      startedAtMs,
      completedAtMs,
      runKey,
    },
  );
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: runState === "running",
  });
  const timestampMs = resolveActivityTimestampMs(startedAtMs, completedAtMs);
  const durationClassName =
    runState === "failed" || runState === "stopped"
      ? "font-mono text-[10px] text-amber-700 dark:text-amber-200"
      : "font-mono text-[10px] text-setta-400 dark:text-setta-400/90";
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    () => (defaultOpen ? ACTIVITY_ROW_DETAILS_VALUE : undefined),
  );
  const lastExpandAllSignalRef = useRef(expandAllSignal);
  const lastCollapseAllSignalRef = useRef(collapseAllSignal);
  const isExpanded = accordionValue === ACTIVITY_ROW_DETAILS_VALUE;

  useEffect(() => {
    if (expandAllSignal === lastExpandAllSignalRef.current) {
      return;
    }
    lastExpandAllSignalRef.current = expandAllSignal;
    if (expandAllSignal > 0) {
      setAccordionValue(ACTIVITY_ROW_DETAILS_VALUE);
    }
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal === lastCollapseAllSignalRef.current) {
      return;
    }
    lastCollapseAllSignalRef.current = collapseAllSignal;
    if (collapseAllSignal > 0) {
      setAccordionValue(undefined);
    }
  }, [collapseAllSignal]);

  useEffect(() => {
    onExpansionChange?.(runKey, isExpanded);
  }, [isExpanded, onExpansionChange, runKey]);

  return (
    <Accordion.Root
      type="single"
      collapsible
      className="w-full"
      value={accordionValue}
      onValueChange={(nextValue) => {
        setAccordionValue(
          nextValue === ACTIVITY_ROW_DETAILS_VALUE
            ? ACTIVITY_ROW_DETAILS_VALUE
            : undefined,
        );
      }}
    >
      <Accordion.Item
        value={ACTIVITY_ROW_DETAILS_VALUE}
        className="group/chat-activity-row w-full border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        {...activityMeta.itemAttr}
      >
        <div className="relative flex w-full items-stretch">
          <Accordion.Trigger
            className={`${TOOL_ROW_TRIGGER_CLASS} min-w-0 flex-1`}
            {...activityMeta.triggerAttr}
          >
            <div
              className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
              title={`${activityMeta.stateLabel} state: ${runState}`}
              aria-label={`${activityMeta.stateLabel} state: ${runState}`}
              {...activityMeta.railAttr}
            >
              {railIcon}
            </div>
            <div className="flex min-w-0 items-start gap-2 py-1 pl-2 pr-2">
              <div
                data-chat-activity-item-label="true"
                className={`${ACTIVITY_ITEM_LABEL_CLASS} truncate break-words font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200`}
              >
                {label}
              </div>
              <div className="ml-auto inline-flex shrink-0 items-center self-center">
                <MdKeyboardArrowDown
                  className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  {...activityMeta.chevronAttr}
                />
              </div>
            </div>
          </Accordion.Trigger>
          <div
            data-chat-activity-item-hover-meta="true"
            className={ACTIVITY_ITEM_HOVER_META_CLASS}
          >
            {onCopy ? (
              <button
                type="button"
                aria-label="Copy activity item"
                data-chat-activity-item-copy-button="true"
                data-chat-activity-item-copy-kind={activityMeta.copyKind}
                className={ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopy();
                }}
              >
                <FiCopy />
              </button>
            ) : null}
            <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />
            {durationLabel ? (
              <span
                data-chat-activity-item-timer="true"
                data-chat-activity-item-run-state={runState}
                className={durationClassName}
              >
                {durationLabel}
              </span>
            ) : null}
            <ToolCallAccordionStatus runState={runState} />
          </div>
        </div>
        <Accordion.Content
          className={ACTIVITY_ACCORDION_CONTENT_CLASS}
          {...activityMeta.contentAttr}
        >
          {inputPayload ? (
            <div className="border-t border-setta-200/70 bg-setta-200/35 px-2 py-1 text-xs dark:border-setta-700/70 dark:bg-setta-860">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                {inputTitle}
              </h3>
              <StructuredOutputBlock
                payload={inputPayload}
                owner={rowKind}
                part="input"
                isStreaming={false}
              />
            </div>
          ) : null}
          {resultPayload ? (
            <div className="border-t border-setta-200/70 bg-white/95 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                {outputTitle}
              </h3>
              <StructuredOutputBlock
                payload={resultPayload}
                owner={rowKind}
                part="output"
                isStreaming={runState === "running"}
              />
            </div>
          ) : null}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const ActionItem = memo(function ActionItem({
  name,
  args,
  result,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  railIcon,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  railIcon?: ReactNode;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const actionLabel = resolveActionLabel(name, args);
  const inputPayload = resolveStructuredOutputPayload({
    value: args,
    toolName: name,
    part: "input",
  });
  const resultPayload =
    resolveStructuredOutputPayload({
      value: result,
      toolName: name,
      part: "output",
      contextValue: args,
    }) ??
    resolveStructuredOutputFallbackPayload({
      runState,
      failedLabel: "Action failed",
      successLabel: "Action completed successfully",
      stoppedLabel: "Action stopped before completion.",
    });
  return (
    <ActivityToolLikeItem
      rowKind="action"
      label={actionLabel}
      inputTitle="Input"
      outputTitle="Output"
      inputPayload={inputPayload}
      resultPayload={resultPayload}
      runState={runState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
      railIcon={railIcon ?? <ToolCallAccordionStatus runState={runState} />}
      onCopy={onCopy}
      defaultOpen={defaultOpen}
      expandAllSignal={expandAllSignal}
      collapseAllSignal={collapseAllSignal}
      onExpansionChange={onExpansionChange}
    />
  );
});

const ToolCallItem = memo(function ToolCallItem({
  name,
  args,
  result,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  railIcon,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  railIcon?: ReactNode;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const inputPayload = resolveStructuredOutputPayload({
    value: args,
    toolName: name,
    part: "input",
  });
  const resultPayload =
    resolveStructuredOutputPayload({
      value: result,
      toolName: name,
      part: "output",
      contextValue: args,
    }) ??
    resolveStructuredOutputFallbackPayload({
      runState,
      failedLabel: "Tool execution failed",
      successLabel: "Tool completed successfully",
      stoppedLabel: "Stopped mid-tool call before completion.",
    });
  return (
    <ActivityToolLikeItem
      rowKind="tool"
      label={name}
      inputTitle="Arguments"
      outputTitle="Result"
      inputPayload={inputPayload}
      resultPayload={resultPayload}
      runState={runState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
      railIcon={railIcon ?? <ToolCallAccordionStatus runState={runState} />}
      onCopy={onCopy}
      defaultOpen={defaultOpen}
      expandAllSignal={expandAllSignal}
      collapseAllSignal={collapseAllSignal}
      onExpansionChange={onExpansionChange}
    />
  );
});

const TerminalItem = memo(function TerminalItem({
  name,
  args,
  result,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const inputPayload = resolveStructuredOutputPayload({
    value: args,
    toolName: name,
    part: "input",
  });
  const resultPayload =
    resolveStructuredOutputPayload({
      value: result,
      toolName: name,
      part: "output",
      contextValue: args,
    }) ??
    resolveStructuredOutputFallbackPayload({
      runState,
      failedLabel: "Terminal command failed",
      successLabel: "Terminal command completed successfully",
      stoppedLabel: "Terminal command stopped before completion.",
    });

  return (
    <ActivityToolLikeItem
      rowKind="terminal"
      label={resolveActionLabel(name, args)}
      inputTitle="Terminal preview"
      outputTitle="Terminal output"
      inputPayload={inputPayload}
      resultPayload={resultPayload}
      runState={runState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
      railIcon={<FiTerminal size={13} className="min-w-4" />}
      onCopy={onCopy}
      defaultOpen={defaultOpen}
      expandAllSignal={expandAllSignal}
      collapseAllSignal={collapseAllSignal}
      onExpansionChange={onExpansionChange}
    />
  );
});

const SubagentItem = memo(function SubagentItem({
  name,
  toolCallId,
  args,
  result,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  name: string;
  toolCallId: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const inputPayload = resolveStructuredOutputPayload({
    value: args,
    toolName: name,
    part: "input",
  });
  const resultPayload =
    resolveStructuredOutputPayload({
      value: result,
      toolName: name,
      part: "output",
      contextValue: args,
    }) ??
    resolveStructuredOutputFallbackPayload({
      runState,
      failedLabel: "Subagent failed",
      successLabel: "Subagent completed successfully",
      stoppedLabel: "Subagent stopped before completion.",
    });
  const profileId = extractNonEmptyStringArg(args, "profileId");
  const label =
    profileId || normalizeToolName(name) || `Subagent ${toolCallId}`;

  return (
    <ActivityToolLikeItem
      rowKind="subagent"
      label={label}
      inputTitle="Subagent details"
      outputTitle="Self-talk"
      inputPayload={inputPayload}
      resultPayload={resultPayload}
      runState={runState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
      railIcon={<FiCpu size={13} className="min-w-4" />}
      onCopy={onCopy}
      defaultOpen={defaultOpen}
      expandAllSignal={expandAllSignal}
      collapseAllSignal={collapseAllSignal}
      onExpansionChange={onExpansionChange}
    />
  );
});

const AssistantActionSection = memo(function AssistantActionSection({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
  showItemCopyButtons = true,
  defaultChildrenOpen = false,
  openAllSignal = 0,
  closeAllSignal = 0,
  suppressCollapsedSummary = false,
  onThinkingOpenStateChange,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  showItemCopyButtons?: boolean;
  defaultChildrenOpen?: boolean;
  openAllSignal?: number;
  closeAllSignal?: number;
  suppressCollapsedSummary?: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
}) {
  const rows = timelineEntries.map((entry) => {
    const copyText = buildCopyTextForActivityTimelineEntry({
      entry,
      toolResultsById,
      toolCallArguments,
    });
    const handleCopyRow = () => {
      copyTextWithNotifications({
        text: copyText,
        emptyMessage: "Nothing to copy for this activity item.",
        successMessage: "Copied activity item.",
        failureMessage: "Failed to copy activity item.",
      });
    };
    const onCopyRow = showItemCopyButtons ? handleCopyRow : undefined;
    if (entry.kind === "thinking") {
      return (
        <ThinkingBox
          key={entry.key}
          activityKey={entry.key}
          content={entry.thinkingEntry.item.thinking}
          summary={entry.thinkingEntry.item.summary}
          timestampMs={entry.thinkingEntry.timestampMs}
          isStreaming={entry.thinkingEntry.isStreaming}
          wasInterrupted={entry.thinkingEntry.wasInterrupted}
          runKey={`activity-${entry.thinkingEntry.timerRunKey}`}
          railIcon={<FaBrain size={13} className="min-w-4" />}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
          suppressCollapsedSummary={suppressCollapsedSummary}
          onExpansionChange={onThinkingOpenStateChange}
        />
      );
    }

    const toolEntry = entry.toolEntry;
    const toolCall = toolEntry.toolCall;
    const toolResult = toolResultsById[toolCall.id];
    const rawToolName =
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`;
    const runState = resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      toolEntry.isStreaming,
    );
    const { startedAtMs, completedAtMs } =
      resolveToolResultTimingAnchors(toolResult);
    const formattedToolResult = formatToolResult(toolResult);
    const argsToDisplay = resolveDisplayArgsForToolCallEntry({
      toolCall,
      toolResult,
      toolCallArguments,
    });

    if (entry.kind === "action") {
      return (
        <ActionItem
          key={entry.key}
          name={rawToolName}
          args={argsToDisplay}
          result={formattedToolResult}
          runState={runState}
          startedAtMs={startedAtMs}
          completedAtMs={completedAtMs}
          runKey={`activity-item-${toolCall.id}`}
          railIcon={resolveActionRailIcon({
            name: rawToolName,
            args: argsToDisplay,
            result: formattedToolResult,
          })}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
          onExpansionChange={onThinkingOpenStateChange}
        />
      );
    }

    if (entry.kind === "terminal") {
      return (
        <TerminalItem
          key={entry.key}
          name={rawToolName}
          args={argsToDisplay}
          result={formattedToolResult}
          runState={runState}
          startedAtMs={startedAtMs}
          completedAtMs={completedAtMs}
          runKey={`activity-item-${toolCall.id}`}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
          onExpansionChange={onThinkingOpenStateChange}
        />
      );
    }

    if (entry.kind === "subagent") {
      return (
        <SubagentItem
          key={entry.key}
          name={rawToolName}
          toolCallId={toolCall.id}
          args={argsToDisplay}
          result={formattedToolResult}
          runState={runState}
          startedAtMs={startedAtMs}
          completedAtMs={completedAtMs}
          runKey={`activity-item-${toolCall.id}`}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
          onExpansionChange={onThinkingOpenStateChange}
        />
      );
    }

    if (entry.kind === "compaction") {
      return (
        <ToolCallItem
          key={entry.key}
          name="Context compaction"
          args={argsToDisplay}
          result={resolveCompactionEntryLabel({
            entry: toolEntry,
            toolResultsById,
            toolCallArguments,
          })}
          runState={runState}
          startedAtMs={startedAtMs}
          completedAtMs={completedAtMs}
          runKey={`activity-item-${toolCall.id}`}
          railIcon={<FiArchive className="min-w-4" size={14} />}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
          onExpansionChange={onThinkingOpenStateChange}
        />
      );
    }

    return (
      <ToolCallItem
        key={entry.key}
        name={rawToolName}
        args={argsToDisplay}
        result={formattedToolResult}
        runState={runState}
        startedAtMs={startedAtMs}
        completedAtMs={completedAtMs}
        runKey={`activity-item-${toolCall.id}`}
        railIcon={<PiWrenchFill size={13} className="min-w-4" />}
        onCopy={onCopyRow}
        defaultOpen={defaultChildrenOpen}
        expandAllSignal={openAllSignal}
        collapseAllSignal={closeAllSignal}
        onExpansionChange={onThinkingOpenStateChange}
      />
    );
  });

  return (
    <div
      data-chat-assistant-activity-items="true"
      className="flex w-full flex-col"
    >
      {rows}
    </div>
  );
});

type ToolCallRunState = StructuredOutputRunState;
type ToolCallSectionState = "running" | "complete" | "stopped";

function resolveToolCallRunState(
  success: boolean | undefined,
  isStreaming: boolean,
): ToolCallRunState {
  if (success === true) {
    return "success";
  }
  if (success === false) {
    return "failed";
  }
  if (isStreaming) {
    return "running";
  }
  return "stopped";
}

function resolveToolCallSectionState(
  states: ToolCallRunState[],
): ToolCallSectionState {
  if (states.some((state) => state === "failed" || state === "stopped")) {
    return "stopped";
  }
  if (states.some((state) => state === "running")) {
    return "running";
  }
  return "complete";
}

type ToolSectionTimingAnchors = {
  startedAtMs: number | null;
  completedAtMs: number | null;
};

function resolveToolResultTimingAnchors(
  toolResult: ToolChatMessage | undefined,
): ToolSectionTimingAnchors {
  return {
    startedAtMs: parseIsoTimestampMs(toolResult?.started_at),
    completedAtMs: parseIsoTimestampMs(toolResult?.completed_at),
  };
}

function resolveToolSectionTimingAnchors(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
): ToolSectionTimingAnchors {
  let startedAtMs: number | null = null;
  let completedAtMs: number | null = null;
  for (const entry of entries) {
    const toolResult = toolResultsById[entry.toolCall.id];
    const { startedAtMs: entryStartedAtMs, completedAtMs: entryCompletedAtMs } =
      resolveToolResultTimingAnchors(toolResult);
    if (entryStartedAtMs !== null) {
      startedAtMs =
        startedAtMs === null
          ? entryStartedAtMs
          : Math.min(startedAtMs, entryStartedAtMs);
    }
    if (entryCompletedAtMs !== null) {
      completedAtMs =
        completedAtMs === null
          ? entryCompletedAtMs
          : Math.max(completedAtMs, entryCompletedAtMs);
    }
  }
  return { startedAtMs, completedAtMs };
}

function resolveActivitySectionTiming({
  timelineEntries,
  toolResultsById,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
}): {
  sectionState: ToolCallSectionState;
  startedAtMs: number | null;
  completedAtMs: number | null;
} {
  const runStates: ToolCallRunState[] = [];
  let startedAtMs: number | null = null;
  let completedAtMs: number | null = null;
  for (const entry of timelineEntries) {
    if (entry.kind === "thinking") {
      const thinkingSectionState = resolveThinkingSectionState({
        isStreaming: entry.thinkingEntry.isStreaming,
        wasInterrupted: entry.thinkingEntry.wasInterrupted,
      });
      runStates.push(
        thinkingSectionState === "running"
          ? "running"
          : thinkingSectionState === "stopped"
            ? "stopped"
            : "success",
      );
      continue;
    }

    const toolResult = toolResultsById[entry.toolEntry.toolCall.id];
    const runState = resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      entry.toolEntry.isStreaming,
    );
    runStates.push(runState);
    const { startedAtMs: entryStartedAtMs, completedAtMs: entryCompletedAtMs } =
      resolveToolResultTimingAnchors(toolResult);
    if (entryStartedAtMs !== null) {
      startedAtMs =
        startedAtMs === null
          ? entryStartedAtMs
          : Math.min(startedAtMs, entryStartedAtMs);
    }
    if (entryCompletedAtMs !== null) {
      completedAtMs =
        completedAtMs === null
          ? entryCompletedAtMs
          : Math.max(completedAtMs, entryCompletedAtMs);
    }
  }
  return {
    sectionState: resolveToolCallSectionState(runStates),
    startedAtMs,
    completedAtMs,
  };
}

function ToolCallSectionStatus({
  sectionState,
  elapsedSeconds,
  elapsedMs,
  hasKnownDuration,
  runningLabel = "Working",
  stoppedLabel = "Stopped Mid-Tool Call",
  includeThinkingDataAttrs = false,
  hideCompleteIcon = false,
}: {
  sectionState: ToolCallSectionState;
  elapsedSeconds: number;
  elapsedMs: number;
  hasKnownDuration: boolean;
  runningLabel?: string;
  stoppedLabel?: string;
  includeThinkingDataAttrs?: boolean;
  hideCompleteIcon?: boolean;
}) {
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: sectionState === "running",
  });
  if (sectionState === "complete") {
    if (hideCompleteIcon) {
      if (!durationLabel) {
        return null;
      }
      return (
        <span className="inline-flex items-center gap-1 text-setta-500 dark:text-setta-300">
          <span
            data-chat-run-timer="true"
            data-chat-thinking-timer={
              includeThinkingDataAttrs ? "true" : undefined
            }
            className="font-mono text-[10px] text-setta-400 dark:text-setta-400/90"
          >
            {durationLabel}
          </span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-setta-500 dark:text-setta-300">
        <IoMdCheckmark
          data-chat-run-complete-icon="true"
          data-chat-thinking-complete-icon={
            includeThinkingDataAttrs ? "true" : undefined
          }
          className="text-[12px]"
        />
        {durationLabel ? (
          <span
            data-chat-run-timer="true"
            data-chat-thinking-timer={
              includeThinkingDataAttrs ? "true" : undefined
            }
            className="font-mono text-[10px] text-setta-400 dark:text-setta-400/90"
          >
            {durationLabel}
          </span>
        ) : null}
      </span>
    );
  }
  if (sectionState === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">
        <MdErrorOutline className="text-[11px]" />
        {stoppedLabel}
        {durationLabel ? (
          <span
            data-chat-run-timer="true"
            data-chat-thinking-timer={
              includeThinkingDataAttrs ? "true" : undefined
            }
            className="font-mono text-[10px] normal-case tracking-normal text-amber-700 dark:text-amber-200"
          >
            {durationLabel}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-500 dark:text-setta-300">
      <BrailleSpinner
        className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
      />
      {runningLabel}
      {durationLabel ? (
        <span
          data-chat-run-timer="true"
          data-chat-thinking-timer={
            includeThinkingDataAttrs ? "true" : undefined
          }
          className="font-mono text-[10px] normal-case tracking-normal text-setta-400 dark:text-setta-400/90"
        >
          {durationLabel}
        </span>
      ) : null}
    </span>
  );
}

const ToolCallSection = memo(function ToolCallSection({
  children,
  toolCount,
  latestToolLabel,
  sectionState,
  startedAtMs,
  completedAtMs,
  runKey,
}: {
  children: ReactNode;
  toolCount: number;
  latestToolLabel: string;
  sectionState: ToolCallSectionState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
}) {
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration(
    {
      active: sectionState === "running",
      startedAtMs,
      completedAtMs,
      runKey,
    },
  );
  const title = "Tool calls";
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="tool-call-details"
        className={TOOL_SECTION_CARD_CLASS}
        data-chat-tool-call-section="true"
        data-chat-tool-call-section-state={sectionState}
      >
        <Accordion.Trigger className={TOOL_SECTION_TRIGGER_CLASS}>
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-tool-call-section-rail="true"
          >
            <PiWrenchFill size={13} className="min-w-4" />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200">
                  {title}
                </span>
                <span
                  data-chat-tool-call-count-badge="true"
                  className={ACTIVITY_COUNT_BADGE_CLASS}
                  title={`${toolCount} tool calls`}
                >
                  <AnimatedCountBadgeValue
                    value={toolCount}
                    animateOnChange={sectionState === "running"}
                  />
                </span>
              </div>
              <div className="truncate text-[10px] text-setta-400 dark:text-setta-400/90">
                {latestToolLabel}
              </div>
            </div>
            <div className="ml-auto inline-flex shrink-0 items-center gap-1 self-center">
              <ToolCallSectionStatus
                sectionState={sectionState}
                elapsedSeconds={elapsedSeconds}
                elapsedMs={elapsedMs}
                hasKnownDuration={hasKnownDuration}
              />
              <MdKeyboardArrowDown
                data-chat-tool-call-section-chevron="true"
                className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
              />
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=open]:block data-[state=closed]:hidden dark:border-setta-700/70">
          <div className="flex w-full flex-col">{children}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const AssistantToolCallSection = memo(function AssistantToolCallSection({
  entries,
  toolResultsById,
  toolCallArguments,
  toolCallContext,
}: {
  entries: ToolCallRenderEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  toolCallContext: ToolCallContext;
}) {
  const toolCallStates: ToolCallRunState[] = [];
  const toolLabels: string[] = [];
  const rows = entries.map(({ toolCall, isStreaming }) => {
    const toolResult = toolResultsById[toolCall.id];
    const rawToolName =
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`;
    const runState = resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      isStreaming,
    );
    toolCallStates.push(runState);
    toolLabels.push(rawToolName);

    const questionPayload = toolCallContext.questionPayloadById[toolCall.id];
    if (questionPayload) {
      const resolvedAnswers = resolveQuestionAnswers(
        questionPayload,
        toolResult,
      );
      return (
        <div key={toolCall.id} className="w-full">
          <QuestionCard
            toolCallId={toolCall.id}
            payload={questionPayload}
            resolvedAnswers={resolvedAnswers}
          />
        </div>
      );
    }
    const todoPayload = toolCallContext.todoPayloadById[toolCall.id];
    if (todoPayload) {
      const summaryOnly = toolCallContext.latestTodoCallId !== toolCall.id;
      return (
        <div key={toolCall.id} className="w-full">
          <TodoListCard todos={todoPayload.todos} summaryOnly={summaryOnly} />
        </div>
      );
    }
    const approvalPayload = toolCallContext.approvalPayloadById[toolCall.id];
    if (approvalPayload) {
      return (
        <div key={toolCall.id} className="w-full">
          <ApprovalCard
            toolCallId={toolCall.id}
            toolName={approvalPayload.toolName ?? null}
            toolType={approvalPayload.toolType ?? null}
            input={approvalPayload.input}
            toolResult={toolResult}
            isStreaming={isStreaming}
          />
        </div>
      );
    }
    const argsFromAssistant = toolCall.function?.arguments;
    const pendingArgs = toolCallArguments?.[toolCall.id];
    let argsToDisplay = pendingArgs;
    if (toolResult?.arguments && Object.keys(toolResult.arguments).length > 0) {
      argsToDisplay = toolResult.arguments;
    } else if (argsFromAssistant && Object.keys(argsFromAssistant).length > 0) {
      argsToDisplay = argsFromAssistant;
    }
    return (
      <ToolCallItem
        key={toolCall.id}
        name={rawToolName}
        args={argsToDisplay}
        result={formatToolResult(toolResult)}
        runState={runState}
      />
    );
  });

  const sectionState = resolveToolCallSectionState(toolCallStates);
  const latestToolLabel =
    toolLabels.length > 0 ? toolLabels[toolLabels.length - 1] : "Tool activity";
  const { startedAtMs, completedAtMs } = resolveToolSectionTimingAnchors(
    entries,
    toolResultsById,
  );
  const runKey = entries.map((entry) => entry.toolCall.id).join("|");

  return (
    <ToolCallSection
      toolCount={entries.length}
      latestToolLabel={latestToolLabel}
      sectionState={sectionState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
    >
      {rows}
    </ToolCallSection>
  );
});

function AssistantErrorCallout({
  content,
  conversationSearchTerms = [],
}: {
  content: string;
  conversationSearchTerms?: Array<string>;
}) {
  const displayText = stripAssistantErrorPrefix(content);
  return (
    <div
      className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-50"
      data-chat-assistant-error="true"
    >
      <MdErrorOutline className="mt-0.5 shrink-0 text-red-500 dark:text-red-400" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
          AI request failed
        </div>
        <MarkdownContent
          content={displayText}
          className={ASSISTANT_ERROR_MARKDOWN_CLASS}
          role={ChatRoleEnum.assistant}
          isStreaming={false}
          highlightTerms={conversationSearchTerms}
        />
      </div>
    </div>
  );
}

function StreamItem({
  item,
  isStreaming,
  runKey,
  conversationSearchTerms = [],
}: {
  item: ChatContentItem;
  isStreaming: boolean;
  runKey: string;
  conversationSearchTerms?: Array<string>;
}) {
  switch (item.type) {
    case C.LLM_TEXT:
      if (isAssistantErrorText(item.text)) {
        return (
          <AssistantErrorCallout
            content={item.text}
            conversationSearchTerms={conversationSearchTerms}
          />
        );
      }
      return (
        <MarkdownContent
          content={item.text}
          className={ASSISTANT_MARKDOWN_CLASS}
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
          highlightTerms={conversationSearchTerms}
        />
      );
    case C.LLM_THINKING:
      return (
        <ThinkingBox
          activityKey={runKey}
          content={item.thinking}
          summary={item.summary}
          timestampMs={null}
          isStreaming={isStreaming}
          wasInterrupted={false}
          runKey={runKey}
          conversationSearchTerms={conversationSearchTerms}
        />
      );
    case "image_url":
      return <ChatImage url={item.image_url.url} />;
    default:
      return null;
  }
}

function AssistantReasoningCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full" data-chat-assistant-reasoning-card="true">
      {children}
    </div>
  );
}

function AssistantActivityActionsAnchor({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className="group relative mt-4 w-full"
      data-chat-assistant-activity-anchor="true"
    >
      {children}
      {actions ? (
        <div
          className="absolute left-full top-1/2 z-[20] ml-1.5 -translate-y-1/2"
          data-chat-actions-anchor="right"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function AssistantToolCallCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full" data-chat-assistant-tool-call-card="true">
      {children}
    </div>
  );
}

function AssistantTypingIndicator({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className="w-full px-1.5 text-setta-400 dark:text-setta-500"
      data-chat-assistant-typing-indicator="true"
      aria-hidden="true"
    >
      <BrailleSpinner
        className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
      />
    </div>
  );
}

function AssistantMessageGroup({
  children,
  messageId,
  actions,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  messageId?: string;
  actions?: ReactNode;
  isSearchMatchActive?: boolean;
}) {
  const widthClass = `group flex w-full ${ASSISTANT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-start gap-2`;
  const containerClassName = isSearchMatchActive
    ? "mb-2 mt-1.5 flex justify-start rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "mb-2 mt-1.5 flex justify-start @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div className={`${widthClass} relative`} data-message-id={messageId}>
        {children}
        {actions ? (
          <div
            className="absolute left-full top-1/2 z-[20] ml-1.5 -translate-y-1/2"
            data-chat-actions-anchor="right"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LLMChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex max-w-full">
      <div
        className="relative inline-flex min-h-[24px] min-w-[24px] max-w-full cursor-text flex-col gap-1.5 rounded-b-lg rounded-tr-lg border border-transparent bg-white pb-2 pl-3 pr-2.5 pt-1 text-setta-800 dark:border-setta-700/45 dark:bg-setta-850 dark:text-setta-50"
        data-chat-assistant-bubble="true"
      >
        {children}
      </div>
    </div>
  );
}

function UserChatBubble({
  children,
  actions,
  footer,
  messageId,
  bubbleWidthPx,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  messageId?: string;
  bubbleWidthPx?: number | null;
  isSearchMatchActive?: boolean;
}) {
  const containerClassName = isSearchMatchActive
    ? "my-2 flex justify-end rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "my-2 flex justify-end @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div
        className={`group flex w-fit ${CHAT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-end`}
        data-message-id={messageId}
      >
        <div
          className="relative inline-flex max-w-full cursor-text flex-col gap-1.5 rounded-t-lg rounded-bl-lg border border-blue-300 bg-blue-200 pb-2 pl-3 pr-2.5 pt-1 text-setta-950 dark:border-blue-800/80 dark:bg-blue-950 dark:text-white"
          data-chat-user-bubble="true"
          style={
            typeof bubbleWidthPx === "number"
              ? { width: `${bubbleWidthPx}px` }
              : undefined
          }
        >
          {children}
          {actions ? (
            <div
              className="absolute right-full top-1/2 z-[20] mr-1.5 -translate-y-1/2"
              data-chat-actions-anchor="left"
            >
              {actions}
            </div>
          ) : null}
        </div>
        {footer}
      </div>
    </div>
  );
}

function SystemChatBubble({
  children,
  actions,
  footer,
  messageId,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  messageId?: string;
  isSearchMatchActive?: boolean;
}) {
  const containerClassName = isSearchMatchActive
    ? "my-2 flex justify-center rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "my-2 flex justify-center @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div
        className="group flex max-w-[min(90%,800px)] flex-col items-start"
        data-message-id={messageId}
      >
        <div
          className="relative flex max-w-full cursor-text flex-col gap-1.5 rounded-md border border-setta-200 bg-setta-50 px-2.5 pb-1.5 pt-0.5 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300"
          data-chat-system-bubble="true"
        >
          {children}
          {actions ? (
            <div
              className="absolute left-full top-1/2 z-[20] ml-1.5 -translate-y-1/2"
              data-chat-actions-anchor="right"
            >
              {actions}
            </div>
          ) : null}
        </div>
        {footer}
      </div>
    </div>
  );
}

const USER_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const SYSTEM_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

function ChatMessageActions({
  onCopy,
  onRedo,
  showRedo,
  redoDisabled,
  redoDisabledReason,
  showEdit,
  editDisabled,
  editDisabledReason,
  onEdit,
  branchInfo,
  onBranchSwitch,
}: {
  onCopy: () => void;
  onRedo?: () => void;
  showRedo: boolean;
  redoDisabled: boolean;
  redoDisabledReason: string | null;
  showEdit: boolean;
  editDisabled: boolean;
  editDisabledReason: string | null;
  onEdit?: (bubbleWidthPx?: number) => void;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  const branchCount = branchInfo?.branchChatIds.length ?? 0;
  const activeIndex = branchInfo?.activeIndex ?? 0;
  const hasBranches = branchCount > 1 && Boolean(onBranchSwitch);
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < branchCount - 1;

  return (
    <div
      className="pointer-events-none relative z-[1] inline-flex flex-col items-center gap-1 rounded-md border border-setta-200/90 bg-setta-100/95 px-1 py-0.5 text-setta-500 opacity-0 shadow-sm transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 @[40rem]/chat-message:flex-row dark:border-setta-700/90 dark:bg-setta-925/95 dark:text-setta-300"
      data-chat-message-actions="true"
    >
      <button
        type="button"
        aria-label="Copy message"
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:hover:text-setta-100"
        onClick={onCopy}
      >
        <FiCopy />
      </button>
      {showRedo ? (
        <button
          type="button"
          aria-label="Redo response"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={() => {
            onRedo?.();
          }}
          disabled={redoDisabled}
          title={redoDisabledReason ?? undefined}
        >
          <FiRotateCcw />
        </button>
      ) : null}
      {showEdit ? (
        <button
          type="button"
          aria-label="Edit message"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={(event) => {
            const bubble = event.currentTarget.closest(
              '[data-chat-user-bubble="true"]',
            );
            const bubbleWidthPx = bubble
              ? bubble.getBoundingClientRect().width
              : undefined;
            onEdit?.(bubbleWidthPx);
          }}
          disabled={editDisabled}
          title={editDisabledReason ?? undefined}
        >
          <FiEdit3 />
        </button>
      ) : null}
      {hasBranches ? (
        <div className="ml-0.5 inline-flex items-center gap-0.5 rounded-sm border border-setta-200 px-0.5 py-0.5 text-[9px] font-medium tabular-nums text-setta-500 dark:border-setta-700 dark:text-setta-300">
          <button
            type="button"
            aria-label="Previous branch"
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex - 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
            disabled={!canGoPrevious}
          >
            <MdChevronLeft />
          </button>
          <span className="min-w-[30px] px-1 text-center">
            {activeIndex + 1}/{branchCount}
          </span>
          <button
            type="button"
            aria-label="Next branch"
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex + 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
            disabled={!canGoNext}
          >
            <MdChevronRight />
          </button>
        </div>
      ) : null}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive = false,
  suppressActivityThoughtScroll = false,
  suppressActivitySection = false,
  onRedoMessage,
  attachmentUrlMap,
  requestAttachmentUrls,
  isEditing = false,
  editingBubbleWidthPx,
  interrupted,
  activityAccordionOpenByDefault = false,
  activityChildrenOpenByDefault = false,
  conversationSearchTerms = [],
  canEdit = false,
  editDisabledReason = null,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  branchInfo,
  onBranchSwitch,
}: {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive?: boolean;
  suppressActivityThoughtScroll?: boolean;
  suppressActivitySection?: boolean;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  attachmentUrlMap: ChatAttachmentUrlMap;
  requestAttachmentUrls: RequestChatAttachmentUrls;
  isEditing?: boolean;
  editingBubbleWidthPx?: number | null;
  interrupted: boolean;
  activityAccordionOpenByDefault?: boolean;
  activityChildrenOpenByDefault?: boolean;
  conversationSearchTerms?: Array<string>;
  canEdit?: boolean;
  editDisabledReason?: string | null;
  onStartEdit?: (bubbleWidthPx?: number) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
  const isUser = message.role === ChatRoleEnum.user;
  const isAssistant = message.role === ChatRoleEnum.assistant;
  const showEdit = isUser && canEdit;
  const editDisabled = Boolean(editDisabledReason);
  const renderAttachmentName = useCallback(
    (attachmentName: string) =>
      renderConversationSearchHighlightedText(
        attachmentName,
        conversationSearchTerms,
      ),
    [conversationSearchTerms],
  );
  const handleCopy = useCallback(() => {
    const text = buildCopyTextForMessage({
      message,
      toolResultsById,
      toolCallArguments,
    });
    copyTextWithNotifications({
      text,
      emptyMessage: "Nothing to copy for this message.",
      successMessage: "Copied message.",
      failureMessage: "Failed to copy message.",
    });
  }, [message, toolCallArguments, toolResultsById]);
  const messageTimestampMs = resolveMessageCreatedAtMs(message);
  const actionBar = !isEditing ? (
    <ChatMessageActions
      onCopy={handleCopy}
      showRedo={isAssistant && Boolean(onRedoMessage)}
      onRedo={
        isAssistant && onRedoMessage
          ? () => {
              void onRedoMessage(message.id);
            }
          : undefined
      }
      redoDisabled={isStreaming}
      redoDisabledReason={isStreaming ? "Wait for response to finish." : null}
      showEdit={showEdit}
      editDisabled={editDisabled}
      editDisabledReason={editDisabledReason}
      onEdit={onStartEdit}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  ) : null;
  const assistantContent = isAssistant
    ? message.content
    : EMPTY_ASSISTANT_CONTENT;
  const { activityKey } = useMemo(
    () => getStreamActivitySummary(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const { displayItems } = useMemo(() => {
    if (!isAssistant) {
      return {
        displayItems: [] as AssistantDisplayItem[],
      };
    }
    return partitionAssistantContent(message.content);
  }, [isAssistant, message.content]);
  const hasMeaningfulDisplayItems = useMemo(
    () => hasMeaningfulAssistantDisplayItems(displayItems),
    [displayItems],
  );
  const showAssistantSpinner = useIdleStreamSpinner(
    isAssistant && isStreaming,
    activityKey,
    spinnerDelayMs,
  );
  const activityTimelineEntries = useMemo<ActivityTimelineEntry[]>(() => {
    if (!isAssistant) {
      return [];
    }
    return buildActivityTimelineEntries(
      [
        {
          message,
          isStreaming,
          wasInterrupted: interrupted,
        },
      ],
      toolResultsById,
    );
  }, [interrupted, isAssistant, isStreaming, message, toolResultsById]);
  const activitySectionTiming = useMemo(
    () =>
      resolveActivitySectionTiming({
        timelineEntries: activityTimelineEntries,
        toolResultsById,
      }),
    [activityTimelineEntries, toolResultsById],
  );

  if (message.role === ChatRoleEnum.assistant) {
    const showTypingIndicator = showAssistantSpinner;
    const hasBubbleContent =
      attachments.length > 0 || hasMeaningfulDisplayItems;
    const shouldRenderBubble = hasBubbleContent;
    const hasActivityContent =
      !suppressActivitySection && activityTimelineEntries.length > 0;
    if (!shouldRenderBubble && !hasActivityContent) {
      if (showTypingIndicator) {
        return (
          <AssistantMessageGroup messageId={message.id}>
            <AssistantTypingIndicator visible={true} />
          </AssistantMessageGroup>
        );
      }
      return null;
    }
    const latestActivityPreview = resolveLatestActivityPreview({
      timelineEntries: activityTimelineEntries,
      toolResultsById,
      toolCallArguments,
    });
    const hasThinkingActivity = activityTimelineEntries.some(
      (entry) => entry.kind === "thinking",
    );
    return (
      <AssistantMessageGroup
        messageId={message.id}
        actions={hasActivityContent ? undefined : actionBar}
        isSearchMatchActive={isSearchMatchActive}
      >
        {hasActivityContent ? (
          <AssistantActivityActionsAnchor actions={actionBar}>
            <AssistantReasoningCard>
              <AssistantActivitySection
                preview={latestActivityPreview}
                itemCount={activityTimelineEntries.length}
                sectionState={activitySectionTiming.sectionState}
                startedAtMs={activitySectionTiming.startedAtMs}
                completedAtMs={activitySectionTiming.completedAtMs}
                runKey={`activity-${message.id}`}
                suppressThoughtScrollAnimation={
                  suppressActivityThoughtScroll ||
                  (isStreaming && hasMeaningfulDisplayItems)
                }
                defaultOpen={activityAccordionOpenByDefault}
                defaultChildrenOpen={activityChildrenOpenByDefault}
                conversationSearchTerms={conversationSearchTerms}
              >
                {(showItemCopyButtons, childAccordionControl) => (
                  <AssistantToolCallCard>
                    <AssistantActionSection
                      timelineEntries={activityTimelineEntries}
                      toolResultsById={toolResultsById}
                      toolCallArguments={toolCallArguments}
                      showItemCopyButtons={showItemCopyButtons}
                      defaultChildrenOpen={childAccordionControl.defaultOpen}
                      openAllSignal={childAccordionControl.expandAllSignal}
                      closeAllSignal={childAccordionControl.collapseAllSignal}
                      suppressCollapsedSummary={
                        childAccordionControl.suppressSummaries
                      }
                      onThinkingOpenStateChange={
                        childAccordionControl.onThinkingOpenStateChange
                      }
                    />
                  </AssistantToolCallCard>
                )}
              </AssistantActivitySection>
            </AssistantReasoningCard>
          </AssistantActivityActionsAnchor>
        ) : null}
        {shouldRenderBubble ? (
          <LLMChatBubble>
            <ChatAttachmentList
              attachments={attachments}
              isUser={false}
              attachmentUrlMap={attachmentUrlMap}
              requestAttachmentUrls={requestAttachmentUrls}
              renderAttachmentName={renderAttachmentName}
            />
            {displayItems.map(({ item, fullIndex }) => {
              return (
                <StreamItem
                  key={fullIndex}
                  item={item}
                  isStreaming={isStreaming}
                  runKey={`${message.id}-content-${fullIndex}`}
                  conversationSearchTerms={conversationSearchTerms}
                />
              );
            })}
          </LLMChatBubble>
        ) : null}
        {shouldRenderBubble ? (
          <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
        ) : null}
        <AssistantTypingIndicator
          visible={
            showTypingIndicator &&
            !hasMeaningfulDisplayItems &&
            !hasThinkingActivity
          }
        />
        {!shouldRenderBubble && !hasActivityContent ? (
          <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
        ) : null}
      </AssistantMessageGroup>
    );
  }

  if (isUser && isEditing) {
    return (
      <UserChatBubble
        messageId={message.id}
        bubbleWidthPx={editingBubbleWidthPx}
      >
        <ChatMessageEditor
          initialText={getPlainTextFromMessage(message)}
          initialAttachments={attachments}
          disabled={!canEdit || editDisabled}
          onCancel={onCancelEdit ?? (() => {})}
          onSave={onSaveEdit ?? (() => false)}
        />
      </UserChatBubble>
    );
  }

  const content = message.content ?? [];
  let textClassName = USER_MARKDOWN_CLASS;
  let imageClassName = "border-white/30";
  let Wrapper = UserChatBubble;
  if (message.role === ChatRoleEnum.system) {
    textClassName = SYSTEM_MARKDOWN_CLASS;
    imageClassName = "";
    Wrapper = SystemChatBubble;
  }
  const resolvedImageClassName = imageClassName || undefined;

  return (
    <Wrapper
      messageId={message.id}
      actions={actionBar}
      footer={<ChatMessageTimestampFooter timestampMs={messageTimestampMs} />}
      isSearchMatchActive={isSearchMatchActive}
    >
      <ChatAttachmentList
        attachments={attachments}
        isUser={message.role === ChatRoleEnum.user}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        renderAttachmentName={renderAttachmentName}
      />
      {content.map((item, idx) => {
        const key = `${message.id}-${idx}`;
        if (item.type === C.LLM_TEXT) {
          return (
            <MarkdownContent
              key={key}
              content={item.text}
              className={textClassName}
              role={message.role}
              isStreaming={false}
              highlightTerms={conversationSearchTerms}
            />
          );
        }
        if (item.type === C.LLM_THINKING) {
          return (
            <MarkdownContent
              key={key}
              content={item.thinking}
              className={`${textClassName} italic`}
              role={message.role}
              isStreaming={false}
              highlightTerms={conversationSearchTerms}
            />
          );
        }
        if (item.type === "image_url") {
          return (
            <ChatImage
              key={key}
              url={item.image_url.url}
              className={resolvedImageClassName}
            />
          );
        }
        return null;
      })}
    </Wrapper>
  );
});

function resolveQuestionAnswers(
  payload: AskUserQuestionPayload,
  toolResult: ToolChatMessage | undefined,
): Record<string, string> | null {
  if (toolResult) {
    const parsed = parseAnswers(toolResult.result);
    if (parsed) {
      return parsed;
    }
  }
  if (payload.answers) {
    return payload.answers;
  }
  return null;
}

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMessageId,
  conversationSearchTerms = [],
  allMessages,
  editDisabledReason,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  activeSearchMessageId?: string | null;
  conversationSearchTerms?: Array<string>;
  allMessages: Array<BaseChatMessageUnion>;
  editDisabledReason?: string | null;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfoByMessage?: Record<string, ChatMessageBranchInfo>;
}) {
  const { canEditParams } = useShareCapabilities();
  const activityAccordionOpenByDefault = useAIStore(
    (state) => state.projectChatActivityAccordionOpenByDefault,
  );
  const activityChildrenOpenByDefault = useAIStore(
    (state) => state.projectChatActivityChildrenOpenByDefault,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBubbleWidthPx, setEditingBubbleWidthPx] = useState<
    number | null
  >(null);
  const { attachmentUrlMap, requestAttachmentUrls } =
    useChatAttachmentPreviewUrls(messages);
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );

  useEffect(() => {
    if (waitingForResponse) {
      setEditingMessageId(null);
      setEditingBubbleWidthPx(null);
    }
  }, [waitingForResponse]);
  const output: ReactNode[] = [];
  const lastMessage = messages[messages.length - 1];
  let streamingMessageId: string | null = null;
  if (waitingForResponse) {
    streamingMessageId = resolveStreamingAssistantMessageId(messages);
  }
  const suppressActivityThoughtScrollAnimation = useMemo(() => {
    if (!waitingForResponse || !streamingMessageId) {
      return false;
    }
    const streamingMessage = messages.find(
      (message) => message.id === streamingMessageId,
    );
    if (!streamingMessage || streamingMessage.role !== ChatRoleEnum.assistant) {
      return false;
    }
    const { displayItems } = partitionAssistantContent(
      streamingMessage.content,
    );
    return hasMeaningfulAssistantDisplayItems(displayItems);
  }, [messages, streamingMessageId, waitingForResponse]);
  const suppressedActivitySectionMessageIds = new Set<string>();
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (isAssistantActivityOnlyMessage(message)) {
      const groupedMessages: AssistantChatMessage[] = [];
      const activityMessageContexts: ActivityMessageContext[] = [];
      const firstMessageId = message.id;
      let groupEnd = index;
      while (groupEnd < messages.length) {
        const nextMessage = messages[groupEnd];
        if (!isAssistantActivityOnlyMessage(nextMessage)) {
          break;
        }
        groupedMessages.push(nextMessage);
        const isStreamingMessage =
          waitingForResponse && nextMessage.id === streamingMessageId;
        const wasInterrupted = Boolean(
          interruptedAssistantMessageIds?.[nextMessage.id],
        );
        activityMessageContexts.push({
          message: nextMessage,
          isStreaming: isStreamingMessage,
          wasInterrupted,
        });
        groupEnd += 1;
      }
      const trailingAssistantMessage = messages[groupEnd];
      if (
        trailingAssistantMessage?.role === ChatRoleEnum.assistant &&
        !isAssistantActivityOnlyMessage(trailingAssistantMessage) &&
        hasAssistantActivityContent(trailingAssistantMessage)
      ) {
        const isStreamingMessage =
          waitingForResponse &&
          trailingAssistantMessage.id === streamingMessageId;
        const wasInterrupted = Boolean(
          interruptedAssistantMessageIds?.[trailingAssistantMessage.id],
        );
        activityMessageContexts.push({
          message: trailingAssistantMessage,
          isStreaming: isStreamingMessage,
          wasInterrupted,
        });
        suppressedActivitySectionMessageIds.add(trailingAssistantMessage.id);
      }
      const timelineEntries = buildActivityTimelineEntries(
        activityMessageContexts,
        toolResultsById,
      );
      const hasActivityContent = timelineEntries.length > 0;
      const latestActivityPreview = resolveLatestActivityPreview({
        timelineEntries,
        toolResultsById,
        toolCallArguments,
      });
      const activitySectionTiming = resolveActivitySectionTiming({
        timelineEntries,
        toolResultsById,
      });
      const handleGroupedCopy = () => {
        const text = groupedMessages
          .map((groupedMessage) =>
            buildCopyTextForMessage({
              message: groupedMessage,
              toolResultsById,
              toolCallArguments,
            }),
          )
          .filter((entry) => entry.length > 0)
          .join("\n\n")
          .trim();
        copyTextWithNotifications({
          text,
          emptyMessage: "Nothing to copy for this message.",
          successMessage: "Copied message.",
          failureMessage: "Failed to copy message.",
        });
      };
      const actionBar = (
        <ChatMessageActions
          onCopy={handleGroupedCopy}
          showRedo={Boolean(onRedoMessage)}
          onRedo={
            onRedoMessage
              ? () => {
                  void onRedoMessage(firstMessageId);
                }
              : undefined
          }
          redoDisabled={waitingForResponse}
          redoDisabledReason={
            waitingForResponse ? "Wait for response to finish." : null
          }
          showEdit={false}
          editDisabled={false}
          editDisabledReason={null}
          branchInfo={branchInfoByMessage?.[firstMessageId]}
          onBranchSwitch={onBranchSwitch}
        />
      );
      output.push(
        <AssistantMessageGroup
          key={`tool-call-group-${firstMessageId}`}
          messageId={firstMessageId}
          isSearchMatchActive={firstMessageId === activeSearchMessageId}
        >
          {hasActivityContent ? (
            <AssistantActivityActionsAnchor actions={actionBar}>
              <AssistantReasoningCard>
                <AssistantActivitySection
                  preview={latestActivityPreview}
                  itemCount={timelineEntries.length}
                  sectionState={activitySectionTiming.sectionState}
                  startedAtMs={activitySectionTiming.startedAtMs}
                  completedAtMs={activitySectionTiming.completedAtMs}
                  runKey={`activity-${firstMessageId}`}
                  suppressThoughtScrollAnimation={
                    suppressActivityThoughtScrollAnimation
                  }
                  defaultOpen={activityAccordionOpenByDefault}
                  defaultChildrenOpen={activityChildrenOpenByDefault}
                  conversationSearchTerms={conversationSearchTerms}
                >
                  {(showItemCopyButtons, childAccordionControl) => (
                    <AssistantToolCallCard>
                      <AssistantActionSection
                        timelineEntries={timelineEntries}
                        toolResultsById={toolResultsById}
                        toolCallArguments={toolCallArguments}
                        showItemCopyButtons={showItemCopyButtons}
                        defaultChildrenOpen={childAccordionControl.defaultOpen}
                        openAllSignal={childAccordionControl.expandAllSignal}
                        closeAllSignal={childAccordionControl.collapseAllSignal}
                        suppressCollapsedSummary={
                          childAccordionControl.suppressSummaries
                        }
                        onThinkingOpenStateChange={
                          childAccordionControl.onThinkingOpenStateChange
                        }
                      />
                    </AssistantToolCallCard>
                  )}
                </AssistantActivitySection>
              </AssistantReasoningCard>
            </AssistantActivityActionsAnchor>
          ) : null}
        </AssistantMessageGroup>,
      );
      index = groupEnd;
      continue;
    }
    const isStreamingMessage =
      waitingForResponse &&
      message.role === ChatRoleEnum.assistant &&
      message.id === streamingMessageId;
    const branchInfo = branchInfoByMessage?.[message.id];
    let resolvedEditDisabledReason: string | null = null;
    if (!canEditParams) {
      resolvedEditDisabledReason = "Editing disabled by share policy.";
    } else if (waitingForResponse) {
      resolvedEditDisabledReason = "Wait for response to finish.";
    } else if (editDisabledReason) {
      resolvedEditDisabledReason = editDisabledReason;
    }
    const canEdit = Boolean(onEditMessage);
    const isEditing = editingMessageId === message.id;
    output.push(
      <ChatMessage
        key={message.id}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={isStreamingMessage}
        isSearchMatchActive={message.id === activeSearchMessageId}
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          message.id,
        )}
        onRedoMessage={onRedoMessage}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        isEditing={isEditing}
        editingBubbleWidthPx={isEditing ? editingBubbleWidthPx : null}
        interrupted={Boolean(interruptedAssistantMessageIds?.[message.id])}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        conversationSearchTerms={conversationSearchTerms}
        canEdit={canEdit}
        editDisabledReason={resolvedEditDisabledReason}
        onStartEdit={
          !canEdit || resolvedEditDisabledReason
            ? undefined
            : (bubbleWidthPx?: number) => {
                setEditingBubbleWidthPx(bubbleWidthPx ?? null);
                setEditingMessageId(message.id);
              }
        }
        onCancelEdit={() => {
          setEditingMessageId(null);
          setEditingBubbleWidthPx(null);
        }}
        onSaveEdit={
          !onEditMessage
            ? undefined
            : async (text, attachments) => {
                const result = await onEditMessage(
                  message.id,
                  text,
                  attachments,
                );
                if (result === true) {
                  setEditingMessageId(null);
                  setEditingBubbleWidthPx(null);
                }
                return result;
              }
        }
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />,
    );
    index += 1;
  }

  if (waitingForResponse && lastMessage?.role !== ChatRoleEnum.assistant) {
    const pendingMessageId = lastMessage?.id
      ? `pending-${lastMessage.id}`
      : "pending";
    const placeholderMessage: AssistantChatMessage = {
      id: pendingMessageId,
      role: ChatRoleEnum.assistant,
      content: [],
      tool_calls: null,
    };
    output.push(
      <ChatMessage
        key={placeholderMessage.id}
        message={placeholderMessage}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        isSearchMatchActive={placeholderMessage.id === activeSearchMessageId}
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          placeholderMessage.id,
        )}
        onRedoMessage={onRedoMessage}
        interrupted={false}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
      />,
    );
  }

  return output;
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  allMessagesForToolResults,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMatchIndex = null,
  conversationSearchTerms = [],
  className,
  contentClassName,
  scrollRef,
  editDisabledReason,
  onConversationSearchMatchCountChange,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: ChatMessageListProps) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSearchMessageId, setActiveSearchMessageId] = useState<
    string | null
  >(null);
  const setScrollContainerRef = useCallback(
    (nextNode: HTMLDivElement | null) => {
      internalScrollRef.current = nextNode;
      if (!scrollRef) {
        return;
      }
      if (typeof scrollRef === "function") {
        scrollRef(nextNode);
        return;
      }
      scrollRef.current = nextNode;
    },
    [scrollRef],
  );
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const toolResultMessages = allMessagesForToolResults ?? messages;
  const toolArgs = toolCallArguments ?? {};
  const wrapperClassName =
    `flex min-h-0 min-w-0 flex-1 flex-col-reverse overflow-x-hidden overflow-y-auto pr-1 ${className ?? ""}`.trim();
  const previousActiveSearchTargetRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const scrollContainer = internalScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const highlights = scrollContainer.querySelectorAll<HTMLElement>(
      'mark[data-chat-search-highlight="true"]',
    );
    highlights.forEach((highlight) => {
      highlight.removeAttribute("data-chat-search-highlight-target");
    });
    const searchMatchCount =
      conversationSearchTerms.length === 0 ? 0 : highlights.length;
    onConversationSearchMatchCountChange?.(searchMatchCount);
    if (searchMatchCount === 0 || activeSearchMatchIndex === null) {
      previousActiveSearchTargetRef.current = null;
      setActiveSearchMessageId(null);
      return;
    }
    const resolvedOccurrenceIndex = Math.min(
      Math.max(0, activeSearchMatchIndex),
      highlights.length - 1,
    );
    const activeHighlight = highlights[resolvedOccurrenceIndex] ?? null;
    activeHighlight?.setAttribute("data-chat-search-highlight-target", "true");
    const nextMessageId =
      activeHighlight
        ?.closest<HTMLElement>("[data-message-id]")
        ?.getAttribute("data-message-id") ?? null;
    setActiveSearchMessageId((current) =>
      current === nextMessageId ? current : nextMessageId,
    );
  }, [
    activeSearchMatchIndex,
    conversationSearchTerms,
    messages,
    onConversationSearchMatchCountChange,
  ]);

  useEffect(() => {
    if (
      activeSearchMatchIndex === null ||
      conversationSearchTerms.length === 0
    ) {
      previousActiveSearchTargetRef.current = null;
      return;
    }
    const activeSearchTargetKey = `${activeSearchMatchIndex}\u0000${conversationSearchTerms.join("\u0000")}`;
    if (previousActiveSearchTargetRef.current === activeSearchTargetKey) {
      return;
    }
    const scrollContainer = internalScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const target = scrollContainer.querySelector<HTMLElement>(
      'mark[data-chat-search-highlight-target="true"]',
    );
    if (!target) {
      previousActiveSearchTargetRef.current = null;
      return;
    }
    previousActiveSearchTargetRef.current = activeSearchTargetKey;
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeSearchMatchIndex, conversationSearchTerms, messages]);

  return (
    <div
      ref={setScrollContainerRef}
      className={wrapperClassName}
      data-chat-message-list-scroll-container="true"
    >
      <div className={contentClassName}>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolArgs}
          interruptedAssistantMessageIds={interruptedAssistantMessageIds}
          activeSearchMessageId={activeSearchMessageId}
          conversationSearchTerms={conversationSearchTerms}
          allMessages={toolResultMessages}
          editDisabledReason={editDisabledReason}
          onRedoMessage={onRedoMessage}
          onEditMessage={onEditMessage}
          onBranchSwitch={onBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
        />
      </div>
    </div>
  );
});

function buildToolCallContext(
  messages: Array<BaseChatMessageUnion>,
  toolCallArguments: Record<string, string>,
): ToolCallContext {
  const todoPayloadById: Record<string, TodoListPayload> = {};
  const questionPayloadById: Record<string, AskUserQuestionPayload> = {};
  const approvalPayloadById: Record<string, ApprovalPayload> = {};
  const todoOrder: string[] = [];

  for (const message of messages) {
    if (message.role !== ChatRoleEnum.assistant) {
      continue;
    }
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      const normalizedName = normalizeToolName(toolCall.function?.name);
      const resolvedArgs = resolveToolCallArguments(
        toolCall,
        toolCallArguments,
      );
      if (!normalizedName) {
        continue;
      }
      if (normalizedName === APPROVAL_TOOL_NAME) {
        const approvalPayload = parseApprovalPayload(resolvedArgs);
        if (!approvalPayload) {
          continue;
        }
        const approvalToolName = normalizeToolName(approvalPayload.toolName);
        if (approvalToolName === QUESTION_TOOL_NAME) {
          const questionPayload = parseAskUserQuestionPayload(
            approvalPayload.input,
          );
          if (questionPayload) {
            questionPayloadById[toolCall.id] = questionPayload;
          }
        } else {
          approvalPayloadById[toolCall.id] = approvalPayload;
        }
        continue;
      }
      if (normalizedName === TODO_TOOL_NAME) {
        const todoPayload = parseTodoPayload(resolvedArgs);
        if (todoPayload) {
          todoPayloadById[toolCall.id] = todoPayload;
          todoOrder.push(toolCall.id);
        }
        continue;
      }
      if (normalizedName === QUESTION_TOOL_NAME) {
        const questionPayload = parseAskUserQuestionPayload(resolvedArgs);
        if (questionPayload) {
          questionPayloadById[toolCall.id] = questionPayload;
        }
      }
    }
  }

  const latestTodoCallId = todoOrder.length
    ? todoOrder[todoOrder.length - 1]
    : null;
  return {
    todoPayloadById,
    questionPayloadById,
    approvalPayloadById,
    latestTodoCallId,
  };
}

function buildToolResultMap(
  messages: Array<BaseChatMessageUnion>,
): Record<string, ToolChatMessage> {
  const map: Record<string, ToolChatMessage> = {};
  for (const message of messages) {
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      map[message.tool_call_id] = message;
    }
  }
  return map;
}
