import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";
import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import {
  type Dispatch,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  ReactNode,
  type PointerEvent as ReactPointerEvent,
  Ref,
  type SetStateAction,
  memo,
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
  FiMusic,
  FiRotateCcw,
  FiTerminal,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";
import { IoMdCheckmark, IoMdClose } from "react-icons/io";
import { IoImageOutline } from "react-icons/io5";
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
import {
  getAttachmentPreviewKind,
  isImageAttachment,
  isTextAttachment,
} from "utils/attachmentPreview";
import { formatBytes } from "utils/attachments";
import { C } from "utils/c";
import {
  APPROVAL_TOOL_NAME,
  type AskUserQuestionPayload,
  QUESTION_TOOL_NAME,
  normalizeToolName,
  parseAnswers,
  parseApprovalPayload,
  parseAskUserQuestionPayload,
  resolveToolCallArguments,
} from "utils/claudeTools";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolCall,
  ToolChatMessage,
} from "utils/generatedTypes";
import { ApprovalCard } from "./ApprovalCard";
import { ChatMessageEditor } from "./ChatMessageEditor";
import { QuestionCard } from "./QuestionCard";
import {
  getConversationSearchRehypePlugins,
  renderConversationSearchHighlightedText,
} from "./chatSearchHighlight";
import {
  type StructuredOutputPart,
  type StructuredOutputPayload,
  resolveStructuredOutputFallbackPayload,
  resolveStructuredOutputPayload,
} from "./chatStructuredOutput";
import {
  resolveCollapsedThinkingActivityLabel,
  resolveStreamingThinkingHeadline,
  resolveThinkingSummaryHeadline,
  resolveThinkingSummaryMeta,
  useScrambledLabel,
} from "./chatThinkingSummary";
import {
  ChatMessageTimestampFooter,
  ChatTimestamp,
  parseIsoTimestampMs,
  resolveActivityTimestampMs,
  resolveDurationLabel,
  resolveMessageCreatedAtMs,
  useRunElapsedDuration,
} from "./chatTiming";
import {
  type AnimatedStreamingCharacter,
  reconcileAnimatedStreamingCharacters,
  splitStreamingMarkdownText,
} from "./streamingMarkdown";
import {
  type AttachmentUrlEntry,
  isAttachmentUrlStale,
  useChatMessageAttachmentUrls,
} from "./useChatMessageAttachmentUrls";
import { useTypewriterEffect } from "./useTypewriterEffect";

type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: "assistant" }
>;
type NonAssistantChatMessage = Exclude<
  BaseChatMessageUnion,
  AssistantChatMessage
>;
type ChatContentItem = AssistantChatMessage["content"][number];
type ThinkingContentItem = Extract<
  ChatContentItem,
  { type: typeof C.LLM_THINKING }
>;

type ToolResultValue = ToolChatMessage["result"] | string;
type ToolCallRenderEntry = {
  toolCall: ToolCall;
  isStreaming: boolean;
};

type ThinkingRenderEntry = {
  item: ThinkingContentItem;
  messageId: string;
  itemIndex: number;
  timerRunKey: string;
  timestampMs: number | null;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

type ActivityMessageContext = {
  message: AssistantChatMessage;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

type ActivityTimelineEntry =
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

type ActivityPreviewData = {
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

type AssistantDisplayItem = {
  item: ChatContentItem;
  fullIndex: number;
};

type AssistantContentPartition = {
  thinkingItems: ThinkingContentItem[];
  displayItems: AssistantDisplayItem[];
};

type ToolCallDisplayKind =
  | "tool"
  | "action"
  | "compaction"
  | "terminal"
  | "subagent";
type StructuredOutputOwner = "action" | "tool" | "terminal" | "subagent";
type ActivityToolLikeRowKind = StructuredOutputOwner;

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;
const CHAT_BUBBLE_MAX_WIDTH_CLASS = "max-w-[min(90%,820px)]";
const ASSISTANT_BUBBLE_MAX_WIDTH_CLASS = CHAT_BUBBLE_MAX_WIDTH_CLASS;
const CHAT_MARKDOWN_BASE_CLASS =
  "prose prose-sm max-w-full prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-snug prose-headings:mt-5 prose-headings:mb-2 prose-h1:text-[1.05rem] prose-h2:text-[1rem] prose-h3:text-[0.95rem] prose-h4:text-[0.9rem] prose-p:my-0 prose-p:leading-[1.45] prose-ul:my-1 prose-ol:my-1 prose-ul:pl-5 prose-ol:pl-5 prose-ul:leading-[1.45] prose-ol:leading-[1.45] prose-li:my-0 prose-li:leading-[1.45] prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 prose-pre:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p+p]:mt-2.5 [&_p+ul]:mt-2 [&_p+ol]:mt-2 [&_ul+p]:mt-2.5 [&_ol+p]:mt-2.5 [&_li+li]:mt-0.5 [&_li_p]:my-0 [&_*]:break-words";
const ASSISTANT_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;
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
const STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX = 260;
const STRUCTURED_OUTPUT_MIN_HEIGHT_PX = 90;
const STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO = 0.8;
const STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS =
  "group/resize absolute inset-x-0 bottom-0 z-[1] h-3 translate-y-1/2 cursor-row-resize touch-none opacity-0 transition-opacity data-[resizing=true]:opacity-100 group-hover/structured-output-pane:opacity-100 group-focus-within/structured-output-pane:opacity-100";
const STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS =
  "absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-setta-200/90 transition-colors group-hover/resize:bg-blue-400 group-focus-visible/resize:bg-blue-400 dark:bg-setta-700/90 dark:group-hover/resize:bg-blue-400 dark:group-focus-visible/resize:bg-blue-400";
const ACTIVITY_ACCORDION_CONTENT_CLASS =
  "overflow-hidden data-[state=closed]:hidden data-[state=open]:block";
const ASSISTANT_ACTIVITY_CONTENT_CLASS = `${ACTIVITY_ACCORDION_CONTENT_CLASS} pt-1`;
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
const COUNT_BADGE_STEP_ANIMATION_MS = 120;
const COUNT_BADGE_STEP_PAUSE_MS = 24;
const CONTEXT_COMPACTION_TOOL_NAME = "compacted";
const ASSISTANT_ACTIVITY_DETAILS_VALUE = "assistant-activity-details";
const ACTION_TOOL_NAMES = new Set<string>([
  "command_execution",
  "file_change",
  "webSearch",
  "imageView",
  "collabToolCall",
  "enteredReviewMode",
  "exitedReviewMode",
]);
const ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES = new Set<string>([
  "command_execution",
]);
const ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES = new Set<string>([
  "setta__run_agent_profile",
  "run_agent_profile",
]);
const ACTIVITY_ROW_DETAILS_VALUE = "details";

type AttachmentTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

function createTextPreviewState(
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

function resolveOversizeTextPreview(
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

async function resolveAttachmentUrlEntry({
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

function buildUnavailableTextPreview(): AttachmentTextPreview {
  return {
    text: "",
    truncated: false,
    isLoading: false,
    error: "Preview unavailable.",
  };
}

async function fetchAttachmentTextPreview(
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

function renderAttachmentLoadingState(icon: ReactNode): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
      <div>{icon}</div>
      <span>Loading preview...</span>
    </div>
  );
}

function renderAttachmentTextPreview(
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

function renderImageAttachmentPreview({
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

function renderTextAttachmentPreviewCard({
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

function renderPdfAttachmentPreview({
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

function renderAudioAttachmentPreview({
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

function renderVideoAttachmentPreview({
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

function renderFallbackAttachmentPreview({
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

function renderAttachmentPreviewContent({
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

function assignScrollRef(
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

function clearActiveSearchHighlightTargets(scrollContainer: HTMLDivElement) {
  const highlights = scrollContainer.querySelectorAll<HTMLElement>(
    'mark[data-chat-search-highlight="true"]',
  );
  highlights.forEach((highlight) => {
    highlight.removeAttribute("data-chat-search-highlight-target");
  });
  return highlights;
}

function resolveSearchMatchCount(args: {
  conversationSearchTerms: Array<string>;
  highlights: NodeListOf<HTMLElement>;
}): number {
  return args.conversationSearchTerms.length === 0 ? 0 : args.highlights.length;
}

function resolveActiveSearchMessageId(
  activeHighlight: HTMLElement | null,
): string | null {
  return (
    activeHighlight
      ?.closest<HTMLElement>("[data-message-id]")
      ?.getAttribute("data-message-id") ?? null
  );
}

function syncActiveSearchHighlight({
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

type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
  highlightTerms?: Array<string>;
};

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

function formatToolArgs(args: unknown) {
  if (!args) return "{}";
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function extractNonEmptyStringArg(args: unknown, key: string): string | null {
  if (!isRecord(args)) {
    return null;
  }
  const value = args[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveToolDisplayName(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string | null {
  const toolResult = toolResultsById[entry.toolCall.id];
  const fromResult = normalizeToolName(toolResult?.tool_name);
  if (fromResult) {
    return fromResult;
  }
  return normalizeToolName(entry.toolCall.function?.name);
}

function resolveToolRawName(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string {
  const toolResult = toolResultsById[entry.toolCall.id];
  if (
    typeof toolResult?.tool_name === "string" &&
    toolResult.tool_name.trim()
  ) {
    return toolResult.tool_name.trim();
  }
  if (
    typeof entry.toolCall.function?.name === "string" &&
    entry.toolCall.function.name.trim()
  ) {
    return entry.toolCall.function.name.trim();
  }
  return "";
}

function resolveToolCallDisplayKind(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): ToolCallDisplayKind {
  const runtimeDisplayKind = resolveActiveRuntimeDisplayKind(
    entry,
    toolResultsById,
  );
  if (runtimeDisplayKind) {
    return runtimeDisplayKind;
  }
  const normalizedName = resolveToolDisplayName(entry, toolResultsById);
  if (normalizedName === CONTEXT_COMPACTION_TOOL_NAME) {
    return "compaction";
  }
  if (normalizedName && ACTION_TOOL_NAMES.has(normalizedName)) {
    return "action";
  }
  const rawName = resolveToolRawName(entry, toolResultsById);
  if (rawName.startsWith("mcp__")) {
    return "action";
  }
  return "tool";
}

function resolveRuntimeToolCategory(
  toolName: string | null,
): "terminal" | "subagent" | null {
  if (!toolName) {
    return null;
  }
  const normalizedToolName = normalizeToolName(toolName);
  if (!normalizedToolName) {
    return null;
  }
  const lowerCaseToolName = normalizedToolName.toLowerCase();
  if (ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES.has(lowerCaseToolName)) {
    return "terminal";
  }
  if (ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES.has(lowerCaseToolName)) {
    return "subagent";
  }
  return null;
}

function resolveActiveRuntimeDisplayKind(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): "terminal" | "subagent" | null {
  if (!entry.isStreaming) {
    return null;
  }
  if (toolResultsById[entry.toolCall.id]) {
    return null;
  }
  return resolveRuntimeToolCategory(
    resolveToolDisplayName(entry, toolResultsById),
  );
}

function hashStringToBase36(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function resolveThinkingTimerRunKey({
  messageId,
  itemIndex,
  item,
}: {
  messageId: string;
  itemIndex: number;
  item: ThinkingContentItem;
}): string {
  const signature = item.signature?.trim();
  if (signature && signature.length > 0) {
    return `thinking-signature-${hashStringToBase36(signature)}`;
  }
  return `thinking-${messageId}-${itemIndex}`;
}

function buildActivityTimelineEntries(
  messageContexts: ActivityMessageContext[],
  toolResultsById: Record<string, ToolChatMessage>,
): ActivityTimelineEntry[] {
  const timelineEntries: ActivityTimelineEntry[] = [];
  for (const messageContext of messageContexts) {
    const { message, isStreaming, wasInterrupted } = messageContext;
    const { thinkingItems, displayItems } = partitionAssistantContent(
      message.content,
    );
    const thinkingIsStreaming =
      isStreaming && !hasMeaningfulAssistantDisplayItems(displayItems);
    const thinkingTimestampMs = resolveMessageCreatedAtMs(message);
    for (let itemIndex = 0; itemIndex < thinkingItems.length; itemIndex += 1) {
      const item = thinkingItems[itemIndex];
      if (!item) {
        continue;
      }
      timelineEntries.push({
        kind: "thinking",
        key: `${message.id}-thinking-${itemIndex}`,
        thinkingEntry: {
          item,
          messageId: message.id,
          itemIndex,
          timerRunKey: resolveThinkingTimerRunKey({
            messageId: message.id,
            itemIndex,
            item,
          }),
          timestampMs: thinkingTimestampMs,
          isStreaming: thinkingIsStreaming,
          wasInterrupted,
        },
      });
    }
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      const toolEntry: ToolCallRenderEntry = { toolCall, isStreaming };
      timelineEntries.push({
        kind: resolveToolCallDisplayKind(toolEntry, toolResultsById),
        key: toolCall.id,
        messageId: message.id,
        toolEntry,
      });
    }
  }
  return timelineEntries;
}

function resolveActionLabel(name: string, args: unknown): string {
  const normalized = normalizeToolName(name) ?? name;
  if (normalized === "command_execution") {
    const command = extractNonEmptyStringArg(args, "command");
    if (command) {
      return command;
    }
    return "Run command";
  }
  if (normalized === "file_change") {
    const path =
      extractNonEmptyStringArg(args, "path") ??
      extractNonEmptyStringArg(args, "filePath");
    if (path) {
      return `Edit ${path}`;
    }
    return "Edit file";
  }
  if (name.startsWith("mcp__")) {
    return `MCP ${name.slice("mcp__".length)}`;
  }
  return normalized || "Action";
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

function resolveDiffTextFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const diff = value.diff;
  if (typeof diff !== "string") {
    return null;
  }
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return diff;
}

function resolveActionIconFromOperation(
  operation: string | null,
): ReactNode | null {
  if (!operation) {
    return null;
  }
  if (/(delete|remove|unlink|rm)/u.test(operation)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (/(read|view|list|search|find)/u.test(operation)) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  if (
    /(edit|write|update|patch|append|create|insert|replace)/u.test(operation)
  ) {
    return <FiEdit3 size={12} className="min-w-4" />;
  }
  return null;
}

function isDeletedFileChange(
  normalizedName: string,
  args: unknown,
  result: ToolResultValue | undefined,
): boolean {
  if (normalizedName !== "file_change") {
    return false;
  }
  return [args, result].some((value) =>
    diffRepresentsDeletion(resolveDiffTextFromUnknown(value) ?? ""),
  );
}

function resolveActionIconFromToolName(
  normalizedName: string,
): ReactNode | null {
  if (normalizedName === "command_execution") {
    return <FiTerminal size={13} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_DELETE_ACTION_NAMES)) {
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
  return null;
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
  const operationIcon = resolveActionIconFromOperation(
    resolveActionOperation(args),
  );
  if (operationIcon) {
    return operationIcon;
  }
  if (isDeletedFileChange(normalizedName, args, result)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  return (
    resolveActionIconFromToolName(normalizedName) ?? (
      <PiWrenchFill size={13} className="min-w-4" />
    )
  );
}

function resolveToolResultDisplay(
  result: ToolResultValue | undefined,
): string | null {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (trimmed.length > 0) {
      return result;
    }
    return null;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (result && typeof result === "object") {
    return formatToolArgs(result);
  }
  return null;
}

function resolveCompactionSummaryText(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
  toolCallArguments: Record<string, string>,
): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const summaryText = resolveCompactionSummaryEntryText({
      entry,
      toolResultsById,
      toolCallArguments,
    });
    if (summaryText) {
      return summaryText;
    }
  }
  return null;
}

function resolveCompactionSummaryEntryText(args: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string | null {
  const toolResult = args.toolResultsById[args.entry.toolCall.id];
  const resultDisplay = resolveToolResultDisplay(formatToolResult(toolResult));
  if (resultDisplay) {
    return resultDisplay;
  }
  const argsFromMessage = args.entry.toolCall.function?.arguments;
  if (isRecord(argsFromMessage) && Object.keys(argsFromMessage).length > 0) {
    return formatToolArgs(argsFromMessage);
  }
  const pendingArgs = args.toolCallArguments[args.entry.toolCall.id];
  if (pendingArgs && pendingArgs.trim().length > 0) {
    return pendingArgs;
  }
  return null;
}

function resolveActionEntryLabel(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
  toolCallArguments: Record<string, string>,
): string {
  const toolCall = entry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  const rawToolName =
    toolResult?.tool_name || toolCall.function?.name || `Action ${toolCall.id}`;
  const argsToDisplay = resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  return resolveActionLabel(rawToolName, argsToDisplay);
}

function resolveToolEntryLabel(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string {
  const latestResult = toolResultsById[entry.toolCall.id];
  return (
    latestResult?.tool_name ||
    entry.toolCall.function?.name ||
    `Tool call ${entry.toolCall.id}`
  );
}

function resolveSubagentEntryLabel({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const toolCall = entry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  const rawToolName =
    toolResult?.tool_name ||
    toolCall.function?.name ||
    `Subagent ${toolCall.id}`;
  const argsToDisplay = resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  const profileId = extractNonEmptyStringArg(argsToDisplay, "profileId");
  if (profileId) {
    return profileId;
  }
  return normalizeToolName(rawToolName) ?? rawToolName;
}

function resolveDisplayArgsForToolCallEntry({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): unknown {
  const argsFromResult = toolResult?.arguments;
  if (argsFromResult && Object.keys(argsFromResult).length > 0) {
    return argsFromResult;
  }
  return resolveToolCallArguments(toolCall, toolCallArguments);
}

function resolveCompactionEntryLabel({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  return (
    resolveCompactionSummaryText([entry], toolResultsById, toolCallArguments) ??
    "Compaction completed."
  );
}

function resolveLatestThoughtPreview(
  timelineEntries: ActivityTimelineEntry[],
): { thoughtActivityKey: string | null; thoughtText: string | null } {
  for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const thoughtText = entry.thinkingEntry.item.thinking.trim();
    if (thoughtText.length > 0) {
      return {
        thoughtActivityKey: entry.key,
        thoughtText,
      };
    }
  }
  return {
    thoughtActivityKey: null,
    thoughtText: null,
  };
}

function resolveHasStreamingThought(
  timelineEntries: ActivityTimelineEntry[],
): boolean {
  return timelineEntries.some(
    (entry) => entry.kind === "thinking" && entry.thinkingEntry.isStreaming,
  );
}

function resolveThinkingPreviewHeadline(entry: ThinkingRenderEntry): {
  headline: string | null;
  shouldScramble: boolean;
} {
  if (entry.isStreaming) {
    const streamingHeadline = resolveStreamingThinkingHeadline({
      content: entry.item.thinking,
      summary: entry.item.summary,
    });
    if (streamingHeadline) {
      return { headline: streamingHeadline, shouldScramble: false };
    }
    return { headline: null, shouldScramble: true };
  }
  const summaryMeta = resolveThinkingSummaryMeta({
    content: entry.item.thinking,
    summary: entry.item.summary,
    isStreaming: entry.isStreaming,
  });
  if (summaryMeta.hasTitle) {
    return { headline: summaryMeta.headline, shouldScramble: false };
  }
  return { headline: null, shouldScramble: false };
}

function resolveFallbackThinkingHeadline(
  timelineEntries: ActivityTimelineEntry[],
  startIndex: number,
): string | null {
  for (let index = startIndex; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const nextHeadline = resolveThinkingPreviewHeadline(entry.thinkingEntry);
    if (nextHeadline.headline) {
      return nextHeadline.headline;
    }
  }
  return null;
}

type ActivityPreviewBase = Pick<
  ActivityPreviewData,
  "thoughtText" | "thoughtActivityKey" | "hasStreamingThought"
>;

function buildActivityPreviewData(
  base: ActivityPreviewBase,
  label: string,
  kind: ActivityPreviewData["kind"],
  shouldScrambleTitle = false,
): ActivityPreviewData {
  return {
    label,
    kind,
    ...base,
    shouldScrambleTitle,
  };
}

function resolveThinkingActivityPreview({
  latestEntry,
  previewBase,
  timelineEntries,
  thinkingEntryCount,
}: {
  latestEntry: Extract<ActivityTimelineEntry, { kind: "thinking" }>;
  previewBase: ActivityPreviewBase;
  timelineEntries: ActivityTimelineEntry[];
  thinkingEntryCount: number;
}): ActivityPreviewData {
  if ((previewBase.thoughtText?.trim().length ?? 0) > 0) {
    return buildActivityPreviewData(
      previewBase,
      previewBase.hasStreamingThought
        ? "Thinking"
        : thinkingEntryCount > 1
          ? "Thoughts"
          : "Reasoning",
      "thought",
    );
  }
  const latestHeadline = resolveThinkingPreviewHeadline(
    latestEntry.thinkingEntry,
  );
  if (latestHeadline.headline) {
    return buildActivityPreviewData(
      previewBase,
      latestHeadline.headline,
      "thought",
    );
  }
  const fallbackHeadline = resolveFallbackThinkingHeadline(
    timelineEntries,
    timelineEntries.length - 2,
  );
  if (fallbackHeadline) {
    return buildActivityPreviewData(previewBase, fallbackHeadline, "thought");
  }
  return buildActivityPreviewData(
    previewBase,
    latestHeadline.shouldScramble ? "Thinking" : "Reasoning",
    "thought",
  );
}

function resolveToolActivityPreview({
  latestEntry,
  previewBase,
  toolResultsById,
  toolCallArguments,
}: {
  latestEntry: Exclude<ActivityTimelineEntry, { kind: "thinking" }>;
  previewBase: ActivityPreviewBase;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): ActivityPreviewData {
  if (latestEntry.kind === "compaction") {
    return buildActivityPreviewData(
      previewBase,
      `Context: ${resolveCompactionEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      "context",
    );
  }
  if (latestEntry.kind === "action" || latestEntry.kind === "terminal") {
    return buildActivityPreviewData(
      previewBase,
      `${latestEntry.kind === "action" ? "Action" : "Terminal"}: ${resolveActionEntryLabel(
        latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      )}`,
      latestEntry.kind,
    );
  }
  if (latestEntry.kind === "subagent") {
    return buildActivityPreviewData(
      previewBase,
      `Subagent: ${resolveSubagentEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      "subagent",
    );
  }
  return buildActivityPreviewData(
    previewBase,
    `Action: ${resolveToolEntryLabel(latestEntry.toolEntry, toolResultsById)}`,
    "tool",
  );
}

function resolveLatestActivityPreview({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): ActivityPreviewData {
  const previewBase: ActivityPreviewBase = {
    ...resolveLatestThoughtPreview(timelineEntries),
    hasStreamingThought: resolveHasStreamingThought(timelineEntries),
  };
  const thinkingEntryCount = timelineEntries.filter(
    (entry) => entry.kind === "thinking",
  ).length;
  const latestEntry = timelineEntries[timelineEntries.length - 1];
  if (!latestEntry) {
    return buildActivityPreviewData(previewBase, "No recent activity", "none");
  }
  if (latestEntry.kind === "thinking") {
    return resolveThinkingActivityPreview({
      latestEntry,
      previewBase,
      timelineEntries,
      thinkingEntryCount,
    });
  }
  return resolveToolActivityPreview({
    latestEntry,
    previewBase,
    toolResultsById,
    toolCallArguments,
  });
}

type StreamActivitySummary = {
  activityKey: string;
  lastTextIndex: number;
};

const ASSISTANT_ERROR_PREFIX = "[Error]";

function isAssistantErrorText(text: string): boolean {
  return text.trimStart().startsWith(ASSISTANT_ERROR_PREFIX);
}

function stripAssistantErrorPrefix(text: string): string {
  const next = text.replace(/^\s*\[Error\]\s*/u, "");
  return next.trim().length > 0 ? next : "The AI request failed.";
}

function isThinkingContentItem(
  item: ChatContentItem,
): item is ThinkingContentItem {
  return item.type === C.LLM_THINKING;
}

function partitionAssistantContent(
  content: ChatContentItem[],
): AssistantContentPartition {
  const thinkingItems: ThinkingContentItem[] = [];
  const displayItems: AssistantDisplayItem[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (isThinkingContentItem(item)) {
      thinkingItems.push(item);
      continue;
    }
    displayItems.push({ item, fullIndex: index });
  }
  return { thinkingItems, displayItems };
}

function isMeaningfulAssistantDisplayItem(item: ChatContentItem): boolean {
  if (item.type === C.LLM_TEXT) {
    return item.text.trim().length > 0;
  }
  if (item.type === "image_url") {
    return item.image_url.url.trim().length > 0;
  }
  return false;
}

function hasMeaningfulAssistantDisplayItems(
  displayItems: AssistantDisplayItem[],
): boolean {
  return displayItems.some(({ item }) =>
    isMeaningfulAssistantDisplayItem(item),
  );
}

function getStreamActivitySummary(
  content: ChatContentItem[],
): StreamActivitySummary {
  let textLength = 0;
  let thinkingLength = 0;
  let summaryLength = 0;
  let signatureLength = 0;
  let imageCount = 0;
  let lastTextIndex = -1;
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (item.type === C.LLM_TEXT) {
      textLength += item.text.length;
      lastTextIndex = index;
      continue;
    }
    if (item.type === C.LLM_THINKING) {
      thinkingLength += item.thinking.length;
      if (item.summary) {
        summaryLength += item.summary.length;
      }
      if (item.signature) {
        signatureLength += item.signature.length;
      }
      continue;
    }
    if (item.type === "image_url") {
      imageCount += 1;
    }
  }
  return {
    activityKey: `${textLength}-${thinkingLength}-${summaryLength}-${signatureLength}-${imageCount}`,
    lastTextIndex,
  };
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

function ChatImage({
  url,
  className,
  onError,
}: {
  url: string;
  className?: string;
  onError?: () => void;
}) {
  const baseClassName =
    "max-h-64 w-auto max-w-full rounded-md border border-setta-200/70 bg-white";
  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;
  return (
    <img
      src={url}
      alt="Chat attachment"
      className={combinedClassName}
      loading="lazy"
      onError={onError}
    />
  );
}

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

function getAttachmentSizeLabel(attachment: ChatFileAttachment): string | null {
  if (attachment.size === null || attachment.size === undefined) {
    return null;
  }
  return formatBytes(attachment.size);
}

function AttachmentPreviewDialog({
  open,
  onOpenChange,
  attachments,
  selectedAttachmentId,
  onSelectAttachmentId,
  attachmentUrlMap,
  requestAttachmentUrls,
  onImageError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: ChatFileAttachment[];
  selectedAttachmentId: string | null;
  onSelectAttachmentId: (id: string) => void;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  onImageError: (attachment: ChatFileAttachment) => void;
}) {
  const selectedIndex = useMemo(() => {
    if (attachments.length === 0) {
      return -1;
    }
    if (!selectedAttachmentId) {
      return 0;
    }
    const index = attachments.findIndex(
      (attachment) => attachment.id === selectedAttachmentId,
    );
    return index >= 0 ? index : 0;
  }, [attachments, selectedAttachmentId]);
  const selectedAttachment =
    selectedIndex >= 0 ? attachments[selectedIndex] : null;
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, AttachmentTextPreview>
  >({});

  useEffect(() => {
    if (!open || attachments.length === 0) {
      return;
    }
    void requestAttachmentUrls(attachments);
  }, [open, attachments, requestAttachmentUrls]);

  const requestTextPreview = useCallback(
    async (attachment: ChatFileAttachment) => {
      if (!isTextAttachment(attachment)) {
        return;
      }
      if (textPreviewMap[attachment.id]) {
        return;
      }
      const oversizePreview = resolveOversizeTextPreview(attachment);
      if (oversizePreview) {
        createTextPreviewState(
          attachment.id,
          oversizePreview,
          setTextPreviewMap,
        );
        return;
      }
      const entry = await resolveAttachmentUrlEntry({
        attachment,
        attachmentUrlMap,
        requestAttachmentUrls,
      });
      if (!entry) {
        createTextPreviewState(
          attachment.id,
          buildUnavailableTextPreview(),
          setTextPreviewMap,
        );
        return;
      }
      createTextPreviewState(
        attachment.id,
        {
          text: "",
          truncated: false,
          isLoading: true,
          error: null,
        },
        setTextPreviewMap,
      );
      createTextPreviewState(
        attachment.id,
        await fetchAttachmentTextPreview(entry.url),
        setTextPreviewMap,
      );
    },
    [attachmentUrlMap, requestAttachmentUrls, textPreviewMap],
  );

  useEffect(() => {
    if (!open || !selectedAttachment) {
      return;
    }
    void requestTextPreview(selectedAttachment);
  }, [open, requestTextPreview, selectedAttachment]);

  const carouselItems = useMemo<Array<MediaCarouselItem<ChatFileAttachment>>>(
    () =>
      attachments.map((attachment) => {
        const attachmentUrl = attachmentUrlMap[attachment.id]?.url ?? null;
        const previewKind = getAttachmentPreviewKind(attachment);
        const shouldShowThumbnail = previewKind === "image";
        return {
          id: attachment.id,
          label: attachment.name,
          thumbnailUrl: shouldShowThumbnail ? attachmentUrl : null,
          imageUrl: shouldShowThumbnail ? attachmentUrl : null,
          data: attachment,
        };
      }),
    [attachments, attachmentUrlMap],
  );

  const renderFileCard = useCallback(
    (attachment: ChatFileAttachment, icon: ReactNode, description?: string) => {
      const sizeLabel = getAttachmentSizeLabel(attachment);
      return (
        <div className="flex flex-col items-center gap-2 text-sm text-setta-500 dark:text-setta-300">
          <div className="text-setta-400 dark:text-setta-500">{icon}</div>
          <span className="max-w-[70%] truncate text-center text-setta-700 dark:text-setta-200">
            {attachment.name}
          </span>
          {description ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {description}
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {sizeLabel}
            </span>
          ) : null}
        </div>
      );
    },
    [],
  );

  const renderAttachmentPreview = useCallback(
    (item: MediaCarouselItem<ChatFileAttachment>) => {
      const attachment = item.data ?? undefined;
      return renderAttachmentPreviewContent({
        attachment,
        attachmentUrl: attachment
          ? attachmentUrlMap[attachment.id]?.url ?? ""
          : "",
        textPreview: attachment ? textPreviewMap[attachment.id] : undefined,
        onImageError,
        renderFileCard,
      });
    },
    [attachmentUrlMap, onImageError, renderFileCard, textPreviewMap],
  );

  if (!open || attachments.length === 0 || !selectedAttachment) {
    return null;
  }

  const sizeLabel = getAttachmentSizeLabel(selectedAttachment);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] min-h-0 w-[95vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-lg bg-white px-6 pb-5 pt-4 shadow-xl dark:border dark:border-setta-600 dark:bg-setta-800">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-xs font-bold uppercase tracking-[0.2em] text-setta-400">
              Attachment preview
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-setta-400 transition hover:bg-setta-200 hover:text-setta-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-setta-900 dark:hover:text-setta-200"
              >
                <IoMdClose size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] text-setta-400">
              <div className="max-w-[70%] truncate">
                {selectedAttachment.name}
              </div>
              <div className="shrink-0">
                {selectedIndex + 1} / {attachments.length}
              </div>
            </div>

            <MediaCarousel
              items={carouselItems}
              selectedId={selectedAttachmentId}
              onSelect={onSelectAttachmentId}
              renderPreview={renderAttachmentPreview}
              showThumbnailLabels
              showNavButtons={attachments.length > 1}
              containerClassName="gap-4"
              previewClassName="border border-setta-200/60 bg-setta-50 dark:border-setta-700 dark:bg-setta-860/80"
              thumbnailRowClassName="rounded-lg border border-setta-200/60 bg-setta-50/70 px-3 py-3 dark:border-setta-700 dark:bg-setta-900/50"
              thumbnailClassName="border-setta-300/70 bg-white/70 dark:border-setta-700 dark:bg-setta-800/70"
              selectedThumbnailClassName="border-blue-500 shadow-md"
              footer={
                <div className="flex items-center justify-between text-[11px] text-setta-400">
                  <div className="truncate">
                    {selectedAttachment.mimeType ?? "Unknown type"}
                  </div>
                  {sizeLabel ? <span>{sizeLabel}</span> : null}
                </div>
              }
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChatAttachmentList({
  attachments,
  isUser,
  attachmentUrlMap,
  requestAttachmentUrls,
  conversationSearchTerms = [],
}: {
  attachments: ChatFileAttachment[];
  isUser: boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  conversationSearchTerms?: Array<string>;
}) {
  const hasAttachments = attachments.length > 0;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(
    null,
  );
  const pillClassName = isUser
    ? "border-white/40 bg-white/10 text-white"
    : "border-setta-200 bg-white text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200";
  const detailClassName = isUser ? "text-white/70" : "text-setta-400";
  const handleImageError = useCallback(
    (attachment: ChatFileAttachment) => {
      void requestAttachmentUrls([attachment], { force: true });
    },
    [requestAttachmentUrls],
  );
  const handlePreviewOpen = useCallback((attachment: ChatFileAttachment) => {
    setPreviewAttachmentId(attachment.id);
    setPreviewOpen(true);
  }, []);

  useEffect(() => {
    const staleImages = attachments.filter((attachment) => {
      if (!isImageAttachment(attachment)) {
        return false;
      }
      const entry = attachmentUrlMap[attachment.id];
      if (!entry) {
        return false;
      }
      return isAttachmentUrlStale(entry, Date.now());
    });
    if (staleImages.length > 0) {
      void requestAttachmentUrls(staleImages);
    }
  }, [attachments, attachmentUrlMap, requestAttachmentUrls]);

  useEffect(() => {
    if (!previewOpen || attachments.length === 0) {
      return;
    }
    if (
      previewAttachmentId &&
      attachments.some((attachment) => attachment.id === previewAttachmentId)
    ) {
      return;
    }
    setPreviewAttachmentId(attachments[0]?.id ?? null);
  }, [attachments, previewAttachmentId, previewOpen]);

  if (!hasAttachments) {
    return null;
  }

  return (
    <>
      <AttachmentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        attachments={attachments}
        selectedAttachmentId={previewAttachmentId}
        onSelectAttachmentId={setPreviewAttachmentId}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        onImageError={handleImageError}
      />
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const entry = attachmentUrlMap[attachment.id];
          const url = entry ? entry.url : "";
          const sizeLabel = getAttachmentSizeLabel(attachment);
          if (isImage && url) {
            return (
              <div key={attachment.id} className="flex w-24 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handlePreviewOpen(attachment)}
                  className="inline-flex h-16 w-16 cursor-pointer items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <ChatImage
                    url={url}
                    onError={() => handleImageError(attachment)}
                    className={`h-16 w-16 cursor-pointer object-cover ${
                      isUser ? "border-white/40 bg-white/10" : ""
                    }`}
                  />
                </button>
                <div
                  className={`flex w-full flex-col gap-0.5 text-[10px] ${detailClassName}`}
                >
                  <span className="truncate">
                    {renderConversationSearchHighlightedText(
                      attachment.name,
                      conversationSearchTerms,
                    )}
                  </span>
                  {sizeLabel ? (
                    <span className="opacity-70">{sizeLabel}</span>
                  ) : null}
                </div>
              </div>
            );
          }
          return (
            <div
              key={attachment.id}
              role="button"
              tabIndex={0}
              onClick={() => handlePreviewOpen(attachment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handlePreviewOpen(attachment);
                }
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs ${pillClassName}`}
            >
              <span className="max-w-[220px] truncate">
                {renderConversationSearchHighlightedText(
                  attachment.name,
                  conversationSearchTerms,
                )}
              </span>
              {sizeLabel ? (
                <span className={`text-[10px] ${detailClassName}`}>
                  {sizeLabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function resolveThinkingRowRunState(
  thinkingRunState: ToolCallSectionState,
): ToolCallRunState {
  if (thinkingRunState === "running") {
    return "running";
  }
  if (thinkingRunState === "stopped") {
    return "stopped";
  }
  return "success";
}

function useThinkingAccordionState({
  defaultOpen,
  hasExpandableContent,
  expandAllSignal,
  collapseAllSignal,
}: {
  defaultOpen: boolean;
  hasExpandableContent: boolean;
  expandAllSignal: number;
  collapseAllSignal: number;
}) {
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    () =>
      hasExpandableContent && defaultOpen
        ? ACTIVITY_ROW_DETAILS_VALUE
        : undefined,
  );
  const lastExpandAllSignalRef = useRef(expandAllSignal);
  const lastCollapseAllSignalRef = useRef(collapseAllSignal);

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

  return [accordionValue, setAccordionValue] as const;
}

function useThinkingSummaryOverflow({
  shouldMeasureSummaryOverflow,
  activityHint,
  summaryHeadlineText,
}: {
  shouldMeasureSummaryOverflow: boolean;
  activityHint?: string | null;
  summaryHeadlineText: string;
}) {
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const [isSummaryTitleTruncated, setIsSummaryTitleTruncated] = useState(false);

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
      const truncated =
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1;
      setIsSummaryTitleTruncated((prev) =>
        prev === truncated ? prev : truncated,
      );
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer =
      typeof ResizeObserver === "undefined" || !summaryPreviewRef.current
        ? null
        : new ResizeObserver(measure);
    observer?.observe(summaryPreviewRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [activityHint, shouldMeasureSummaryOverflow, summaryHeadlineText]);

  return { summaryPreviewRef, isSummaryTitleTruncated };
}

function ThinkingBoxSummaryLabel({
  summaryPreviewRef,
  shouldRenderPlainSummaryWithHint,
  collapsedSummaryWithHint,
  conversationSearchTerms,
  summaryHeadlineText,
}: {
  summaryPreviewRef: MutableRefObject<HTMLDivElement | null>;
  shouldRenderPlainSummaryWithHint: boolean;
  collapsedSummaryWithHint: string;
  conversationSearchTerms: Array<string>;
  summaryHeadlineText: string;
}) {
  return (
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
  );
}

function ThinkingBoxStatus({
  thinkingRunState,
  durationLabel,
  timestampMs,
}: {
  thinkingRunState: ToolCallSectionState;
  durationLabel: string | null;
  timestampMs: number | null;
}) {
  if (thinkingRunState === "complete") {
    return (
      <>
        <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />
        {durationLabel ? (
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
        ) : null}
      </>
    );
  }
  if (thinkingRunState === "stopped") {
    return (
      <>
        <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />
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
      </>
    );
  }
  return (
    <>
      <ChatTimestamp timestampMs={timestampMs} kind="activity-item" />
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
    </>
  );
}

function ThinkingBoxExpandedContent({
  expandedContent,
  hasThinkingText,
  isStreaming,
  conversationSearchTerms,
}: {
  expandedContent: string;
  hasThinkingText: boolean;
  isStreaming: boolean;
  conversationSearchTerms: Array<string>;
}) {
  return (
    <div
      data-chat-thinking-summary-expanded={
        !hasThinkingText ? "true" : undefined
      }
      className="px-2 py-1"
    >
      <MarkdownContent
        content={expandedContent}
        className={ASSISTANT_MARKDOWN_CLASS}
        role={ChatRoleEnum.assistant}
        isStreaming={hasThinkingText ? isStreaming : false}
        highlightTerms={conversationSearchTerms}
      />
    </div>
  );
}

function ThinkingBoxHeader({
  hasExpandableContent,
  thinkingRowRunState,
  railIcon,
  summaryPreviewRef,
  shouldRenderPlainSummaryWithHint,
  collapsedSummaryWithHint,
  conversationSearchTerms,
  summaryHeadlineText,
  onCopy,
  thinkingRunState,
  durationLabel,
  timestampMs,
}: {
  hasExpandableContent: boolean;
  thinkingRowRunState: ToolCallRunState;
  railIcon?: ReactNode;
  summaryPreviewRef: MutableRefObject<HTMLDivElement | null>;
  shouldRenderPlainSummaryWithHint: boolean;
  collapsedSummaryWithHint: string;
  conversationSearchTerms: Array<string>;
  summaryHeadlineText: string;
  onCopy?: () => void;
  thinkingRunState: ToolCallSectionState;
  durationLabel: string | null;
  timestampMs: number | null;
}) {
  return (
    <div className="relative flex w-full items-stretch">
      <Accordion.Trigger
        disabled={!hasExpandableContent}
        data-chat-thinking-trigger="true"
        data-chat-thinking-expandable={hasExpandableContent ? "true" : "false"}
        className={`${resolveThinkingTriggerClassName(hasExpandableContent)} min-w-0 flex-1`}
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
            <ThinkingBoxSummaryLabel
              summaryPreviewRef={summaryPreviewRef}
              shouldRenderPlainSummaryWithHint={
                shouldRenderPlainSummaryWithHint
              }
              collapsedSummaryWithHint={collapsedSummaryWithHint}
              conversationSearchTerms={conversationSearchTerms}
              summaryHeadlineText={summaryHeadlineText}
            />
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
        <ThinkingBoxStatus
          thinkingRunState={thinkingRunState}
          durationLabel={durationLabel}
          timestampMs={timestampMs}
        />
      </div>
    </div>
  );
}

type ThinkingBoxBaseState = {
  summaryText: string;
  hasThinkingText: boolean;
  summaryHeadlineText: string;
  collapsedSummaryWithHint: string;
  shouldRenderPlainSummaryWithHint: boolean;
  shouldMeasureSummaryOverflow: boolean;
};

function resolveThinkingSummaryHeadlineText(args: {
  content: string;
  isStreaming: boolean;
  summary: string | null | undefined;
  suppressCollapsedSummary: boolean;
}): string {
  if (args.suppressCollapsedSummary) {
    return resolveCollapsedThinkingActivityLabel({
      isStreaming: args.isStreaming,
    });
  }
  return resolveThinkingSummaryHeadline({
    content: args.content,
    summary: args.summary,
    isStreaming: args.isStreaming,
  });
}

function resolveCollapsedSummaryWithHint(args: {
  activityHint?: string | null;
  hasThinkingText: boolean;
  summaryHeadlineText: string;
}): string {
  if (args.activityHint && !args.hasThinkingText) {
    return `${args.summaryHeadlineText} - ${args.activityHint}`;
  }
  return args.summaryHeadlineText;
}

function resolveThinkingBoxBaseState({
  content,
  summary,
  isStreaming,
  suppressCollapsedSummary,
  activityHint,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
  suppressCollapsedSummary: boolean;
  activityHint?: string | null;
}): ThinkingBoxBaseState {
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHeadlineText = resolveThinkingSummaryHeadlineText({
    content,
    isStreaming,
    summary,
    suppressCollapsedSummary,
  });
  const collapsedSummaryWithHint = resolveCollapsedSummaryWithHint({
    activityHint,
    hasThinkingText,
    summaryHeadlineText,
  });
  const shouldRenderPlainSummaryWithHint =
    !suppressCollapsedSummary && Boolean(activityHint) && !hasThinkingText;
  const shouldMeasureSummaryOverflow =
    !suppressCollapsedSummary &&
    !hasThinkingText &&
    summaryHeadlineText.length > 0;
  return {
    summaryText,
    hasThinkingText,
    summaryHeadlineText,
    collapsedSummaryWithHint,
    shouldRenderPlainSummaryWithHint,
    shouldMeasureSummaryOverflow,
  };
}

function resolveThinkingTriggerClassName(
  hasExpandableContent: boolean,
): string {
  return `grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} max-w-full overflow-hidden text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent ? "cursor-pointer" : "cursor-default"
  }`;
}

function resolveThinkingExpandableState({
  content,
  summaryText,
  hasThinkingText,
  isSummaryTitleTruncated,
}: {
  content: string;
  summaryText: string;
  hasThinkingText: boolean;
  isSummaryTitleTruncated: boolean;
}) {
  return {
    hasExpandableContent:
      hasThinkingText ||
      isSummaryTitleTruncated ||
      (!hasThinkingText && /\r?\n/u.test(summaryText)),
    expandedContent: hasThinkingText ? content : summaryText,
  };
}

function normalizeThinkingAccordionValue(
  nextValue: string | undefined,
): string | undefined {
  return nextValue === ACTIVITY_ROW_DETAILS_VALUE
    ? ACTIVITY_ROW_DETAILS_VALUE
    : undefined;
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
  const baseState = resolveThinkingBoxBaseState({
    content,
    summary,
    isStreaming: streaming,
    suppressCollapsedSummary,
    activityHint,
  });
  const {
    summaryText,
    hasThinkingText,
    summaryHeadlineText,
    collapsedSummaryWithHint,
    shouldRenderPlainSummaryWithHint,
    shouldMeasureSummaryOverflow,
  } = baseState;
  const { summaryPreviewRef, isSummaryTitleTruncated } =
    useThinkingSummaryOverflow({
      shouldMeasureSummaryOverflow,
      activityHint,
      summaryHeadlineText,
    });
  const { hasExpandableContent, expandedContent } =
    resolveThinkingExpandableState({
      content,
      summaryText,
      hasThinkingText,
      isSummaryTitleTruncated,
    });
  const [accordionValue, setAccordionValue] = useThinkingAccordionState({
    defaultOpen,
    hasExpandableContent,
    expandAllSignal,
    collapseAllSignal,
  });
  const isExpanded =
    hasExpandableContent && accordionValue === ACTIVITY_ROW_DETAILS_VALUE;
  const thinkingRunState = resolveThinkingSectionState({
    isStreaming: streaming,
    wasInterrupted,
  });
  const thinkingRowRunState = resolveThinkingRowRunState(thinkingRunState);
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
    onExpansionChange?.(activityKey, isExpanded);
  }, [activityKey, isExpanded, onExpansionChange]);

  return (
    <Accordion.Root
      type="single"
      collapsible
      className="w-full"
      value={accordionValue}
      onValueChange={(nextValue) => {
        setAccordionValue(normalizeThinkingAccordionValue(nextValue));
      }}
    >
      <Accordion.Item
        value={ACTIVITY_ROW_DETAILS_VALUE}
        className="group/chat-activity-row w-full overflow-hidden border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-thinking-section="true"
      >
        <ThinkingBoxHeader
          hasExpandableContent={hasExpandableContent}
          thinkingRowRunState={thinkingRowRunState}
          railIcon={railIcon}
          summaryPreviewRef={summaryPreviewRef}
          shouldRenderPlainSummaryWithHint={shouldRenderPlainSummaryWithHint}
          collapsedSummaryWithHint={collapsedSummaryWithHint}
          conversationSearchTerms={conversationSearchTerms}
          summaryHeadlineText={summaryHeadlineText}
          onCopy={onCopy}
          thinkingRunState={thinkingRunState}
          durationLabel={durationLabel}
          timestampMs={timestampMs}
        />
        {hasExpandableContent ? (
          <Accordion.Content
            className={ACTIVITY_ACCORDION_CONTENT_CLASS}
            data-chat-thinking-content="true"
          >
            <ThinkingBoxExpandedContent
              expandedContent={expandedContent}
              hasThinkingText={hasThinkingText}
              isStreaming={isStreaming}
              conversationSearchTerms={conversationSearchTerms}
            />
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

type AssistantActivityDisplayState = {
  displayLabel: string;
  showThoughtScroll: boolean;
  shouldAnimateThoughtScroll: boolean;
  durationClassName: string;
  activityTitleLabel: string;
  activityPrimaryLabel: string;
  showActivityPreviewLabel: boolean;
  hideThoughtPreview: boolean;
  previewShellClassName: string;
};

function normalizeAssistantActivityAccordionValue(
  nextValue: string | undefined,
): string | undefined {
  return nextValue === ASSISTANT_ACTIVITY_DETAILS_VALUE
    ? ASSISTANT_ACTIVITY_DETAILS_VALUE
    : undefined;
}

function resolveAssistantActivityDurationClassName(
  sectionState: ToolCallSectionState,
): string {
  return sectionState === "stopped"
    ? "font-mono text-[10px] text-amber-700 dark:text-amber-200"
    : "font-mono text-[10px] text-setta-400 dark:text-setta-400/90";
}

function resolveAssistantActivityTitleLabel({
  preview,
  suppressSummaries,
  displayLabel,
}: {
  preview: ActivityPreviewData;
  suppressSummaries: boolean;
  displayLabel: string;
}): string {
  if (preview.kind !== "thought" || !suppressSummaries) {
    return displayLabel;
  }
  return preview.hasStreamingThought ? "Thinking" : "Reasoning";
}

function resolveAssistantActivityPrimaryLabel({
  preview,
  itemCount,
  activityTitleLabel,
}: {
  preview: ActivityPreviewData;
  itemCount: number;
  activityTitleLabel: string;
}): string {
  if (preview.kind !== "thought") {
    return activityTitleLabel;
  }
  if (preview.hasStreamingThought) {
    return "Thinking";
  }
  return itemCount > 1 ? "Thoughts" : "Reasoning";
}

function resolveAssistantThoughtPreviewDisplayState({
  preview,
  suppressThoughtScrollAnimation,
  isExpanded,
  previewThoughtExpanded,
}: {
  preview: ActivityPreviewData;
  suppressThoughtScrollAnimation: boolean;
  isExpanded: boolean;
  previewThoughtExpanded: boolean;
}): Pick<
  AssistantActivityDisplayState,
  | "showThoughtScroll"
  | "shouldAnimateThoughtScroll"
  | "hideThoughtPreview"
  | "previewShellClassName"
> {
  const showThoughtScroll =
    preview.thoughtText !== null && preview.thoughtText.trim().length > 0;
  const hideThoughtPreview = isExpanded && previewThoughtExpanded;
  return {
    showThoughtScroll,
    shouldAnimateThoughtScroll:
      showThoughtScroll &&
      preview.hasStreamingThought &&
      !suppressThoughtScrollAnimation,
    hideThoughtPreview,
    previewShellClassName: hideThoughtPreview
      ? "max-h-0 opacity-0"
      : "max-h-12 opacity-100",
  };
}

function resolveAssistantActivityDisplayState({
  preview,
  itemCount,
  suppressThoughtScrollAnimation,
  sectionState,
  suppressSummaries,
  isExpanded,
  previewThoughtExpanded,
  scrambledLabel,
}: {
  preview: ActivityPreviewData;
  itemCount: number;
  suppressThoughtScrollAnimation: boolean;
  sectionState: ToolCallSectionState;
  suppressSummaries: boolean;
  isExpanded: boolean;
  previewThoughtExpanded: boolean;
  scrambledLabel: string;
}): AssistantActivityDisplayState {
  const displayLabel = preview.shouldScrambleTitle
    ? scrambledLabel
    : preview.label;
  const activityTitleLabel = resolveAssistantActivityTitleLabel({
    preview,
    suppressSummaries,
    displayLabel,
  });
  const activityPrimaryLabel = resolveAssistantActivityPrimaryLabel({
    preview,
    itemCount,
    activityTitleLabel,
  });
  const thoughtPreviewState = resolveAssistantThoughtPreviewDisplayState({
    preview,
    suppressThoughtScrollAnimation,
    isExpanded,
    previewThoughtExpanded,
  });
  return {
    displayLabel,
    durationClassName: resolveAssistantActivityDurationClassName(sectionState),
    activityTitleLabel,
    activityPrimaryLabel,
    showActivityPreviewLabel:
      preview.kind === "thought" &&
      activityTitleLabel.trim().length > 0 &&
      activityTitleLabel !== activityPrimaryLabel,
    ...thoughtPreviewState,
  };
}

function useAssistantActivityState({
  defaultOpen,
  defaultChildrenOpen,
  thoughtActivityKey,
}: {
  defaultOpen: boolean;
  defaultChildrenOpen: boolean;
  thoughtActivityKey: string | null;
}) {
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    () => (defaultOpen ? ASSISTANT_ACTIVITY_DETAILS_VALUE : undefined),
  );
  const [openAllSignal, setOpenAllSignal] = useState(0);
  const [closeAllSignal, setCloseAllSignal] = useState(0);
  const [allChildrenExpanded, setAllChildrenExpanded] =
    useState(defaultChildrenOpen);
  const [previewThoughtExpanded, setPreviewThoughtExpanded] = useState(
    () => defaultChildrenOpen && thoughtActivityKey !== null,
  );

  useEffect(() => {
    setAllChildrenExpanded(defaultChildrenOpen);
  }, [defaultChildrenOpen]);
  useEffect(() => {
    setPreviewThoughtExpanded(
      defaultChildrenOpen && thoughtActivityKey !== null,
    );
  }, [defaultChildrenOpen, thoughtActivityKey]);

  const isExpanded = accordionValue === ASSISTANT_ACTIVITY_DETAILS_VALUE;
  const suppressSummaries = isExpanded && allChildrenExpanded;
  const openAllButtonLabel = allChildrenExpanded ? "Close all" : "Open all";
  const openAllButtonTitle = allChildrenExpanded
    ? "Close all activity details"
    : "Open all activity details";
  const handlePreviewThoughtExpansionChange = useCallback(
    (activityKey: string, nextExpanded: boolean) => {
      if (!nextExpanded) {
        setAllChildrenExpanded(false);
      }
      if (activityKey !== thoughtActivityKey) {
        return;
      }
      setPreviewThoughtExpanded((previous) =>
        previous === nextExpanded ? previous : nextExpanded,
      );
    },
    [thoughtActivityKey],
  );
  const handleToggleAllChildren = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
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
    },
    [allChildrenExpanded],
  );

  return {
    accordionValue,
    setAccordionValue,
    openAllSignal,
    closeAllSignal,
    allChildrenExpanded,
    previewThoughtExpanded,
    isExpanded,
    suppressSummaries,
    openAllButtonLabel,
    openAllButtonTitle,
    handlePreviewThoughtExpansionChange,
    handleToggleAllChildren,
  };
}

function useAssistantActivityTriggerHandlers(
  setAccordionValue: Dispatch<SetStateAction<string | undefined>>,
) {
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
    [setAccordionValue],
  );
  const handleStopPropagation = useCallback(
    (
      event:
        | ReactPointerEvent<HTMLDivElement>
        | ReactPointerEvent<HTMLButtonElement>,
    ) => {
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
  return {
    handleActivityTriggerClick,
    handleActivityTriggerPointerDown: handleStopPropagation,
    handleOpenAllPointerDown: handleStopPropagation,
    handleActivityTriggerKeyDown,
  };
}

function AssistantActivityPreviewLabel({
  preview,
  activityTitleLabel,
  conversationSearchTerms,
}: {
  preview: ActivityPreviewData;
  activityTitleLabel: string;
  conversationSearchTerms: Array<string>;
}) {
  return (
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
  );
}

function AssistantActivityHeader({
  preview,
  itemCount,
  sectionState,
  conversationSearchTerms,
  activityPrimaryLabel,
  activityTitleLabel,
  showActivityPreviewLabel,
  durationLabel,
  durationClassName,
  openAllButtonLabel,
  openAllButtonTitle,
  onOpenAllPointerDown,
  onToggleAllChildren,
}: {
  preview: ActivityPreviewData;
  itemCount: number;
  sectionState: ToolCallSectionState;
  conversationSearchTerms: Array<string>;
  activityPrimaryLabel: string;
  activityTitleLabel: string;
  showActivityPreviewLabel: boolean;
  durationLabel: string | null;
  durationClassName: string;
  openAllButtonLabel: string;
  openAllButtonTitle: string;
  onOpenAllPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onToggleAllChildren: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
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
              onPointerDown={onOpenAllPointerDown}
              onClick={onToggleAllChildren}
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
          <AssistantActivityPreviewLabel
            preview={preview}
            activityTitleLabel={activityTitleLabel}
            conversationSearchTerms={conversationSearchTerms}
          />
        ) : null}
      </div>
    </div>
  );
}

function AssistantActivityThoughtPreviewShell({
  showThoughtScroll,
  hideThoughtPreview,
  previewShellClassName,
  thoughtText,
  shouldAnimateThoughtScroll,
}: {
  showThoughtScroll: boolean;
  hideThoughtPreview: boolean;
  previewShellClassName: string;
  thoughtText: string | null;
  shouldAnimateThoughtScroll: boolean;
}) {
  if (!showThoughtScroll) {
    return null;
  }
  return (
    <div
      data-chat-assistant-activity-thought-preview-shell="true"
      data-chat-assistant-activity-thought-preview-visible={
        hideThoughtPreview ? "false" : "true"
      }
      aria-hidden={hideThoughtPreview}
      className={`w-full overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${previewShellClassName}`}
    >
      <ActivityThoughtPreview
        text={thoughtText ?? ""}
        animate={shouldAnimateThoughtScroll}
      />
    </div>
  );
}

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
  const {
    accordionValue,
    setAccordionValue,
    openAllSignal,
    closeAllSignal,
    isExpanded,
    suppressSummaries,
    openAllButtonLabel,
    openAllButtonTitle,
    handlePreviewThoughtExpansionChange,
    handleToggleAllChildren,
    previewThoughtExpanded,
  } = useAssistantActivityState({
    defaultOpen,
    defaultChildrenOpen,
    thoughtActivityKey: preview.thoughtActivityKey,
  });
  const {
    handleActivityTriggerClick,
    handleActivityTriggerPointerDown,
    handleOpenAllPointerDown,
    handleActivityTriggerKeyDown,
  } = useAssistantActivityTriggerHandlers(setAccordionValue);
  const displayState = resolveAssistantActivityDisplayState({
    preview,
    itemCount,
    suppressThoughtScrollAnimation,
    sectionState,
    suppressSummaries,
    isExpanded,
    previewThoughtExpanded,
    scrambledLabel,
  });
  const {
    showThoughtScroll,
    shouldAnimateThoughtScroll,
    durationClassName,
    activityTitleLabel,
    activityPrimaryLabel,
    showActivityPreviewLabel,
    hideThoughtPreview,
    previewShellClassName,
  } = displayState;
  return (
    <Accordion.Root
      type="single"
      collapsible
      className="w-full"
      value={accordionValue}
      onValueChange={(nextValue) => {
        setAccordionValue(normalizeAssistantActivityAccordionValue(nextValue));
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
          <AssistantActivityHeader
            preview={preview}
            itemCount={itemCount}
            sectionState={sectionState}
            conversationSearchTerms={conversationSearchTerms}
            activityPrimaryLabel={activityPrimaryLabel}
            activityTitleLabel={activityTitleLabel}
            showActivityPreviewLabel={showActivityPreviewLabel}
            durationLabel={durationLabel}
            durationClassName={durationClassName}
            openAllButtonLabel={openAllButtonLabel}
            openAllButtonTitle={openAllButtonTitle}
            onOpenAllPointerDown={handleOpenAllPointerDown}
            onToggleAllChildren={handleToggleAllChildren}
          />
          <AssistantActivityThoughtPreviewShell
            showThoughtScroll={showThoughtScroll}
            hideThoughtPreview={hideThoughtPreview}
            previewShellClassName={previewShellClassName}
            thoughtText={preview.thoughtText}
            shouldAnimateThoughtScroll={shouldAnimateThoughtScroll}
          />
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

type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;
type StructuredOutputResizeEdge = "top" | "bottom";

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function attachStructuredOutputResizeListeners({
  target,
  onMove,
  onUp,
}: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}

function findNearestVerticalScrollContainer(
  element: HTMLElement,
): HTMLElement | null {
  const messageListScrollContainer = element.closest<HTMLElement>(
    '[data-chat-message-list-scroll-container="true"]',
  );
  if (messageListScrollContainer) {
    return messageListScrollContainer;
  }
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function resolveTopDeltaPerScrollPixel({
  scrollContainer,
  probeElement,
}: {
  scrollContainer: HTMLElement;
  probeElement: HTMLElement;
}): number {
  const originalScrollTop = scrollContainer.scrollTop;
  const initialTop = probeElement.getBoundingClientRect().top;
  for (const desiredOffset of [1, -1]) {
    scrollContainer.scrollTop = originalScrollTop + desiredOffset;
    const actualOffset = scrollContainer.scrollTop - originalScrollTop;
    const nextTop = probeElement.getBoundingClientRect().top;
    scrollContainer.scrollTop = originalScrollTop;
    if (Math.abs(actualOffset) < 0.5) {
      continue;
    }
    const topDeltaPerScrollPixel = (nextTop - initialTop) / actualOffset;
    if (Math.abs(topDeltaPerScrollPixel) > 0.01) {
      return topDeltaPerScrollPixel;
    }
  }
  return 0;
}

const StructuredOutputViewport = memo(function StructuredOutputViewport({
  owner,
  part,
  children,
}: {
  owner: StructuredOutputOwner;
  part: StructuredOutputPart;
  children: ReactNode;
}) {
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const beginResize = useCallback(
    (
      edge: StructuredOutputResizeEdge,
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const contentElement = contentRef.current;
      if (!contentElement) {
        return;
      }
      const startHeightPx = contentElement.getBoundingClientRect().height;
      const startPointerY = event.clientY;
      const pointerId = event.pointerId;
      setIsResizing(true);
      // Preserve the current compact height as the drag floor to avoid snapping
      // short panes up to the global minimum on first movement.
      const minHeightPx = Math.min(
        STRUCTURED_OUTPUT_MIN_HEIGHT_PX,
        startHeightPx,
      );
      const maxHeightPx = Math.max(
        STRUCTURED_OUTPUT_MIN_HEIGHT_PX,
        Math.floor(window.innerHeight * STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO),
      );
      let previousHeightPx = startHeightPx;
      const scrollContainer =
        edge === "bottom"
          ? findNearestVerticalScrollContainer(contentElement)
          : null;
      const topDeltaPerScrollPixel =
        scrollContainer !== null
          ? resolveTopDeltaPerScrollPixel({
              scrollContainer,
              probeElement: contentElement,
            })
          : 0;

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const pointerDeltaY = moveEvent.clientY - startPointerY;
        const signedDeltaY = edge === "top" ? -pointerDeltaY : pointerDeltaY;
        const nextHeight = clampValue(
          startHeightPx + signedDeltaY,
          minHeightPx,
          maxHeightPx,
        );
        if (nextHeight === previousHeightPx) {
          return;
        }
        const previousTopPx = contentElement.getBoundingClientRect().top;
        const isBottomGrowth =
          edge === "bottom" && nextHeight > previousHeightPx;
        previousHeightPx = nextHeight;
        setHeightPx(nextHeight);

        // Keep the pane visually anchored while dragging the bottom border in a
        // bottom-anchored chat viewport so growth feels downward.
        if (isBottomGrowth && scrollContainer) {
          if (resizeFrameRef.current !== null) {
            window.cancelAnimationFrame(resizeFrameRef.current);
          }
          resizeFrameRef.current = window.requestAnimationFrame(() => {
            resizeFrameRef.current = null;
            const nextTopPx = contentElement.getBoundingClientRect().top;
            const topShiftPx = nextTopPx - previousTopPx;
            if (
              Math.abs(topShiftPx) > 0.5 &&
              Math.abs(topDeltaPerScrollPixel) > 0.01
            ) {
              scrollContainer.scrollTop += -topShiftPx / topDeltaPerScrollPixel;
            }
          });
        }
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        resizeCleanupRef.current = null;
        setIsResizing(false);
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
      };

      resizeCleanupRef.current?.();
      const cleanup = attachStructuredOutputResizeListeners({
        target: window,
        onMove,
        onUp,
      });
      resizeCleanupRef.current = cleanup;
    },
    [],
  );

  const contentStyle =
    heightPx === null
      ? { maxHeight: `${STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX}px` }
      : { height: `${heightPx}px` };

  return (
    <div className="group/structured-output-pane relative min-w-0">
      <div
        ref={contentRef}
        data-chat-structured-output-pane="true"
        data-chat-structured-output-pane-owner={owner}
        data-chat-structured-output-pane-part={part}
        className="min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
        style={contentStyle}
      >
        {children}
      </div>
      {(["bottom"] as const).map((edge) => (
        <div
          key={edge}
          role="separator"
          aria-label={`Resize activity output pane from ${edge} border`}
          data-chat-structured-output-resize-handle="true"
          data-chat-structured-output-resize-handle-owner={owner}
          data-chat-structured-output-resize-handle-part={part}
          data-chat-structured-output-resize-handle-edge={edge}
          data-resizing={isResizing ? "true" : "false"}
          className={STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS}
          onPointerDown={(event) => beginResize(edge, event)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setHeightPx(null);
          }}
        >
          <div
            className={STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
});

const StructuredOutputBlock = memo(function StructuredOutputBlock({
  payload,
  owner,
  part,
  isStreaming,
}: {
  payload: StructuredOutputPayload;
  owner: StructuredOutputOwner;
  part: StructuredOutputPart;
  isStreaming: boolean;
}) {
  const codeMirrorTheme = useCodeMirrorStyle();
  const displayText = useTypewriterEffect(payload.text, isStreaming, 5);
  let content: ReactNode;

  if (isStreaming) {
    content = (
      <pre
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind={payload.kind}
        data-chat-structured-output-language={payload.language ?? "plaintext"}
        data-chat-structured-output-streaming="true"
        className="m-0 cursor-auto overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
      >
        {displayText.length > 0 ? displayText : " "}
      </pre>
    );
  } else if (payload.kind === "diff") {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="diff"
        data-chat-structured-output-language="diff"
        className="m-0 min-w-0 cursor-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
      >
        <GitDiffCodeMirror
          value={displayText}
          filePathForLanguage={payload.pathHint}
          wrapLines={true}
          className="min-h-0 w-full min-w-0 [&_.cm-content]:text-[11px] [&_.cm-content]:leading-[16px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
        />
      </div>
    );
  } else if (payload.kind === "code") {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="code"
        data-chat-structured-output-language={payload.language ?? "plaintext"}
      >
        <DummyCodeMirror
          code={displayText}
          theme={codeMirrorTheme}
          className="cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
          language={payload.language}
          useJsx={payload.useJsx}
          wrapLines={true}
        />
      </div>
    );
  } else {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="plain"
        data-chat-structured-output-language="plaintext"
      >
        <DummyCodeMirror
          code={displayText}
          theme={codeMirrorTheme}
          className="cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
          language={payload.language}
          useJsx={payload.useJsx}
          wrapLines={true}
        />
      </div>
    );
  }

  return (
    <StructuredOutputViewport owner={owner} part={part}>
      {content}
    </StructuredOutputViewport>
  );
});

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

type AssistantActionSectionProps = {
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
};

type AssistantActionRowProps = {
  entry: ActivityTimelineEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  showItemCopyButtons: boolean;
  defaultChildrenOpen: boolean;
  openAllSignal: number;
  closeAllSignal: number;
  suppressCollapsedSummary: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
};

type AssistantToolActivityContext = {
  entry: Exclude<ActivityTimelineEntry, { kind: "thinking" }>;
  toolCall: ToolCall;
  toolEntry: ToolCallRenderEntry;
  toolResult: ToolChatMessage | undefined;
  rawToolName: string;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  formattedToolResult: ToolResultValue | undefined;
  argsToDisplay: unknown;
  normalizedToolName: string | null;
};

function createActivityRowCopyHandler(text: string): () => void {
  return () => {
    copyTextWithNotifications({
      text,
      emptyMessage: "Nothing to copy for this activity item.",
      successMessage: "Copied activity item.",
      failureMessage: "Failed to copy activity item.",
    });
  };
}

function resolveAssistantToolActivityContext({
  entry,
  toolResultsById,
  toolCallArguments,
}: Pick<
  AssistantActionRowProps,
  "entry" | "toolResultsById" | "toolCallArguments"
>): AssistantToolActivityContext {
  const toolEntry = entry.toolEntry;
  const toolCall = toolEntry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  return {
    entry,
    toolCall,
    toolEntry,
    toolResult,
    rawToolName:
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`,
    runState: resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      toolEntry.isStreaming,
    ),
    ...resolveToolResultTimingAnchors(toolResult),
    formattedToolResult: formatToolResult(toolResult),
    argsToDisplay: resolveDisplayArgsForToolCallEntry({
      toolCall,
      toolResult,
      toolCallArguments,
    }),
    normalizedToolName: normalizeToolName(toolCall.function?.name),
  };
}

function wrapAssistantActivityCard(key: string, child: ReactNode): ReactNode {
  return (
    <div
      key={key}
      className="border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
    >
      {child}
    </div>
  );
}

function resolveAssistantInteractiveActivityCard(
  context: AssistantToolActivityContext,
): ReactNode | null {
  if (context.normalizedToolName === APPROVAL_TOOL_NAME) {
    const approvalPayload = parseApprovalPayload(context.argsToDisplay);
    if (!approvalPayload) {
      return null;
    }
    const approvalToolName = normalizeToolName(approvalPayload.toolName);
    if (approvalToolName === QUESTION_TOOL_NAME) {
      const questionPayload = parseAskUserQuestionPayload(
        approvalPayload.input,
      );
      if (questionPayload) {
        return wrapAssistantActivityCard(
          context.entry.key,
          <QuestionCard
            toolCallId={context.toolCall.id}
            payload={questionPayload}
            resolvedAnswers={resolveQuestionAnswers(
              questionPayload,
              context.toolResult,
            )}
          />,
        );
      }
    }
    return wrapAssistantActivityCard(
      context.entry.key,
      <ApprovalCard
        toolCallId={context.toolCall.id}
        toolName={approvalPayload.toolName ?? null}
        toolType={approvalPayload.toolType ?? null}
        input={approvalPayload.input}
        toolResult={context.toolResult}
        isStreaming={context.toolEntry.isStreaming}
      />,
    );
  }
  if (context.normalizedToolName !== QUESTION_TOOL_NAME) {
    return null;
  }
  const questionPayload = parseAskUserQuestionPayload(context.argsToDisplay);
  if (!questionPayload) {
    return null;
  }
  return wrapAssistantActivityCard(
    context.entry.key,
    <QuestionCard
      toolCallId={context.toolCall.id}
      payload={questionPayload}
      resolvedAnswers={resolveQuestionAnswers(
        questionPayload,
        context.toolResult,
      )}
    />,
  );
}

function renderAssistantToolActivityRow({
  context,
  toolResultsById,
  toolCallArguments,
  onCopyRow,
  defaultChildrenOpen,
  openAllSignal,
  closeAllSignal,
  onThinkingOpenStateChange,
}: {
  context: AssistantToolActivityContext;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  onCopyRow?: () => void;
  defaultChildrenOpen: boolean;
  openAllSignal: number;
  closeAllSignal: number;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
}): ReactNode {
  const sharedProps = {
    key: context.entry.key,
    args: context.argsToDisplay,
    runState: context.runState,
    startedAtMs: context.startedAtMs,
    completedAtMs: context.completedAtMs,
    runKey: `activity-item-${context.toolCall.id}`,
    onCopy: onCopyRow,
    defaultOpen: defaultChildrenOpen,
    expandAllSignal: openAllSignal,
    collapseAllSignal: closeAllSignal,
    onExpansionChange: onThinkingOpenStateChange,
  };
  if (context.entry.kind === "action") {
    return (
      <ActionItem
        {...sharedProps}
        name={context.rawToolName}
        result={context.formattedToolResult}
        railIcon={resolveActionRailIcon({
          name: context.rawToolName,
          args: context.argsToDisplay,
          result: context.formattedToolResult,
        })}
      />
    );
  }
  if (context.entry.kind === "terminal") {
    return (
      <TerminalItem
        {...sharedProps}
        name={context.rawToolName}
        result={context.formattedToolResult}
      />
    );
  }
  if (context.entry.kind === "subagent") {
    return (
      <SubagentItem
        {...sharedProps}
        name={context.rawToolName}
        toolCallId={context.toolCall.id}
        result={context.formattedToolResult}
      />
    );
  }
  if (context.entry.kind === "compaction") {
    return (
      <ToolCallItem
        {...sharedProps}
        name="Context compaction"
        result={resolveCompactionEntryLabel({
          entry: context.toolEntry,
          toolResultsById,
          toolCallArguments,
        })}
        railIcon={<FiArchive className="min-w-4" size={14} />}
      />
    );
  }
  return (
    <ToolCallItem
      {...sharedProps}
      name={context.rawToolName}
      result={context.formattedToolResult}
      railIcon={<PiWrenchFill size={13} className="min-w-4" />}
    />
  );
}

const AssistantActionRow = memo(function AssistantActionRow({
  entry,
  toolResultsById,
  toolCallArguments,
  showItemCopyButtons,
  defaultChildrenOpen,
  openAllSignal,
  closeAllSignal,
  suppressCollapsedSummary,
  onThinkingOpenStateChange,
}: AssistantActionRowProps) {
  const onCopyRow = showItemCopyButtons
    ? createActivityRowCopyHandler(
        buildCopyTextForActivityTimelineEntry({
          entry,
          toolResultsById,
          toolCallArguments,
        }),
      )
    : undefined;
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
  const context = resolveAssistantToolActivityContext({
    entry,
    toolResultsById,
    toolCallArguments,
  });
  return (
    resolveAssistantInteractiveActivityCard(context) ??
    renderAssistantToolActivityRow({
      context,
      toolResultsById,
      toolCallArguments,
      onCopyRow,
      defaultChildrenOpen,
      openAllSignal,
      closeAllSignal,
      onThinkingOpenStateChange,
    })
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
}: AssistantActionSectionProps) {
  return (
    <div
      data-chat-assistant-activity-items="true"
      className="flex w-full flex-col"
    >
      {timelineEntries.map((entry) => (
        <AssistantActionRow
          key={entry.key}
          entry={entry}
          toolResultsById={toolResultsById}
          toolCallArguments={toolCallArguments}
          showItemCopyButtons={showItemCopyButtons}
          defaultChildrenOpen={defaultChildrenOpen}
          openAllSignal={openAllSignal}
          closeAllSignal={closeAllSignal}
          suppressCollapsedSummary={suppressCollapsedSummary}
          onThinkingOpenStateChange={onThinkingOpenStateChange}
        />
      ))}
    </div>
  );
});

type ToolCallRunState = "running" | "success" | "failed" | "stopped";
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

function hasPendingInteractiveToolCall(
  toolCalls: ToolCall[] | null | undefined,
  toolResultsById: Record<string, ToolChatMessage>,
): boolean {
  if (!toolCalls || toolCalls.length === 0) {
    return false;
  }
  return toolCalls.some((toolCall) => {
    const normalizedName = normalizeToolName(toolCall.function?.name);
    if (
      normalizedName !== APPROVAL_TOOL_NAME &&
      normalizedName !== QUESTION_TOOL_NAME
    ) {
      return false;
    }
    return !toolResultsById[toolCall.id];
  });
}

function hasPendingInteractiveToolCallsInMessages(
  messages: AssistantChatMessage[],
  toolResultsById: Record<string, ToolChatMessage>,
): boolean {
  return messages.some((message) =>
    hasPendingInteractiveToolCall(message.tool_calls ?? null, toolResultsById),
  );
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

function ChatMessageBranchNavigator({
  branchInfo,
  onBranchSwitch,
}: {
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  const branchCount = branchInfo?.branchChatIds.length ?? 0;
  const activeIndex = branchInfo?.activeIndex ?? 0;
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < branchCount - 1;
  if (branchCount <= 1 || !branchInfo || !onBranchSwitch) {
    return null;
  }
  const goToBranch = (index: number) => {
    const nextId = branchInfo.branchChatIds[index];
    if (nextId) {
      onBranchSwitch(nextId);
    }
  };
  return (
    <div className="ml-0.5 inline-flex items-center gap-0.5 rounded-sm border border-setta-200 px-0.5 py-0.5 text-[9px] font-medium tabular-nums text-setta-500 dark:border-setta-700 dark:text-setta-300">
      <button
        type="button"
        aria-label="Previous branch"
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
        onClick={() => goToBranch(activeIndex - 1)}
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
        onClick={() => goToBranch(activeIndex + 1)}
        disabled={!canGoNext}
      >
        <MdChevronRight />
      </button>
    </div>
  );
}

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
          onClick={() => onRedo?.()}
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
      <ChatMessageBranchNavigator
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />
    </div>
  );
}

function getPlainTextFromMessage(message: BaseChatMessageUnion): string {
  const content = message.content ?? [];
  const output: string[] = [];
  for (const item of content) {
    if (item.type === C.LLM_TEXT) {
      output.push(item.text);
    } else if (item.type === C.LLM_THINKING) {
      output.push(item.thinking);
    }
  }
  return output.join("\n\n").trim();
}

function resolveCopyToolCallArgs({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): unknown {
  return resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
}

function resolveCopyToolCallResult(
  toolResult: ToolChatMessage | undefined,
): string | null {
  const result = formatToolResult(toolResult);
  if (typeof result === "string") {
    return result.trim().length > 0 ? result : null;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (result && typeof result === "object") {
    return formatToolArgs(result);
  }
  return null;
}

function buildCopyTextForToolCall({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): string {
  const toolName =
    toolResult?.tool_name ||
    toolCall.function?.name ||
    `Tool call ${toolCall.id}`;
  const lines: string[] = [toolName];
  const args = resolveCopyToolCallArgs({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  if (args) {
    lines.push(`Arguments:\n${formatToolArgs(args)}`);
  }
  const resultText = resolveCopyToolCallResult(toolResult);
  if (resultText) {
    lines.push(`Result:\n${resultText}`);
  }
  return lines.join("\n");
}

export function buildCopyTextForMessage({
  message,
  toolResultsById,
  toolCallArguments,
}: {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const output: string[] = [];
  const plainText = getPlainTextFromMessage(message);
  if (plainText.length > 0) {
    output.push(plainText);
  }
  if (message.role !== ChatRoleEnum.assistant) {
    return output.join("\n\n").trim();
  }
  for (const toolCall of message.tool_calls ?? []) {
    output.push(
      buildCopyTextForToolCall({
        toolCall,
        toolResult: toolResultsById[toolCall.id],
        toolCallArguments,
      }),
    );
  }
  return output.join("\n\n").trim();
}

function buildCopyTextForAssistantActivityMessage({
  message,
  toolResultsById,
  toolCallArguments,
}: {
  message: AssistantChatMessage;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const activityOnlyContent = message.content.filter(isThinkingContentItem);
  const hasActivityContent =
    activityOnlyContent.length > 0 || (message.tool_calls ?? []).length > 0;
  if (!hasActivityContent) {
    return "";
  }
  const activityOnlyMessage: AssistantChatMessage = {
    ...message,
    content: activityOnlyContent,
    attachments: [],
  };
  return buildCopyTextForMessage({
    message: activityOnlyMessage,
    toolResultsById,
    toolCallArguments,
  });
}

function buildCopyTextForActivityTimelineEntry({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ActivityTimelineEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  if (entry.kind === "thinking") {
    const syntheticMessage: AssistantChatMessage = {
      id: `activity-copy-thinking-${entry.key}`,
      role: ChatRoleEnum.assistant,
      content: [entry.thinkingEntry.item],
      attachments: [],
      tool_calls: null,
    };
    return buildCopyTextForAssistantActivityMessage({
      message: syntheticMessage,
      toolResultsById,
      toolCallArguments,
    });
  }

  const syntheticMessage: AssistantChatMessage = {
    id: `activity-copy-tool-${entry.key}`,
    role: ChatRoleEnum.assistant,
    content: [],
    attachments: [],
    tool_calls: [entry.toolEntry.toolCall],
  };
  return buildCopyTextForAssistantActivityMessage({
    message: syntheticMessage,
    toolResultsById,
    toolCallArguments,
  });
}

type ChatMessageProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive?: boolean;
  suppressActivityThoughtScroll?: boolean;
  suppressActivitySection?: boolean;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
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
};

type ChatMessageActionBarProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isEditing: boolean;
  isStreaming: boolean;
  canEdit: boolean;
  editDisabledReason: string | null;
  onStartEdit?: (bubbleWidthPx?: number) => void;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
};

type AssistantMessageRenderState = {
  displayItems: AssistantDisplayItem[];
  hasMeaningfulDisplayItems: boolean;
  activityTimelineEntries: ActivityTimelineEntry[];
  activitySectionTiming: {
    sectionState: ToolCallSectionState;
    startedAtMs: number | null;
    completedAtMs: number | null;
  };
  showTypingIndicator: boolean;
  shouldRenderBubble: boolean;
  hasActivityContent: boolean;
  latestActivityPreview: ActivityPreviewData;
  autoExpandPendingInteraction: boolean;
  suppressThoughtScrollAnimation: boolean;
  hasThinkingActivity: boolean;
};

type AssistantChatMessageBodyProps = {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  actionBar: ReactNode;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  interrupted: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
  messageTimestampMs: number | null;
};

type StaticChatMessageBodyProps = {
  message: NonAssistantChatMessage;
  attachments: ChatFileAttachment[];
  actionBar: ReactNode;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  conversationSearchTerms: Array<string>;
  isSearchMatchActive: boolean;
  messageTimestampMs: number | null;
};

type EditableUserChatMessageBodyProps = {
  message: BaseChatMessageUnion;
  attachments: ChatFileAttachment[];
  editingBubbleWidthPx?: number | null;
  canEdit: boolean;
  editDisabled: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
};

function resolveMessageAttachments(
  message: BaseChatMessageUnion,
): ChatFileAttachment[] {
  return "attachments" in message && Array.isArray(message.attachments)
    ? message.attachments
    : [];
}

function createRedoMessageHandler(
  messageId: string,
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean,
): (() => void) | undefined {
  if (!onRedoMessage) {
    return undefined;
  }
  return () => {
    void onRedoMessage(messageId);
  };
}

function useChatMessageActionBar({
  message,
  toolResultsById,
  toolCallArguments,
  isEditing,
  isStreaming,
  canEdit,
  editDisabledReason,
  onStartEdit,
  onRedoMessage,
  branchInfo,
  onBranchSwitch,
}: ChatMessageActionBarProps): ReactNode {
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
  const redoHandler = useMemo(
    () => createRedoMessageHandler(message.id, onRedoMessage),
    [message.id, onRedoMessage],
  );
  if (isEditing) {
    return null;
  }
  return (
    <ChatMessageActions
      onCopy={handleCopy}
      showRedo={
        message.role === ChatRoleEnum.assistant && redoHandler !== undefined
      }
      onRedo={redoHandler}
      redoDisabled={isStreaming}
      redoDisabledReason={isStreaming ? "Wait for response to finish." : null}
      showEdit={message.role === ChatRoleEnum.user && canEdit}
      editDisabled={Boolean(editDisabledReason)}
      editDisabledReason={editDisabledReason}
      onEdit={onStartEdit}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  );
}

function renderStaticChatMessageContentItem({
  item,
  message,
  itemIndex,
  textClassName,
  imageClassName,
  conversationSearchTerms,
}: {
  item: NonAssistantChatMessage["content"][number];
  message: NonAssistantChatMessage;
  itemIndex: number;
  textClassName: string;
  imageClassName?: string;
  conversationSearchTerms: Array<string>;
}): ReactNode {
  const key = `${message.id}-${itemIndex}`;
  switch (item.type) {
    case C.LLM_TEXT:
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
    case C.LLM_THINKING:
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
    case "image_url":
      return (
        <ChatImage
          key={key}
          url={item.image_url.url}
          className={imageClassName}
        />
      );
    default:
      return null;
  }
}

function EditableUserChatMessageBody({
  message,
  attachments,
  editingBubbleWidthPx,
  canEdit,
  editDisabled,
  onCancelEdit,
  onSaveEdit,
}: EditableUserChatMessageBodyProps) {
  return (
    <UserChatBubble messageId={message.id} bubbleWidthPx={editingBubbleWidthPx}>
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

function StaticChatMessageBody({
  message,
  attachments,
  actionBar,
  attachmentUrlMap,
  requestAttachmentUrls,
  conversationSearchTerms,
  isSearchMatchActive,
  messageTimestampMs,
}: StaticChatMessageBodyProps) {
  const isSystem = message.role === ChatRoleEnum.system;
  const textClassName = isSystem ? SYSTEM_MARKDOWN_CLASS : USER_MARKDOWN_CLASS;
  const imageClassName = isSystem ? undefined : "border-white/30";
  const content = message.content ?? [];
  const bubbleContent = (
    <>
      <ChatAttachmentList
        attachments={attachments}
        isUser={!isSystem}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        conversationSearchTerms={conversationSearchTerms}
      />
      {content.map((item, itemIndex) =>
        renderStaticChatMessageContentItem({
          item,
          message,
          itemIndex,
          textClassName,
          imageClassName,
          conversationSearchTerms,
        }),
      )}
    </>
  );
  const footer = (
    <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
  );
  if (isSystem) {
    return (
      <SystemChatBubble
        messageId={message.id}
        actions={actionBar}
        footer={footer}
        isSearchMatchActive={isSearchMatchActive}
      >
        {bubbleContent}
      </SystemChatBubble>
    );
  }
  return (
    <UserChatBubble
      messageId={message.id}
      actions={actionBar}
      footer={footer}
      isSearchMatchActive={isSearchMatchActive}
    >
      {bubbleContent}
    </UserChatBubble>
  );
}

function useAssistantMessageRenderState({
  message,
  attachments,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  interrupted,
}: {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  interrupted: boolean;
}): AssistantMessageRenderState {
  const assistantContent = message.content ?? EMPTY_ASSISTANT_CONTENT;
  const { activityKey } = useMemo(
    () => getStreamActivitySummary(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const { displayItems } = useMemo(
    () => partitionAssistantContent(assistantContent),
    [assistantContent],
  );
  const hasMeaningfulDisplayItems = useMemo(
    () => hasMeaningfulAssistantDisplayItems(displayItems),
    [displayItems],
  );
  const showTypingIndicator = useIdleStreamSpinner(
    isStreaming,
    activityKey,
    spinnerDelayMs,
  );
  const activityTimelineEntries = useMemo(
    () =>
      buildActivityTimelineEntries(
        [
          {
            message,
            isStreaming,
            wasInterrupted: interrupted,
          },
        ],
        toolResultsById,
      ),
    [interrupted, isStreaming, message, toolResultsById],
  );
  const activitySectionTiming = useMemo(
    () =>
      resolveActivitySectionTiming({
        timelineEntries: activityTimelineEntries,
        toolResultsById,
      }),
    [activityTimelineEntries, toolResultsById],
  );
  const latestActivityPreview = useMemo(
    () =>
      resolveLatestActivityPreview({
        timelineEntries: activityTimelineEntries,
        toolResultsById,
        toolCallArguments,
      }),
    [activityTimelineEntries, toolCallArguments, toolResultsById],
  );
  const hasThinkingActivity = useMemo(
    () => activityTimelineEntries.some((entry) => entry.kind === "thinking"),
    [activityTimelineEntries],
  );
  return {
    displayItems,
    hasMeaningfulDisplayItems,
    activityTimelineEntries,
    activitySectionTiming,
    showTypingIndicator,
    shouldRenderBubble: attachments.length > 0 || hasMeaningfulDisplayItems,
    hasActivityContent:
      !suppressActivitySection && activityTimelineEntries.length > 0,
    latestActivityPreview,
    autoExpandPendingInteraction: hasPendingInteractiveToolCall(
      message.tool_calls ?? null,
      toolResultsById,
    ),
    suppressThoughtScrollAnimation:
      suppressActivityThoughtScroll ||
      (isStreaming && hasMeaningfulDisplayItems),
    hasThinkingActivity,
  };
}

function renderAssistantActivitySection({
  message,
  actionBar,
  renderState,
  toolResultsById,
  toolCallArguments,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
}: {
  message: AssistantChatMessage;
  actionBar: ReactNode;
  renderState: AssistantMessageRenderState;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
}): ReactNode {
  if (!renderState.hasActivityContent) {
    return null;
  }
  return (
    <AssistantActivityActionsAnchor actions={actionBar}>
      <AssistantReasoningCard>
        <AssistantActivitySection
          preview={renderState.latestActivityPreview}
          itemCount={renderState.activityTimelineEntries.length}
          sectionState={renderState.activitySectionTiming.sectionState}
          startedAtMs={renderState.activitySectionTiming.startedAtMs}
          completedAtMs={renderState.activitySectionTiming.completedAtMs}
          runKey={`activity-${message.id}`}
          suppressThoughtScrollAnimation={
            renderState.suppressThoughtScrollAnimation
          }
          defaultOpen={
            activityAccordionOpenByDefault ||
            renderState.autoExpandPendingInteraction
          }
          defaultChildrenOpen={activityChildrenOpenByDefault}
          conversationSearchTerms={conversationSearchTerms}
        >
          {(showItemCopyButtons, childAccordionControl) => (
            <AssistantToolCallCard>
              <AssistantActionSection
                timelineEntries={renderState.activityTimelineEntries}
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
  );
}

function renderAssistantBubble({
  message,
  attachments,
  attachmentUrlMap,
  requestAttachmentUrls,
  conversationSearchTerms,
  renderState,
  isStreaming,
  messageTimestampMs,
}: {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  conversationSearchTerms: Array<string>;
  renderState: AssistantMessageRenderState;
  isStreaming: boolean;
  messageTimestampMs: number | null;
}): ReactNode {
  if (!renderState.shouldRenderBubble) {
    return null;
  }
  return (
    <>
      <LLMChatBubble>
        <ChatAttachmentList
          attachments={attachments}
          isUser={false}
          attachmentUrlMap={attachmentUrlMap}
          requestAttachmentUrls={requestAttachmentUrls}
          conversationSearchTerms={conversationSearchTerms}
        />
        {renderState.displayItems.map(({ item, fullIndex }) => (
          <StreamItem
            key={fullIndex}
            item={item}
            isStreaming={isStreaming}
            runKey={`${message.id}-content-${fullIndex}`}
            conversationSearchTerms={conversationSearchTerms}
          />
        ))}
      </LLMChatBubble>
      <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
    </>
  );
}

function renderAssistantEmptyTimestamp({
  renderState,
  messageTimestampMs,
}: {
  renderState: AssistantMessageRenderState;
  messageTimestampMs: number | null;
}): ReactNode {
  if (renderState.shouldRenderBubble || renderState.hasActivityContent) {
    return null;
  }
  return <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />;
}

function resolveAssistantTypingIndicatorVisible(
  renderState: AssistantMessageRenderState,
): boolean {
  return (
    renderState.showTypingIndicator &&
    !renderState.hasMeaningfulDisplayItems &&
    !renderState.hasThinkingActivity
  );
}

function AssistantChatMessageBody({
  message,
  attachments,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  actionBar,
  attachmentUrlMap,
  requestAttachmentUrls,
  interrupted,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
  messageTimestampMs,
}: AssistantChatMessageBodyProps) {
  const renderState = useAssistantMessageRenderState({
    message,
    attachments,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    suppressActivityThoughtScroll,
    suppressActivitySection,
    interrupted,
  });
  if (!renderState.shouldRenderBubble && !renderState.hasActivityContent) {
    if (renderState.showTypingIndicator) {
      return (
        <AssistantMessageGroup messageId={message.id}>
          <AssistantTypingIndicator visible={true} />
        </AssistantMessageGroup>
      );
    }
    return null;
  }
  return (
    <AssistantMessageGroup
      messageId={message.id}
      actions={renderState.hasActivityContent ? undefined : actionBar}
      isSearchMatchActive={isSearchMatchActive}
    >
      {renderAssistantActivitySection({
        message,
        actionBar,
        renderState,
        toolResultsById,
        toolCallArguments,
        activityAccordionOpenByDefault,
        activityChildrenOpenByDefault,
        conversationSearchTerms,
      })}
      {renderAssistantBubble({
        message,
        attachments,
        attachmentUrlMap,
        requestAttachmentUrls,
        conversationSearchTerms,
        renderState,
        isStreaming,
        messageTimestampMs,
      })}
      <AssistantTypingIndicator
        visible={resolveAssistantTypingIndicatorVisible(renderState)}
      />
      {renderAssistantEmptyTimestamp({
        renderState,
        messageTimestampMs,
      })}
    </AssistantMessageGroup>
  );
}

type ResolvedChatMessageRenderProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  isEditing: boolean;
  editingBubbleWidthPx?: number | null;
  interrupted: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
  canEdit: boolean;
  editDisabledReason: string | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  actionBar: ReactNode;
  attachments: ChatFileAttachment[];
  messageTimestampMs: number | null;
};

function renderResolvedChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  attachmentUrlMap,
  requestAttachmentUrls,
  isEditing,
  editingBubbleWidthPx,
  interrupted,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
  canEdit,
  editDisabledReason,
  onCancelEdit,
  onSaveEdit,
  actionBar,
  attachments,
  messageTimestampMs,
}: ResolvedChatMessageRenderProps): ReactNode {
  if (message.role === ChatRoleEnum.assistant) {
    return (
      <AssistantChatMessageBody
        message={message}
        attachments={attachments}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={isStreaming}
        isSearchMatchActive={isSearchMatchActive}
        suppressActivityThoughtScroll={suppressActivityThoughtScroll}
        suppressActivitySection={suppressActivitySection}
        actionBar={actionBar}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        interrupted={interrupted}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        conversationSearchTerms={conversationSearchTerms}
        messageTimestampMs={messageTimestampMs}
      />
    );
  }
  if (message.role === ChatRoleEnum.user && isEditing) {
    return (
      <EditableUserChatMessageBody
        message={message}
        attachments={attachments}
        editingBubbleWidthPx={editingBubbleWidthPx}
        canEdit={canEdit}
        editDisabled={Boolean(editDisabledReason)}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
      />
    );
  }
  return (
    <StaticChatMessageBody
      message={message}
      attachments={attachments}
      actionBar={actionBar}
      attachmentUrlMap={attachmentUrlMap}
      requestAttachmentUrls={requestAttachmentUrls}
      conversationSearchTerms={conversationSearchTerms}
      isSearchMatchActive={isSearchMatchActive}
      messageTimestampMs={messageTimestampMs}
    />
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
}: ChatMessageProps) {
  const attachments = resolveMessageAttachments(message);
  const actionBar = useChatMessageActionBar({
    message,
    toolResultsById,
    toolCallArguments,
    isEditing,
    isStreaming,
    canEdit,
    editDisabledReason,
    onStartEdit,
    onRedoMessage,
    branchInfo,
    onBranchSwitch,
  });
  return renderResolvedChatMessage({
    message,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    isSearchMatchActive,
    suppressActivityThoughtScroll,
    suppressActivitySection,
    onRedoMessage,
    attachmentUrlMap,
    requestAttachmentUrls,
    isEditing,
    editingBubbleWidthPx,
    interrupted,
    activityAccordionOpenByDefault,
    activityChildrenOpenByDefault,
    conversationSearchTerms,
    canEdit,
    editDisabledReason,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    branchInfo,
    onBranchSwitch,
    actionBar,
    attachments,
    messageTimestampMs: resolveMessageCreatedAtMs(message),
  });
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

function isAssistantActivityOnlyMessage(
  message: BaseChatMessageUnion,
): message is AssistantChatMessage {
  if (message.role !== ChatRoleEnum.assistant) {
    return false;
  }
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
  if (attachments.length > 0) {
    return false;
  }
  const { thinkingItems, displayItems } = partitionAssistantContent(
    message.content,
  );
  if (displayItems.length > 0) {
    return false;
  }
  const toolCalls = message.tool_calls ?? [];
  return thinkingItems.length > 0 || toolCalls.length > 0;
}

function hasAssistantActivityContent(message: AssistantChatMessage): boolean {
  const { thinkingItems } = partitionAssistantContent(message.content);
  const toolCalls = message.tool_calls ?? [];
  return thinkingItems.length > 0 || toolCalls.length > 0;
}

type ChatMessagesProps = {
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
};

type GroupedAssistantActivityData = {
  firstMessageId: string;
  nextIndex: number;
  groupedMessages: AssistantChatMessage[];
  activityMessageContexts: ActivityMessageContext[];
  suppressedTrailingMessageId: string | null;
};

type GroupedAssistantActivityMessageProps = {
  groupData: GroupedAssistantActivityData;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  activeSearchMessageId?: string | null;
  conversationSearchTerms: Array<string>;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfo?: ChatMessageBranchInfo;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  suppressActivityThoughtScrollAnimation: boolean;
};

type RenderableChatMessageProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  activeSearchMessageId?: string | null;
  conversationSearchTerms: Array<string>;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfo?: ChatMessageBranchInfo;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  interrupted: boolean;
  suppressActivityThoughtScrollAnimation: boolean;
  suppressActivitySection: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  canEditParams: boolean;
  editDisabledReason?: string | null;
  editingMessageId: string | null;
  editingBubbleWidthPx: number | null;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>;
};

function buildActivityMessageContext({
  message,
  waitingForResponse,
  streamingMessageId,
  interruptedAssistantMessageIds,
}: {
  message: AssistantChatMessage;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  interruptedAssistantMessageIds?: Record<string, true>;
}): ActivityMessageContext {
  return {
    message,
    isStreaming: waitingForResponse && message.id === streamingMessageId,
    wasInterrupted: Boolean(interruptedAssistantMessageIds?.[message.id]),
  };
}

function isAssistantMessageWithActivity(
  message: BaseChatMessageUnion | undefined,
): message is AssistantChatMessage {
  return (
    message?.role === ChatRoleEnum.assistant &&
    !isAssistantActivityOnlyMessage(message) &&
    hasAssistantActivityContent(message)
  );
}

function collectGroupedAssistantActivityData({
  messages,
  startIndex,
  waitingForResponse,
  streamingMessageId,
  interruptedAssistantMessageIds,
}: {
  messages: Array<BaseChatMessageUnion>;
  startIndex: number;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  interruptedAssistantMessageIds?: Record<string, true>;
}): GroupedAssistantActivityData | null {
  const firstMessage = messages[startIndex];
  if (!firstMessage || !isAssistantActivityOnlyMessage(firstMessage)) {
    return null;
  }
  const groupedMessages: AssistantChatMessage[] = [];
  const activityMessageContexts: ActivityMessageContext[] = [];
  let groupEnd = startIndex;
  while (groupEnd < messages.length) {
    const nextMessage = messages[groupEnd];
    if (!isAssistantActivityOnlyMessage(nextMessage)) {
      break;
    }
    groupedMessages.push(nextMessage);
    activityMessageContexts.push(
      buildActivityMessageContext({
        message: nextMessage,
        waitingForResponse,
        streamingMessageId,
        interruptedAssistantMessageIds,
      }),
    );
    groupEnd += 1;
  }
  const trailingAssistantMessage = messages[groupEnd];
  if (!isAssistantMessageWithActivity(trailingAssistantMessage)) {
    return {
      firstMessageId: firstMessage.id,
      nextIndex: groupEnd,
      groupedMessages,
      activityMessageContexts,
      suppressedTrailingMessageId: null,
    };
  }
  activityMessageContexts.push(
    buildActivityMessageContext({
      message: trailingAssistantMessage,
      waitingForResponse,
      streamingMessageId,
      interruptedAssistantMessageIds,
    }),
  );
  return {
    firstMessageId: firstMessage.id,
    nextIndex: groupEnd,
    groupedMessages,
    activityMessageContexts,
    suppressedTrailingMessageId: trailingAssistantMessage.id,
  };
}

function buildGroupedAssistantActivityCopyText({
  groupedMessages,
  toolResultsById,
  toolCallArguments,
}: {
  groupedMessages: AssistantChatMessage[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  return groupedMessages
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
}

function resolveChatMessageEditDisabledReason({
  canEditParams,
  waitingForResponse,
  editDisabledReason,
}: {
  canEditParams: boolean;
  waitingForResponse: boolean;
  editDisabledReason?: string | null;
}): string | null {
  if (!canEditParams) {
    return "Editing disabled by share policy.";
  }
  if (waitingForResponse) {
    return "Wait for response to finish.";
  }
  return editDisabledReason ?? null;
}

function startEditingMessage(
  messageId: string,
  bubbleWidthPx: number | undefined,
  setEditingMessageId: Dispatch<SetStateAction<string | null>>,
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>,
) {
  setEditingBubbleWidthPx(bubbleWidthPx ?? null);
  setEditingMessageId(messageId);
}

function stopEditingMessage(
  setEditingMessageId: Dispatch<SetStateAction<string | null>>,
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>,
) {
  setEditingMessageId(null);
  setEditingBubbleWidthPx(null);
}

function createSaveEditHandler({
  messageId,
  onEditMessage,
  setEditingMessageId,
  setEditingBubbleWidthPx,
}: {
  messageId: string;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>;
}) {
  if (!onEditMessage) {
    return undefined;
  }
  return async (text: string, attachments: ChatFileAttachment[]) => {
    const result = await onEditMessage(messageId, text, attachments);
    if (result === true) {
      stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
    }
    return result;
  };
}

function resolveSuppressActivityThoughtScrollAnimation({
  messages,
  waitingForResponse,
  streamingMessageId,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
}): boolean {
  if (!waitingForResponse || !streamingMessageId) {
    return false;
  }
  const streamingMessage = messages.find(
    (message) => message.id === streamingMessageId,
  );
  if (!streamingMessage || streamingMessage.role !== ChatRoleEnum.assistant) {
    return false;
  }
  const { displayItems } = partitionAssistantContent(streamingMessage.content);
  return hasMeaningfulAssistantDisplayItems(displayItems);
}

function resolvePendingAssistantPlaceholderMessage({
  waitingForResponse,
  lastMessage,
}: {
  waitingForResponse: boolean;
  lastMessage: BaseChatMessageUnion | undefined;
}): AssistantChatMessage | null {
  if (!waitingForResponse || lastMessage?.role === ChatRoleEnum.assistant) {
    return null;
  }
  const pendingMessageId = lastMessage?.id
    ? `pending-${lastMessage.id}`
    : "pending";
  return {
    id: pendingMessageId,
    role: ChatRoleEnum.assistant,
    content: [],
    tool_calls: null,
  };
}

const GroupedAssistantActivityMessage = memo(
  function GroupedAssistantActivityMessage({
    groupData,
    toolResultsById,
    toolCallArguments,
    waitingForResponse,
    activeSearchMessageId,
    conversationSearchTerms,
    onRedoMessage,
    onBranchSwitch,
    branchInfo,
    activityAccordionOpenByDefault,
    activityChildrenOpenByDefault,
    suppressActivityThoughtScrollAnimation,
  }: GroupedAssistantActivityMessageProps) {
    const timelineEntries = useMemo(
      () =>
        buildActivityTimelineEntries(
          groupData.activityMessageContexts,
          toolResultsById,
        ),
      [groupData.activityMessageContexts, toolResultsById],
    );
    const activityMessages = useMemo(
      () => groupData.activityMessageContexts.map((context) => context.message),
      [groupData.activityMessageContexts],
    );
    const latestActivityPreview = useMemo(
      () =>
        resolveLatestActivityPreview({
          timelineEntries,
          toolResultsById,
          toolCallArguments,
        }),
      [timelineEntries, toolCallArguments, toolResultsById],
    );
    const activitySectionTiming = useMemo(
      () =>
        resolveActivitySectionTiming({
          timelineEntries,
          toolResultsById,
        }),
      [timelineEntries, toolResultsById],
    );
    const autoExpandPendingInteraction = useMemo(
      () =>
        hasPendingInteractiveToolCallsInMessages(
          activityMessages,
          toolResultsById,
        ),
      [activityMessages, toolResultsById],
    );
    const handleGroupedCopy = useCallback(() => {
      const text = buildGroupedAssistantActivityCopyText({
        groupedMessages: groupData.groupedMessages,
        toolResultsById,
        toolCallArguments,
      });
      copyTextWithNotifications({
        text,
        emptyMessage: "Nothing to copy for this message.",
        successMessage: "Copied message.",
        failureMessage: "Failed to copy message.",
      });
    }, [groupData.groupedMessages, toolCallArguments, toolResultsById]);
    const redoHandler = useMemo(
      () => createRedoMessageHandler(groupData.firstMessageId, onRedoMessage),
      [groupData.firstMessageId, onRedoMessage],
    );
    if (timelineEntries.length === 0) {
      return null;
    }
    const actionBar = (
      <ChatMessageActions
        onCopy={handleGroupedCopy}
        showRedo={redoHandler !== undefined}
        onRedo={redoHandler}
        redoDisabled={waitingForResponse}
        redoDisabledReason={
          waitingForResponse ? "Wait for response to finish." : null
        }
        showEdit={false}
        editDisabled={false}
        editDisabledReason={null}
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />
    );
    return (
      <AssistantMessageGroup
        messageId={groupData.firstMessageId}
        isSearchMatchActive={groupData.firstMessageId === activeSearchMessageId}
      >
        <AssistantActivityActionsAnchor actions={actionBar}>
          <AssistantReasoningCard>
            <AssistantActivitySection
              preview={latestActivityPreview}
              itemCount={timelineEntries.length}
              sectionState={activitySectionTiming.sectionState}
              startedAtMs={activitySectionTiming.startedAtMs}
              completedAtMs={activitySectionTiming.completedAtMs}
              runKey={`activity-${groupData.firstMessageId}`}
              suppressThoughtScrollAnimation={
                suppressActivityThoughtScrollAnimation
              }
              defaultOpen={
                activityAccordionOpenByDefault || autoExpandPendingInteraction
              }
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
      </AssistantMessageGroup>
    );
  },
);

function RenderableChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  waitingForResponse,
  streamingMessageId,
  activeSearchMessageId,
  conversationSearchTerms,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfo,
  attachmentUrlMap,
  requestAttachmentUrls,
  interrupted,
  suppressActivityThoughtScrollAnimation,
  suppressActivitySection,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  canEditParams,
  editDisabledReason,
  editingMessageId,
  editingBubbleWidthPx,
  setEditingMessageId,
  setEditingBubbleWidthPx,
}: RenderableChatMessageProps) {
  const canEdit = Boolean(onEditMessage);
  const isEditing = editingMessageId === message.id;
  const resolvedEditDisabledReason = resolveChatMessageEditDisabledReason({
    canEditParams,
    waitingForResponse,
    editDisabledReason,
  });
  const saveEditHandler = createSaveEditHandler({
    messageId: message.id,
    onEditMessage,
    setEditingMessageId,
    setEditingBubbleWidthPx,
  });
  return (
    <ChatMessage
      message={message}
      toolResultsById={toolResultsById}
      toolCallArguments={toolCallArguments}
      isStreaming={
        waitingForResponse &&
        message.role === ChatRoleEnum.assistant &&
        message.id === streamingMessageId
      }
      isSearchMatchActive={message.id === activeSearchMessageId}
      suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
      suppressActivitySection={suppressActivitySection}
      onRedoMessage={onRedoMessage}
      attachmentUrlMap={attachmentUrlMap}
      requestAttachmentUrls={requestAttachmentUrls}
      isEditing={isEditing}
      editingBubbleWidthPx={isEditing ? editingBubbleWidthPx : null}
      interrupted={interrupted}
      activityAccordionOpenByDefault={activityAccordionOpenByDefault}
      activityChildrenOpenByDefault={activityChildrenOpenByDefault}
      conversationSearchTerms={conversationSearchTerms}
      canEdit={canEdit}
      editDisabledReason={resolvedEditDisabledReason}
      onStartEdit={
        !canEdit || resolvedEditDisabledReason
          ? undefined
          : (bubbleWidthPx?: number) => {
              startEditingMessage(
                message.id,
                bubbleWidthPx,
                setEditingMessageId,
                setEditingBubbleWidthPx,
              );
            }
      }
      onCancelEdit={() => {
        stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
      }}
      onSaveEdit={saveEditHandler}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  );
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
}: ChatMessagesProps) {
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
    useChatMessageAttachmentUrls(messages);
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );
  const lastMessage = messages[messages.length - 1];
  const streamingMessageId = useMemo(
    () =>
      waitingForResponse ? resolveStreamingAssistantMessageId(messages) : null,
    [messages, waitingForResponse],
  );
  const suppressActivityThoughtScrollAnimation = useMemo(
    () =>
      resolveSuppressActivityThoughtScrollAnimation({
        messages,
        waitingForResponse,
        streamingMessageId,
      }),
    [messages, streamingMessageId, waitingForResponse],
  );

  useEffect(() => {
    if (waitingForResponse) {
      stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
    }
  }, [waitingForResponse]);

  const output: ReactNode[] = [];
  const suppressedActivitySectionMessageIds = new Set<string>();
  let index = 0;
  while (index < messages.length) {
    const activityGroup = collectGroupedAssistantActivityData({
      messages,
      startIndex: index,
      waitingForResponse,
      streamingMessageId,
      interruptedAssistantMessageIds,
    });
    if (activityGroup) {
      if (activityGroup.suppressedTrailingMessageId) {
        suppressedActivitySectionMessageIds.add(
          activityGroup.suppressedTrailingMessageId,
        );
      }
      output.push(
        <GroupedAssistantActivityMessage
          key={`tool-call-group-${activityGroup.firstMessageId}`}
          groupData={activityGroup}
          toolResultsById={toolResultsById}
          toolCallArguments={toolCallArguments}
          waitingForResponse={waitingForResponse}
          activeSearchMessageId={activeSearchMessageId}
          conversationSearchTerms={conversationSearchTerms}
          onRedoMessage={onRedoMessage}
          onBranchSwitch={onBranchSwitch}
          branchInfo={branchInfoByMessage?.[activityGroup.firstMessageId]}
          activityAccordionOpenByDefault={activityAccordionOpenByDefault}
          activityChildrenOpenByDefault={activityChildrenOpenByDefault}
          suppressActivityThoughtScrollAnimation={
            suppressActivityThoughtScrollAnimation
          }
        />,
      );
      index = activityGroup.nextIndex;
      continue;
    }
    const message = messages[index];
    output.push(
      <RenderableChatMessage
        key={message.id}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        waitingForResponse={waitingForResponse}
        streamingMessageId={streamingMessageId}
        activeSearchMessageId={activeSearchMessageId}
        conversationSearchTerms={conversationSearchTerms}
        onRedoMessage={onRedoMessage}
        onEditMessage={onEditMessage}
        onBranchSwitch={onBranchSwitch}
        branchInfo={branchInfoByMessage?.[message.id]}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        interrupted={Boolean(interruptedAssistantMessageIds?.[message.id])}
        suppressActivityThoughtScrollAnimation={
          suppressActivityThoughtScrollAnimation
        }
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          message.id,
        )}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        canEditParams={canEditParams}
        editDisabledReason={editDisabledReason}
        editingMessageId={editingMessageId}
        editingBubbleWidthPx={editingBubbleWidthPx}
        setEditingMessageId={setEditingMessageId}
        setEditingBubbleWidthPx={setEditingBubbleWidthPx}
      />,
    );
    index += 1;
  }

  const pendingAssistantMessage = resolvePendingAssistantPlaceholderMessage({
    waitingForResponse,
    lastMessage,
  });
  if (pendingAssistantMessage) {
    output.push(
      <ChatMessage
        key={pendingAssistantMessage.id}
        message={pendingAssistantMessage}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        isSearchMatchActive={
          pendingAssistantMessage.id === activeSearchMessageId
        }
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          pendingAssistantMessage.id,
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
      assignScrollRef(scrollRef, nextNode);
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
    syncActiveSearchHighlight({
      scrollContainer,
      conversationSearchTerms,
      activeSearchMatchIndex,
      previousActiveSearchTargetRef,
      onConversationSearchMatchCountChange,
      setActiveSearchMessageId,
    });
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

function formatToolResult(
  toolResult: ToolChatMessage | undefined,
): ToolResultValue | undefined {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    const renderedEntries = toolResult.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text;
        }
        if (entry.type === "tool_reference") {
          return `Tool reference: ${entry.tool_name}`;
        }
        if (entry.type === "resource") {
          const label = entry.resource?.uri
            ? `Resource: ${entry.resource.uri}`
            : "Resource";
          return entry.resource?.mimeType
            ? `${label} (${entry.resource.mimeType})`
            : label;
        }
        if (entry.type === "image") {
          return entry.mimeType ? `Image (${entry.mimeType})` : "Image";
        }
        return JSON.stringify(entry, null, 2);
      })
      .filter((entry) => entry.trim().length > 0);
    if (renderedEntries.length > 0) {
      return renderedEntries.join("\n\n");
    }
  }
  return toolResult.result;
}
