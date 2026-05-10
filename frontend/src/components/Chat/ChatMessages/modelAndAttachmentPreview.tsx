import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";

import {
  type Dispatch,
  type MutableRefObject,
  ReactNode,
  Ref,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { FiArchive, FiFileText, FiMusic, FiVideo } from "react-icons/fi";

import { IoImageOutline } from "react-icons/io5";

import { type Components } from "react-markdown";

import type { ChatMessageBranchInfo } from "state/actions/aiBranches";

import { getAttachmentPreviewKind } from "utils/attachmentPreview";

import { C } from "utils/c";

import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolCall,
  ToolChatMessage,
} from "utils/generatedTypes";

import { renderConversationSearchHighlightedText } from "../chatSearchHighlight";

import {
  type AnimatedStreamingCharacter,
  reconcileAnimatedStreamingCharacters,
} from "../streamingMarkdown";

import {
  type AttachmentUrlEntry,
  isAttachmentUrlStale,
} from "../useChatMessageAttachmentUrls";

import {
  PDF_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_CHAR_LIMIT,
  TEXT_PREVIEW_MAX_BYTES,
} from "./activityPreviewsAndAttachmentDialog";

export type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: "assistant" }
>;

export type NonAssistantChatMessage = Exclude<
  BaseChatMessageUnion,
  AssistantChatMessage
>;

export type ChatContentItem = AssistantChatMessage["content"][number];

export type ThinkingContentItem = Extract<
  ChatContentItem,
  { type: typeof C.LLM_THINKING }
>;

export type ToolResultValue = ToolChatMessage["result"] | string;

export type ToolResultContentEntry = NonNullable<
  ToolChatMessage["content"]
>[number];

export type ToolCallRenderEntry = {
  toolCall: ToolCall;
  isStreaming: boolean;
};

export type ThinkingRenderEntry = {
  item: ThinkingContentItem;
  messageId: string;
  itemIndex: number;
  timerRunKey: string;
  timestampMs: number | null;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

export type ActivityMessageContext = {
  message: AssistantChatMessage;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

export type ActivityTimelineEntry =
  | {
      kind: "thinking";
      key: string;
      thinkingEntry: ThinkingRenderEntry;
    }
  | {
      kind: ToolCallDisplayKind;
      key: string;
      messageId: string;
      toolEntry: ToolCallRenderEntry;
    };

export type ActivityPreviewData = {
  label: string;
  kind:
    | "none"
    | "thought"
    | "context"
    | "action"
    | "tool"
    | "terminal"
    | "subagent";
  thoughtText: string | null;
  thoughtActivityKey: string | null;
  hasStreamingThought: boolean;
  shouldScrambleTitle: boolean;
};

export type AssistantDisplayItem = {
  item: ChatContentItem;
  fullIndex: number;
};

export type AssistantContentPartition = {
  thinkingItems: ThinkingContentItem[];
  displayItems: AssistantDisplayItem[];
};

export type ToolCallDisplayKind =
  | "tool"
  | "action"
  | "compaction"
  | "terminal"
  | "subagent";

export type StructuredOutputOwner = "action" | "tool" | "terminal" | "subagent";

export type ActivityToolLikeRowKind = StructuredOutputOwner;

export const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];

export const IDLE_SPINNER_DELAY_MS = 1000;

export const CHAT_BUBBLE_MAX_WIDTH_CLASS = "max-w-[min(90%,820px)]";

export const CHAT_MARKDOWN_BASE_CLASS =
  "prose prose-sm max-w-full prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-snug prose-headings:mt-5 prose-headings:mb-2 prose-h1:text-[1.05rem] prose-h2:text-[1rem] prose-h3:text-[0.95rem] prose-h4:text-[0.9rem] prose-p:my-0 prose-p:leading-[1.45] prose-ul:my-1 prose-ol:my-1 prose-ul:pl-5 prose-ol:pl-5 prose-ul:leading-[1.45] prose-ol:leading-[1.45] prose-li:my-0 prose-li:leading-[1.45] prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 prose-pre:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p+p]:mt-2.5 [&_p+ul]:mt-2 [&_p+ol]:mt-2 [&_ul+p]:mt-2.5 [&_ol+p]:mt-2.5 [&_li+li]:mt-0.5 [&_li_p]:my-0 [&_*]:break-words";

export const ASSISTANT_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;

export const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;

export const THOUGHT_PREVIEW_MARKDOWN_CLASS =
  "prose prose-sm max-w-none text-[9px] leading-[1.35] text-setta-400 dark:prose-invert dark:text-setta-400/90 prose-headings:my-0 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-[10px] prose-h2:text-[9.5px] prose-h3:text-[9px] prose-h4:text-[9px] prose-p:my-0 prose-p:text-[9px] prose-p:leading-[1.35] prose-ul:my-0.5 prose-ol:my-0.5 prose-ul:pl-3.5 prose-ol:pl-3.5 prose-ul:text-[9px] prose-ol:text-[9px] prose-li:my-0 prose-li:text-[9px] prose-li:leading-[1.35] prose-code:before:hidden prose-code:after:hidden prose-code:text-[8px] prose-pre:my-1 prose-pre:px-2 prose-pre:py-1.5 prose-pre:text-[8px] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_li+li]:mt-0.5 [&_*]:break-words";

export const THOUGHT_PREVIEW_TAIL_CLASS =
  "whitespace-pre-wrap break-words text-[9px] leading-[1.35] text-setta-400 dark:text-setta-400/90";

export const TOOL_CALL_RAIL_GRID_CLASS = "grid-cols-[1.75rem_minmax(0,1fr)]";

export const TOOL_CALL_RAIL_BACKGROUND_CLASS =
  "bg-setta-100/75 dark:bg-setta-800/75";

export const ACTIVITY_ROW_HOVER_CLASS =
  "hover:bg-setta-100/35 dark:hover:bg-setta-900/55";

export const ACTIVITY_CHILD_TRIGGER_CLASS =
  "bg-setta-50/95 hover:bg-setta-100/95 dark:bg-setta-875 dark:hover:bg-setta-850";

export const STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX = 260;

export const STRUCTURED_OUTPUT_MIN_HEIGHT_PX = 90;

export const STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO = 0.8;

export const STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS =
  "group/resize absolute inset-x-0 bottom-0 z-[1] h-3 translate-y-1/2 cursor-row-resize touch-none opacity-0 transition-opacity data-[resizing=true]:opacity-100 group-hover/structured-output-pane:opacity-100 group-focus-within/structured-output-pane:opacity-100";

export const STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS =
  "absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-setta-200/90 transition-colors group-hover/resize:bg-blue-400 group-focus-visible/resize:bg-blue-400 dark:bg-setta-700/90 dark:group-hover/resize:bg-blue-400 dark:group-focus-visible/resize:bg-blue-400";

export const ACTIVITY_ACCORDION_CONTENT_CLASS =
  "overflow-hidden data-[state=closed]:hidden data-[state=open]:block";

export const ASSISTANT_ACTIVITY_CONTENT_CLASS = `${ACTIVITY_ACCORDION_CONTENT_CLASS} pt-1`;

export const TOOL_ROW_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;

export const ASSISTANT_ACTIVITY_PARENT_CLASS =
  "w-full overflow-hidden bg-transparent";

export const ASSISTANT_ACTIVITY_TRIGGER_CLASS = `group group/chat-activity-parent flex w-full flex-col cursor-pointer items-stretch text-left transition-colors ${ACTIVITY_ROW_HOVER_CLASS} [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;

export const ACTIVITY_COUNT_BADGE_CLASS =
  "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200";

export const ACTIVITY_COPY_BUTTON_BASE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-setta-500 transition-colors hover:bg-setta-200/80 hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:text-setta-300 dark:hover:bg-setta-700 dark:hover:text-setta-100";

export const ACTIVITY_SECTION_COPY_BUTTON_CLASS = `${ACTIVITY_COPY_BUTTON_BASE_CLASS} bg-setta-100/90 dark:bg-setta-800/85`;

export const ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS = `${ACTIVITY_SECTION_COPY_BUTTON_CLASS} opacity-0 pointer-events-none transition-opacity group-hover/chat-activity-row:opacity-100 group-hover/chat-activity-row:pointer-events-auto group-focus-within/chat-activity-row:opacity-100 group-focus-within/chat-activity-row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto`;

export const ACTIVITY_PARENT_HOVER_META_CLASS =
  "pointer-events-none absolute right-6 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-end gap-x-1 gap-y-0.5 opacity-0 transition-opacity group-hover/chat-activity-parent:opacity-100 group-focus-within/chat-activity-parent:opacity-100";

export const ACTIVITY_ITEM_HOVER_META_CLASS =
  "pointer-events-none absolute right-6 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-end gap-x-1 gap-y-0.5 opacity-0 transition-opacity group-hover/chat-activity-row:opacity-100 group-focus-within/chat-activity-row:opacity-100";

export const ACTIVITY_PARENT_LABEL_CLASS =
  "min-w-0 flex-1 pr-5 transition-[padding-right] group-hover/chat-activity-parent:pr-[12rem] group-focus-within/chat-activity-parent:pr-[12rem]";

export const ACTIVITY_ITEM_LABEL_CLASS =
  "min-w-0 flex-1 pr-5 transition-[padding-right] group-hover/chat-activity-row:pr-[8.5rem] group-focus-within/chat-activity-row:pr-[8.5rem]";

export const ACTIVITY_THOUGHT_TOP_ONLY_MASK =
  "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)";

export const COUNT_BADGE_STEP_ANIMATION_MS = 120;

export const COUNT_BADGE_STEP_PAUSE_MS = 24;

export const CONTEXT_COMPACTION_TOOL_NAME = "compacted";

export const ASSISTANT_ACTIVITY_DETAILS_VALUE = "assistant-activity-details";

export const ACTION_TOOL_NAMES = new Set<string>([
  "command_execution",
  "file_change",
  "webSearch",
  "imageView",
  "collabToolCall",
  "enteredReviewMode",
  "exitedReviewMode",
]);

export const ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES = new Set<string>([
  "command_execution",
]);

export const ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES = new Set<string>([
  "setta__run_agent_profile",
  "run_agent_profile",
]);

export const ACTIVITY_ROW_DETAILS_VALUE = "details";

export type AttachmentTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

export function createTextPreviewState(
  id: string,
  entry: AttachmentTextPreview,
  setTextPreviewMap: Dispatch<
    SetStateAction<Record<string, AttachmentTextPreview>>
  >,
) {
  setTextPreviewMap((prev) => ({
    ...prev,
    [id]: entry,
  }));
}

export function resolveOversizeTextPreview(
  attachment: ChatFileAttachment,
): AttachmentTextPreview | null {
  if (
    attachment.size === null ||
    attachment.size === undefined ||
    attachment.size <= TEXT_PREVIEW_MAX_BYTES
  ) {
    return null;
  }
  return {
    text: "",
    truncated: true,
    isLoading: false,
    error: "Preview disabled for large files.",
  };
}

export async function resolveAttachmentUrlEntry({
  attachment,
  attachmentUrlMap,
  requestAttachmentUrls,
}: {
  attachment: ChatFileAttachment;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
}): Promise<AttachmentUrlEntry | null> {
  const existing = attachmentUrlMap[attachment.id];
  if (existing && !isAttachmentUrlStale(existing, Date.now())) {
    return existing;
  }
  const refreshed = await requestAttachmentUrls([attachment], { force: true });
  return refreshed[attachment.id] ?? attachmentUrlMap[attachment.id] ?? null;
}

export function buildUnavailableTextPreview(): AttachmentTextPreview {
  return {
    text: "",
    truncated: false,
    isLoading: false,
    error: "Preview unavailable.",
  };
}

export async function fetchAttachmentTextPreview(
  url: string,
): Promise<AttachmentTextPreview> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return buildUnavailableTextPreview();
  }
  if (!response.ok) {
    return buildUnavailableTextPreview();
  }
  const text = await response.text();
  const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
  return {
    text: truncated ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT) : text,
    truncated,
    isLoading: false,
    error: null,
  };
}

export function renderAttachmentLoadingState(icon: ReactNode): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
      <div>{icon}</div>
      <span>Loading preview...</span>
    </div>
  );
}

export function renderAttachmentTextPreview(
  preview: AttachmentTextPreview,
): ReactNode {
  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="h-full w-full overflow-hidden rounded-md border border-setta-200/60 bg-white/70 dark:border-setta-700 dark:bg-setta-900/60">
        <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
          {preview.text || ""}
        </pre>
      </div>
      {preview.truncated ? (
        <div className="text-[11px] text-setta-400">Preview truncated.</div>
      ) : null}
    </div>
  );
}

export function renderImageAttachmentPreview({
  attachment,
  attachmentUrl,
  onImageError,
}: {
  attachment: ChatFileAttachment;
  attachmentUrl: string;
  onImageError: (attachment: ChatFileAttachment) => void;
}): ReactNode {
  if (!attachmentUrl) {
    return renderAttachmentLoadingState(<IoImageOutline size={40} />);
  }
  return (
    <div className="relative h-full w-full">
      <img
        src={attachmentUrl}
        alt={attachment.name}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => onImageError(attachment)}
      />
    </div>
  );
}

export function renderTextAttachmentPreviewCard({
  attachment,
  preview,
  renderFileCard,
}: {
  attachment: ChatFileAttachment;
  preview: AttachmentTextPreview | undefined;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (preview && !preview.isLoading && !preview.error) {
    return renderAttachmentTextPreview(preview);
  }
  return renderFileCard(
    attachment,
    <FiFileText size={40} />,
    preview?.error ?? "Loading preview...",
  );
}

export function renderPdfAttachmentPreview({
  attachment,
  attachmentUrl,
  renderFileCard,
}: {
  attachment: ChatFileAttachment;
  attachmentUrl: string;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (
    attachment.size !== null &&
    attachment.size !== undefined &&
    attachment.size > PDF_PREVIEW_MAX_BYTES
  ) {
    return renderFileCard(
      attachment,
      <FiFileText size={40} />,
      "Preview disabled for large PDFs.",
    );
  }
  if (!attachmentUrl) {
    return renderFileCard(
      attachment,
      <FiFileText size={40} />,
      "Preview unavailable.",
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      <iframe
        src={attachmentUrl}
        title={attachment.name}
        className="h-full w-full"
      />
    </div>
  );
}

export function renderAudioAttachmentPreview({
  attachment,
  attachmentUrl,
  renderFileCard,
}: {
  attachment: ChatFileAttachment;
  attachmentUrl: string;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (!attachmentUrl) {
    return renderFileCard(
      attachment,
      <FiMusic size={40} />,
      "Preview unavailable.",
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      <audio controls preload="metadata" className="w-full max-w-[720px]">
        <source src={attachmentUrl} />
      </audio>
    </div>
  );
}

export function renderVideoAttachmentPreview({
  attachment,
  attachmentUrl,
  renderFileCard,
}: {
  attachment: ChatFileAttachment;
  attachmentUrl: string;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (!attachmentUrl) {
    return renderFileCard(
      attachment,
      <FiVideo size={40} />,
      "Preview unavailable.",
    );
  }
  return (
    <div className="relative h-full w-full">
      <video controls preload="metadata" className="h-full w-full">
        <source src={attachmentUrl} />
      </video>
    </div>
  );
}

export function renderFallbackAttachmentPreview({
  attachment,
  previewKind,
  renderFileCard,
}: {
  attachment: ChatFileAttachment;
  previewKind: ReturnType<typeof getAttachmentPreviewKind>;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (previewKind === "archive") {
    return renderFileCard(
      attachment,
      <FiArchive size={40} />,
      "Archive preview not available.",
    );
  }
  return renderFileCard(
    attachment,
    previewKind === "image" ? (
      <IoImageOutline size={40} />
    ) : (
      <FiFileText size={40} />
    ),
    previewKind === "image" ? "Loading preview..." : "Preview not available.",
  );
}

export function renderAttachmentPreviewContent({
  attachment,
  attachmentUrl,
  textPreview,
  onImageError,
  renderFileCard,
}: {
  attachment: ChatFileAttachment | undefined;
  attachmentUrl: string;
  textPreview: AttachmentTextPreview | undefined;
  onImageError: (attachment: ChatFileAttachment) => void;
  renderFileCard: (
    attachment: ChatFileAttachment,
    icon: ReactNode,
    description?: string,
  ) => ReactNode;
}): ReactNode {
  if (!attachment) {
    return renderAttachmentLoadingState(<IoImageOutline size={40} />);
  }
  const previewKind = getAttachmentPreviewKind(attachment);
  if (previewKind === "image") {
    return renderImageAttachmentPreview({
      attachment,
      attachmentUrl,
      onImageError,
    });
  }
  if (previewKind === "text") {
    return renderTextAttachmentPreviewCard({
      attachment,
      preview: textPreview,
      renderFileCard,
    });
  }
  if (previewKind === "pdf") {
    return renderPdfAttachmentPreview({
      attachment,
      attachmentUrl,
      renderFileCard,
    });
  }
  if (previewKind === "audio") {
    return renderAudioAttachmentPreview({
      attachment,
      attachmentUrl,
      renderFileCard,
    });
  }
  if (previewKind === "video") {
    return renderVideoAttachmentPreview({
      attachment,
      attachmentUrl,
      renderFileCard,
    });
  }
  return renderFallbackAttachmentPreview({
    attachment,
    previewKind,
    renderFileCard,
  });
}

export type AssistantActivityChildAccordionControl = {
  defaultOpen: boolean;
  expandAllSignal: number;
  collapseAllSignal: number;
  suppressSummaries: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
};

export type ChatMessageListProps = {
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

export function assignScrollRef(
  scrollRef: ChatMessageListProps["scrollRef"],
  nextNode: HTMLDivElement | null,
) {
  if (!scrollRef) {
    return;
  }
  if (typeof scrollRef === "function") {
    scrollRef(nextNode);
    return;
  }
  scrollRef.current = nextNode;
}

export function clearActiveSearchHighlightTargets(
  scrollContainer: HTMLDivElement,
) {
  const highlights = scrollContainer.querySelectorAll<HTMLElement>(
    'mark[data-chat-search-highlight="true"]',
  );
  highlights.forEach((highlight) => {
    highlight.removeAttribute("data-chat-search-highlight-target");
  });
  return highlights;
}

export function resolveSearchMatchCount(args: {
  conversationSearchTerms: Array<string>;
  highlights: NodeListOf<HTMLElement>;
}): number {
  return args.conversationSearchTerms.length === 0 ? 0 : args.highlights.length;
}

export function resolveActiveSearchMessageId(
  activeHighlight: HTMLElement | null,
): string | null {
  return (
    activeHighlight
      ?.closest<HTMLElement>("[data-message-id]")
      ?.getAttribute("data-message-id") ?? null
  );
}

export function syncActiveSearchHighlight({
  scrollContainer,
  conversationSearchTerms,
  activeSearchMatchIndex,
  previousActiveSearchTargetRef,
  onConversationSearchMatchCountChange,
  setActiveSearchMessageId,
}: {
  scrollContainer: HTMLDivElement;
  conversationSearchTerms: Array<string>;
  activeSearchMatchIndex: number | null;
  previousActiveSearchTargetRef: MutableRefObject<string | null>;
  onConversationSearchMatchCountChange?: (count: number) => void;
  setActiveSearchMessageId: Dispatch<SetStateAction<string | null>>;
}) {
  const highlights = clearActiveSearchHighlightTargets(scrollContainer);
  const searchMatchCount = resolveSearchMatchCount({
    conversationSearchTerms,
    highlights,
  });
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
  const nextMessageId = resolveActiveSearchMessageId(activeHighlight);
  setActiveSearchMessageId((current) =>
    current === nextMessageId ? current : nextMessageId,
  );
}

export type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
  highlightTerms?: Array<string>;
};

export const CHAT_MARKDOWN_COMPONENTS: Components = {
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

export function buildInitialAnimatedStreamingCharacters(
  text: string,
): Array<AnimatedStreamingCharacter> {
  let nextId = 0;
  return Array.from(text || "").map((value) => ({
    id: nextId++,
    value,
    animate: false,
  }));
}

export function useAnimatedStreamingCharacters(
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

export function useStreamingCommitAnimationClass(
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

export function useStreamingGrowthAnimation(
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

export function StreamingTailText({
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
