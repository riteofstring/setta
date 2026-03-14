import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { BrailleSpinner } from "components/Utils/BrailleSpinner";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  ReactNode,
  type PointerEvent as ReactPointerEvent,
  Ref,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaBrain } from "react-icons/fa6";
import {
  FiCpu,
  FiArchive,
  FiCopy,
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
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
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
  type ApprovalPayload,
  type AskUserQuestionPayload,
  QUESTION_TOOL_NAME,
  TODO_TOOL_NAME,
  type TodoListPayload,
  normalizeToolName,
  parseAnswers,
  parseApprovalPayload,
  parseAskUserQuestionPayload,
  parseTodoPayload,
  resolveToolCallArguments,
} from "utils/claudeTools";
import {
  type CodeLanguage,
  resolveCodeLanguageFromPath,
} from "utils/codeLanguage";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_attachment_download_urls } from "utils/generatedEndpoints";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  CodeLanguageEnum,
  ToolCall,
  ToolChatMessage,
} from "utils/generatedTypes";
import { ApprovalCard } from "./ApprovalCard";
import { ChatMessageEditor } from "./ChatMessageEditor";
import { QuestionCard } from "./QuestionCard";
import { TodoListCard } from "./TodoListCard";
import { useTypewriterEffect } from "./useTypewriterEffect";

type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: "assistant" }
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
  "prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-snug prose-headings:mt-5 prose-headings:mb-2 prose-h1:text-[1.05rem] prose-h2:text-[1rem] prose-h3:text-[0.95rem] prose-h4:text-[0.9rem] prose-p:my-0 prose-p:leading-[1.45] prose-ul:my-1 prose-ol:my-1 prose-ul:pl-5 prose-ol:pl-5 prose-ul:leading-[1.45] prose-ol:leading-[1.45] prose-li:my-0 prose-li:leading-[1.45] prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 prose-pre:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p+p]:mt-2.5 [&_p+ul]:mt-2 [&_p+ol]:mt-2 [&_ul+p]:mt-2.5 [&_ol+p]:mt-2.5 [&_li+li]:mt-0.5 [&_li_p]:my-0 [&_*]:break-words";
const ASSISTANT_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;
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
const ASSISTANT_ACTIVITY_CONTENT_CLASS = `${ACTIVITY_ACCORDION_CONTENT_CLASS} pl-0.5 pt-1`;
const TOOL_SECTION_CARD_CLASS = "w-full overflow-hidden";
const TOOL_SECTION_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const TOOL_ROW_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const ASSISTANT_ACTIVITY_PARENT_CLASS =
  "w-full overflow-hidden border-l-[3px] border-setta-200/90 bg-transparent pl-1.5 dark:border-setta-700/90";
const ASSISTANT_ACTIVITY_TRIGGER_CLASS = `group flex w-full cursor-pointer items-stretch pl-0.5 pr-2 text-left transition-colors ${ACTIVITY_ROW_HOVER_CLASS} [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const ACTIVITY_COUNT_BADGE_CLASS =
  "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200";
const ACTIVITY_COPY_BUTTON_BASE_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-setta-500 transition-colors hover:bg-setta-200/80 hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:text-setta-300 dark:hover:bg-setta-700 dark:hover:text-setta-100";
const ACTIVITY_SECTION_COPY_BUTTON_CLASS = `${ACTIVITY_COPY_BUTTON_BASE_CLASS} bg-setta-100/90 dark:bg-setta-800/85`;
const ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS = `${ACTIVITY_SECTION_COPY_BUTTON_CLASS} opacity-0 pointer-events-none transition-opacity group-hover/chat-activity-row:opacity-100 group-hover/chat-activity-row:pointer-events-auto group-focus-within/chat-activity-row:opacity-100 group-focus-within/chat-activity-row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto`;
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

type AttachmentUrlEntry = {
  url: string;
  expiresAt: number;
};
type AttachmentUrlResponseEntry = {
  artifactId: string;
  url: string;
  expiresAt: number;
};
type AttachmentTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

type AssistantActivityChildAccordionControl = {
  defaultOpen: boolean;
  expandAllSignal: number;
  collapseAllSignal: number;
};

type ChatMessageListProps = {
  messages: Array<BaseChatMessageUnion>;
  allMessagesForToolResults?: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments?: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  activeSearchMessageId?: string | null;
  className?: string;
  contentClassName?: string;
  scrollRef?: Ref<HTMLDivElement>;
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

type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
};

function MarkdownContent({
  content,
  className,
  role,
  isStreaming,
}: MarkdownContentProps) {
  const shouldAnimate = role === ChatRoleEnum.assistant && isStreaming;
  const displayText = useTypewriterEffect(content, shouldAnimate, 5);
  const markdownWidthClassName =
    role === ChatRoleEnum.assistant ? "w-fit max-w-full" : "w-full max-w-full";
  const markdownClassName = `${markdownWidthClassName} ${className}`;
  if (shouldAnimate) {
    return (
      <div className={markdownClassName} data-chat-streaming-markdown="true">
        <pre
          className="m-0 whitespace-pre-wrap break-words"
          style={{ fontFamily: "inherit" }}
        >
          {displayText}
        </pre>
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      className={markdownClassName}
      components={{ code: CodeBlock, pre: MarkdownCodePre }}
    >
      {displayText}
    </ReactMarkdown>
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

type StructuredOutputKind = "plain" | "code" | "diff";
type StructuredOutputPayload = {
  text: string;
  kind: StructuredOutputKind;
  language: CodeLanguage | null;
  useJsx: boolean;
  pathHint: string | null;
};

type StructuredOutputPart = "input" | "output";

function resolveCodeLanguageFromMimeType(mimeType: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!mimeType) {
    return { language: null, useJsx: false };
  }
  const normalized = mimeType.trim().toLowerCase();
  if (
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "text/json"
  ) {
    return { language: CodeLanguageEnum.json, useJsx: false };
  }
  if (
    normalized === "application/yaml" ||
    normalized === "text/yaml" ||
    normalized === "application/x-yaml" ||
    normalized === "text/x-yaml"
  ) {
    return { language: CodeLanguageEnum.yaml, useJsx: false };
  }
  if (normalized === "text/markdown") {
    return { language: CodeLanguageEnum.markdown, useJsx: false };
  }
  if (
    normalized === "application/toml" ||
    normalized === "text/x-toml" ||
    normalized === "application/x-toml"
  ) {
    return { language: CodeLanguageEnum.toml, useJsx: false };
  }
  if (
    normalized === "application/javascript" ||
    normalized === "text/javascript" ||
    normalized === "application/x-javascript"
  ) {
    return { language: CodeLanguageEnum.javascript, useJsx: false };
  }
  if (
    normalized === "application/typescript" ||
    normalized === "text/typescript"
  ) {
    return { language: CodeLanguageEnum.typescript, useJsx: false };
  }
  return { language: null, useJsx: false };
}

function resolveLanguageFromPathHint(pathHint: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!pathHint) {
    return { language: null, useJsx: false };
  }
  const normalized = pathHint.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return { language: CodeLanguageEnum.typescript, useJsx: true };
  }
  if (normalized.endsWith(".jsx")) {
    return { language: CodeLanguageEnum.javascript, useJsx: true };
  }
  const language = resolveCodeLanguageFromPath(pathHint);
  if (language === CodeLanguageEnum.plaintext) {
    return { language: null, useJsx: false };
  }
  return { language, useJsx: false };
}

function resolvePathHintFromUnknown(value: unknown): string | null {
  const pathKeys = [
    "path",
    "filePath",
    "filepath",
    "targetPath",
    "target",
    "file",
    "filename",
    "fileName",
    "uri",
  ];
  for (const key of pathKeys) {
    const resolved = extractNonEmptyStringArg(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveMimeTypeHintFromUnknown(value: unknown): string | null {
  const mimeKeys = ["mimeType", "mimetype", "contentType", "content_type"];
  for (const key of mimeKeys) {
    const resolved = extractNonEmptyStringArg(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveCommandInputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const command = value.command;
  if (typeof command !== "string") {
    return null;
  }
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return command;
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

export function classifyDiffLineForChat(
  line: string,
): "add" | "del" | "hunk" | "file" | "meta" | "context" {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("diff --git")) {
    return "meta";
  }
  if (
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("\\ No newline at end of file")
  ) {
    return "meta";
  }
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "file";
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "add";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "del";
  }
  return "context";
}

export function isUnifiedDiffText(text: string): boolean {
  const lines = text.split(/\r?\n/u);
  let hasFileHeader = false;
  let hasHunk = false;
  let hasDiffHeader = false;
  let hasBinaryHeader = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      hasDiffHeader = true;
    } else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      hasFileHeader = true;
    } else if (line.startsWith("@@")) {
      hasHunk = true;
    } else if (line.startsWith("Binary files ")) {
      hasBinaryHeader = true;
    }
  }
  if (hasDiffHeader && (hasFileHeader || hasHunk || hasBinaryHeader)) {
    return true;
  }
  if (hasFileHeader && hasHunk) {
    return true;
  }
  return false;
}

function tryParseObjectOrArrayJson(text: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) || isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveStructuredOutputPayload({
  value,
  toolName,
  part,
  contextValue,
}: {
  value: unknown;
  toolName: string;
  part: StructuredOutputPart;
  contextValue?: unknown;
}): StructuredOutputPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalizedToolName = normalizeToolName(toolName) ?? toolName;
  const pathHint =
    resolvePathHintFromUnknown(value) ??
    resolvePathHintFromUnknown(contextValue) ??
    null;
  const mimeTypeHint =
    resolveMimeTypeHintFromUnknown(value) ??
    resolveMimeTypeHintFromUnknown(contextValue) ??
    null;
  const pathLanguage = resolveLanguageFromPathHint(pathHint);
  const mimeLanguage = resolveCodeLanguageFromMimeType(mimeTypeHint);
  const resolvedLanguage =
    pathLanguage.language !== null ? pathLanguage : mimeLanguage;

  if (normalizedToolName === "file_change") {
    const diffFromObject = resolveDiffTextFromUnknown(value);
    if (diffFromObject && isUnifiedDiffText(diffFromObject)) {
      return {
        text: diffFromObject,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (part === "input" && normalizedToolName === "command_execution") {
    const commandText = resolveCommandInputText(value);
    if (commandText) {
      return {
        text: commandText,
        kind: "code",
        language: CodeLanguageEnum.bash,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (isUnifiedDiffText(value)) {
      return {
        text: value,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
    const parsedJson = tryParseObjectOrArrayJson(value);
    if (parsedJson !== null) {
      return {
        text: JSON.stringify(parsedJson, null, 2),
        kind: "code",
        language: CodeLanguageEnum.json,
        useJsx: false,
        pathHint,
      };
    }
    if (resolvedLanguage.language !== null) {
      return {
        text: value,
        kind: "code",
        language: resolvedLanguage.language,
        useJsx: resolvedLanguage.useJsx,
        pathHint,
      };
    }
    return {
      text: value,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return {
      text: String(value),
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (Array.isArray(value) || isRecord(value)) {
    return {
      text: formatToolArgs(value),
      kind: "code",
      language: CodeLanguageEnum.json,
      useJsx: false,
      pathHint,
    };
  }

  return {
    text: String(value),
    kind: "plain",
    language: null,
    useJsx: false,
    pathHint,
  };
}

function resolveStructuredOutputFallbackPayload({
  runState,
  failedLabel,
  successLabel,
  stoppedLabel,
}: {
  runState: ToolCallRunState;
  failedLabel: string;
  successLabel: string;
  stoppedLabel: string;
}): StructuredOutputPayload | null {
  if (runState === "failed") {
    return {
      text: failedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "success") {
    return {
      text: successLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "stopped") {
    return {
      text: stoppedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
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
    const toolResult = toolResultsById[entry.toolCall.id];
    const resultDisplay = resolveToolResultDisplay(
      formatToolResult(toolResult),
    );
    if (resultDisplay) {
      return resultDisplay;
    }
    const argsFromMessage = entry.toolCall.function?.arguments;
    const pendingArgs = toolCallArguments?.[entry.toolCall.id];
    if (isRecord(argsFromMessage) && Object.keys(argsFromMessage).length > 0) {
      return formatToolArgs(argsFromMessage);
    }
    if (pendingArgs && pendingArgs.trim().length > 0) {
      return pendingArgs;
    }
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
  const argsFromAssistant = toolCall.function?.arguments;
  const pendingArgs = toolCallArguments?.[toolCall.id];
  if (argsFromResult && Object.keys(argsFromResult).length > 0) {
    return argsFromResult;
  }
  if (argsFromAssistant && Object.keys(argsFromAssistant).length > 0) {
    return argsFromAssistant;
  }
  return pendingArgs;
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

function resolveLatestThoughtText(
  timelineEntries: ActivityTimelineEntry[],
): string | null {
  for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const thoughtText = entry.thinkingEntry.item.thinking.trim();
    if (thoughtText.length > 0) {
      return thoughtText;
    }
  }
  return null;
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

function resolveLatestActivityPreview({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): ActivityPreviewData {
  const hasStreamingThought = resolveHasStreamingThought(timelineEntries);
  const thoughtText = resolveLatestThoughtText(timelineEntries);
  const latestEntry = timelineEntries[timelineEntries.length - 1];
  if (!latestEntry) {
    return {
      label: "No recent activity",
      kind: "none",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "thinking") {
    const latestHeadline = resolveThinkingPreviewHeadline(
      latestEntry.thinkingEntry,
    );
    if (latestHeadline.headline) {
      return {
        label: `Thought: ${latestHeadline.headline}`,
        kind: "thought",
        thoughtText,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    const fallbackHeadline = resolveFallbackThinkingHeadline(
      timelineEntries,
      timelineEntries.length - 2,
    );
    if (fallbackHeadline) {
      return {
        label: `Thought: ${fallbackHeadline}`,
        kind: "thought",
        thoughtText,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    if (latestHeadline.shouldScramble) {
      return {
        label: "Thought: Thinking...",
        kind: "thought",
        thoughtText,
        hasStreamingThought,
        shouldScrambleTitle: true,
      };
    }
    return {
      label: "Thought: Reasoning complete.",
      kind: "thought",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "compaction") {
    return {
      label: `Context: ${resolveCompactionEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      kind: "context",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "action") {
    return {
      label: `Action: ${resolveActionEntryLabel(
        latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      )}`,
      kind: "action",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "terminal") {
    return {
      label: `Terminal: ${resolveActionEntryLabel(
        latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      )}`,
      kind: "terminal",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "subagent") {
    return {
      label: `Subagent: ${resolveSubagentEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      kind: "subagent",
      thoughtText,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  return {
    label: `Action: ${resolveToolEntryLabel(
      latestEntry.toolEntry,
      toolResultsById,
    )}`,
    kind: "tool",
    thoughtText,
    hasStreamingThought,
    shouldScrambleTitle: false,
  };
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

function resolveMessageCreatedAtMs(message: BaseChatMessageUnion): number | null {
  return resolveTimestampMs((message as { createdAt?: unknown }).createdAt);
}

function resolveActivityTimestampMs(
  startedAtMs: number | null,
  completedAtMs: number | null,
): number | null {
  return resolveTimestampMs(startedAtMs) ?? resolveTimestampMs(completedAtMs);
}

function formatChatTimestamp(timestampMs: number | null): string | null {
  if (timestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_FORMATTER.format(timestampMs);
}

function formatChatTimestampTitle(timestampMs: number | null): string | null {
  if (timestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_TOOLTIP_FORMATTER.format(timestampMs);
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

function deriveThinkingHeadlineFromContent(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalizedLines = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#+\s+/u, "")
        .replace(/^(?:>+|\*|-)\s*/u, "")
        .replace(/^\d+\.\s*/u, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
  const collapsed =
    normalizedLines[0] ??
    trimmed
      .replace(/\s+/gu, " ")
      .replace(/^#+\s+/u, "")
      .replace(/^(?:>+|\*|-)\s*/u, "")
      .replace(/^\d+\.\s*/u, "")
      .trim();
  if (collapsed.length === 0) {
    return null;
  }
  const maxLength = 96;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength).trimEnd()}...`;
}

function resolveThinkingSummaryMeta({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): { headline: string; hasTitle: boolean } {
  if (isStreaming) {
    return { headline: "Thinking...", hasTitle: false };
  }
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHeadlineSourceText = (
    summaryText.split(/\r?\n/u)[0] ?? ""
  ).trim();
  const normalizedSummaryText = summaryText.replace(/\s+/gu, " ").trim();
  const normalizedThinkingText = content.replace(/\s+/gu, " ").trim();
  const summaryLooksLikeThinking =
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText;
  const collapsedSummaryText =
    summaryLooksLikeThinking || summaryHeadlineSourceText.length === 0
      ? ""
      : summaryHeadlineSourceText;
  if (collapsedSummaryText) {
    return { headline: collapsedSummaryText, hasTitle: true };
  }
  if (hasThinkingText) {
    const derivedHeadline = deriveThinkingHeadlineFromContent(content);
    if (derivedHeadline) {
      return { headline: derivedHeadline, hasTitle: true };
    }
    return {
      headline: "Summary unavailable. Expand to view full reasoning.",
      hasTitle: false,
    };
  }
  return {
    headline: isStreaming ? "Thinking..." : "Reasoning complete.",
    hasTitle: false,
  };
}

function resolveStreamingThinkingHeadline({
  content,
  summary,
}: {
  content: string;
  summary: string | null | undefined;
}): string | null {
  const summaryText = summary?.trim() ?? "";
  const summaryHeadlineSourceText = (
    summaryText.split(/\r?\n/u)[0] ?? ""
  ).trim();
  const normalizedSummaryText = summaryText.replace(/\s+/gu, " ").trim();
  const normalizedThinkingText = content.replace(/\s+/gu, " ").trim();
  const summaryLooksLikeThinking =
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText;
  if (summaryHeadlineSourceText.length > 0 && !summaryLooksLikeThinking) {
    return summaryHeadlineSourceText;
  }
  return deriveThinkingHeadlineFromContent(content);
}

function resolveThinkingSummaryHeadline({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): string {
  return resolveThinkingSummaryMeta({ content, summary, isStreaming }).headline;
}

function resolveLatestThinkingSummary(
  thinkingItems: ThinkingContentItem[],
  isStreaming: boolean,
): string {
  if (isStreaming) {
    return "Thinking...";
  }
  const latestItem = thinkingItems[thinkingItems.length - 1];
  if (!latestItem) {
    return "No thoughts yet.";
  }
  return resolveThinkingSummaryHeadline({
    content: latestItem.thinking,
    summary: latestItem.summary,
    isStreaming,
  });
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

function isAttachmentUrlStale(entry: AttachmentUrlEntry, now: number): boolean {
  return entry.expiresAt <= now + ATTACHMENT_URL_REFRESH_BUFFER_MS;
}

function collectAttachments(
  messages: Array<BaseChatMessageUnion>,
): ChatFileAttachment[] {
  const map = new Map<string, ChatFileAttachment>();
  for (const message of messages) {
    const attachments =
      "attachments" in message && Array.isArray(message.attachments)
        ? message.attachments
        : [];
    for (const attachment of attachments) {
      if (!map.has(attachment.id)) {
        map.set(attachment.id, attachment);
      }
    }
  }
  return Array.from(map.values());
}

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
      const existing = textPreviewMap[attachment.id];
      if (existing) {
        return;
      }
      if (
        attachment.size !== null &&
        attachment.size !== undefined &&
        attachment.size > TEXT_PREVIEW_MAX_BYTES
      ) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: true,
            isLoading: false,
            error: "Preview disabled for large files.",
          },
        }));
        return;
      }
      let entry = attachmentUrlMap[attachment.id];
      if (!entry || isAttachmentUrlStale(entry, Date.now())) {
        const refreshed = await requestAttachmentUrls([attachment], {
          force: true,
        });
        entry = refreshed[attachment.id] ?? attachmentUrlMap[attachment.id];
      }
      if (!entry) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      setTextPreviewMap((prev) => ({
        ...prev,
        [attachment.id]: {
          text: "",
          truncated: false,
          isLoading: true,
          error: null,
        },
      }));
      let response: Response;
      try {
        response = await fetch(entry.url);
      } catch {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      if (!response.ok) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      const text = await response.text();
      const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
      const previewText = truncated
        ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT)
        : text;
      setTextPreviewMap((prev) => ({
        ...prev,
        [attachment.id]: {
          text: previewText,
          truncated,
          isLoading: false,
          error: null,
        },
      }));
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
      const attachment = item.data;
      if (!attachment) {
        return (
          <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
            <IoImageOutline size={40} />
            <span>Loading preview...</span>
          </div>
        );
      }
      const previewKind = getAttachmentPreviewKind(attachment);
      const attachmentUrl = attachmentUrlMap[attachment.id]?.url ?? "";
      if (previewKind === "image") {
        if (!attachmentUrl) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <IoImageOutline size={40} />
              <span>Loading preview...</span>
            </div>
          );
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
      if (previewKind === "text") {
        const preview = textPreviewMap[attachment.id];
        if (!preview || preview.isLoading) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <FiFileText size={40} />
              <span>Loading preview...</span>
            </div>
          );
        }
        if (preview.error) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-500 dark:text-setta-300">
              <FiFileText size={40} />
              <span className="max-w-[70%] text-center text-setta-700 dark:text-setta-200">
                {preview.error}
              </span>
            </div>
          );
        }
        return (
          <div className="flex h-full w-full flex-col gap-2">
            <div className="h-full w-full overflow-hidden rounded-md border border-setta-200/60 bg-white/70 dark:border-setta-700 dark:bg-setta-900/60">
              <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
                {preview.text || ""}
              </pre>
            </div>
            {preview.truncated ? (
              <div className="text-[11px] text-setta-400">
                Preview truncated.
              </div>
            ) : null}
          </div>
        );
      }
      if (previewKind === "pdf") {
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
      if (previewKind === "audio") {
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
      if (previewKind === "video") {
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
      if (previewKind === "archive") {
        return renderFileCard(
          attachment,
          <FiArchive size={40} />,
          "Archive preview not available.",
        );
      }
      return renderFileCard(
        attachment,
        <FiFileText size={40} />,
        "Preview not available.",
      );
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
}: {
  attachments: ChatFileAttachment[];
  isUser: boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
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
                  <span className="truncate">{attachment.name}</span>
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
              <span className="max-w-[220px] truncate">{attachment.name}</span>
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

const ThinkingBox = memo(function ThinkingBox({
  content,
  summary,
  isStreaming,
  wasInterrupted,
  runKey,
  railIcon,
  activityHint,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
  wasInterrupted: boolean;
  runKey: string;
  railIcon?: ReactNode;
  activityHint?: string | null;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
}) {
  const streaming = isStreaming;
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHasAdditionalLines = /\r?\n/u.test(summaryText);
  const summaryHeadlineText = resolveThinkingSummaryHeadline({
    content,
    summary,
    isStreaming: streaming,
  });
  const collapsedSummaryText = summaryHeadlineText;
  const collapsedSummaryWithHint =
    activityHint && !hasThinkingText
      ? `${collapsedSummaryText} - ${activityHint}`
      : collapsedSummaryText;
  const shouldRenderPlainSummaryWithHint = Boolean(
    activityHint && !hasThinkingText,
  );
  const shouldMeasureSummaryOverflow =
    !hasThinkingText && collapsedSummaryText.length > 0;
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
  const expandedContent = hasThinkingText ? content : summaryText;
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
      return;
    }
    if (collapseAllSignal > 0) {
      setAccordionValue(undefined);
      return;
    }
    if (expandAllSignal > 0) {
      setAccordionValue(ACTIVITY_ROW_DETAILS_VALUE);
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
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [activityHint, shouldMeasureSummaryOverflow, summaryHeadlineText]);

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
        <div className="flex w-full items-stretch">
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
              <div className="min-w-0 flex-1">
                <div
                  ref={summaryPreviewRef}
                  className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200 [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80 [&_p]:m-0 [&_p]:inline"
                >
                  {shouldRenderPlainSummaryWithHint ? (
                    <span>{collapsedSummaryWithHint}</span>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
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
              <div className="ml-auto inline-flex shrink-0 items-center gap-1.5 self-center">
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
                    <BrailleSpinner className="text-[11px] text-setta-400 dark:text-setta-300/70" />
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
                {hasExpandableContent ? (
                  <MdKeyboardArrowDown
                    data-chat-thinking-chevron="true"
                    className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  />
                ) : null}
              </div>
            </div>
          </Accordion.Trigger>
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
}: {
  children: ReactNode;
  thoughtCount: number;
  latestSummary: string;
  sectionState: ToolCallSectionState;
  runKey: string;
  hasExpandableDetails: boolean;
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
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
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
          <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=closed]:hidden data-[state=open]:block dark:border-setta-700/70">
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
}: {
  entries: ThinkingRenderEntry[];
  runKey: string;
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
    >
      {entries.map((entry) => (
        <ThinkingBox
          key={`${entry.messageId}-thinking-${entry.itemIndex}`}
          content={entry.item.thinking}
          summary={entry.item.summary}
          isStreaming={entry.isStreaming}
          wasInterrupted={entry.wasInterrupted}
          runKey={`${entry.messageId}-thinking-${entry.itemIndex}`}
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
      const nextHasOverflow =
        current.scrollHeight > current.clientHeight + 1 &&
        text.trim().length > 0;
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
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measure);
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
    if (!animate || !hasOverflow) {
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
    const durationMs = Math.min(
      720,
      Math.max(180, distanceToBottomPx * 7),
    );
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
      {text}
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
        <Accordion.Trigger asChild>
          <div
            className={ASSISTANT_ACTIVITY_TRIGGER_CLASS}
            data-chat-assistant-activity-trigger="true"
            role="button"
            tabIndex={0}
            onKeyDown={handleActivityTriggerKeyDown}
            onClick={handleActivityTriggerClick}
          >
            <div className="w-full @container">
              <div className="flex w-full min-w-0 items-center gap-2 @[20rem]:h-8">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 @[20rem]:flex-nowrap">
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
                      data-chat-assistant-activity-latest="true"
                      data-chat-assistant-activity-latest-scrambling={
                        preview.shouldScrambleTitle ? "true" : "false"
                      }
                      className="min-w-0 basis-full truncate text-[11px] text-setta-500 @[20rem]:flex-1 @[20rem]:basis-auto dark:text-setta-300 [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80 [&_p]:m-0 [&_p]:inline"
                    >
                      {preview.shouldScrambleTitle ? (
                        displayLabel
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <span>{children}</span>,
                            a: ({ children }) => <span>{children}</span>,
                          }}
                        >
                          {displayLabel}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ml-auto inline-flex shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 self-start @[20rem]:self-center">
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
                  <MdKeyboardArrowDown
                    data-chat-assistant-activity-chevron="true"
                    className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  />
                </div>
              </div>
              {showThoughtScroll ? (
                <div>
                  <ActivityThoughtPreview
                    text={preview.thoughtText ?? ""}
                    animate={shouldAnimateThoughtScroll}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Accordion.Trigger>
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
        <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=closed]:hidden data-[state=open]:block dark:border-setta-700/70">
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
    <BrailleSpinner className="text-[11px] text-setta-400 dark:text-setta-300/70" />
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

  useEffect(() => {
    if (expandAllSignal > 0) {
      setAccordionValue(ACTIVITY_ROW_DETAILS_VALUE);
    }
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal > 0) {
      setAccordionValue(undefined);
    }
  }, [collapseAllSignal]);

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
        <div className="flex w-full items-stretch">
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
              <div className="min-w-0 flex-1 truncate break-words font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200">
                {label}
              </div>
              <div className="ml-auto inline-flex shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 self-center">
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
                <ChatTimestamp
                  timestampMs={timestampMs}
                  kind="activity-item"
                />
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
                <MdKeyboardArrowDown
                  className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
                  {...activityMeta.chevronAttr}
                />
              </div>
            </div>
          </Accordion.Trigger>
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
            <div className="border-t border-setta-200/70 bg-setta-200 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
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
  const label = profileId || normalizeToolName(name) || `Subagent ${toolCallId}`;

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
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  showItemCopyButtons?: boolean;
  defaultChildrenOpen?: boolean;
  openAllSignal?: number;
  closeAllSignal?: number;
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
          content={entry.thinkingEntry.item.thinking}
          summary={entry.thinkingEntry.item.summary}
          isStreaming={entry.thinkingEntry.isStreaming}
          wasInterrupted={entry.thinkingEntry.wasInterrupted}
          runKey={`activity-${entry.thinkingEntry.timerRunKey}`}
          railIcon={<FaBrain size={13} className="min-w-4" />}
          onCopy={onCopyRow}
          defaultOpen={defaultChildrenOpen}
          expandAllSignal={openAllSignal}
          collapseAllSignal={closeAllSignal}
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
      <BrailleSpinner className="text-[11px] text-setta-400 dark:text-setta-300/70" />
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
        <Accordion.Content className="overflow-hidden border-t border-setta-200/70 data-[state=closed]:hidden data-[state=open]:block dark:border-setta-700/70">
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

function AssistantErrorCallout({ content }: { content: string }) {
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
        />
      </div>
    </div>
  );
}

function StreamItem({
  item,
  isStreaming,
  runKey,
}: {
  item: ChatContentItem;
  isStreaming: boolean;
  runKey: string;
}) {
  switch (item.type) {
    case C.LLM_TEXT:
      if (isAssistantErrorText(item.text)) {
        return <AssistantErrorCallout content={item.text} />;
      }
      return (
        <MarkdownContent
          content={item.text}
          className={ASSISTANT_MARKDOWN_CLASS}
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
        />
      );
    case C.LLM_THINKING:
      return (
        <ThinkingBox
          content={item.thinking}
          summary={item.summary}
          isStreaming={isStreaming}
          wasInterrupted={false}
          runKey={runKey}
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
      <span className="chat-typing-inline" data-typing="true" />
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
    ? "mb-2 mt-1.5 flex justify-start rounded-md ring-1 ring-blue-400/70 dark:ring-blue-500/70 @container/chat-message"
    : "mb-2 mt-1.5 flex justify-start @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div
        className={`${widthClass} relative`}
        data-message-id={messageId}
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
    ? "my-2 flex justify-end rounded-md ring-1 ring-blue-400/70 dark:ring-blue-500/70 @container/chat-message"
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
    ? "my-2 flex justify-center rounded-md ring-1 ring-blue-400/70 dark:ring-blue-500/70 @container/chat-message"
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
  const toolCalls = message.tool_calls ?? [];
  for (const toolCall of toolCalls) {
    const toolResult = toolResultsById[toolCall.id];
    const toolName =
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`;
    const lines: string[] = [toolName];
    const argsFromResult = toolResult?.arguments;
    const argsFromMessage = toolCall.function?.arguments;
    const pendingArgs = toolCallArguments[toolCall.id];
    let args: unknown = null;
    if (argsFromResult && Object.keys(argsFromResult).length > 0) {
      args = argsFromResult;
    } else if (argsFromMessage && Object.keys(argsFromMessage).length > 0) {
      args = argsFromMessage;
    } else if (pendingArgs && pendingArgs.trim().length > 0) {
      args = pendingArgs;
    }
    if (args) {
      lines.push(`Arguments:\n${formatToolArgs(args)}`);
    }
    const result = formatToolResult(toolResult);
    if (result !== undefined) {
      if (typeof result === "string" && result.trim().length > 0) {
        lines.push(`Result:\n${result}`);
      } else if (typeof result === "number" || typeof result === "boolean") {
        lines.push(`Result:\n${String(result)}`);
      } else if (result && typeof result === "object") {
        lines.push(`Result:\n${formatToolArgs(result)}`);
      }
    }
    output.push(lines.join("\n"));
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
            />
            {displayItems.map(({ item, fullIndex }) => {
              return (
                <StreamItem
                  key={fullIndex}
                  item={item}
                  isStreaming={isStreaming}
                  runKey={`${message.id}-content-${fullIndex}`}
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
        {!shouldRenderBubble ? (
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

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMessageId,
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
  const [attachmentUrlMap, setAttachmentUrlMap] = useState<
    Record<string, AttachmentUrlEntry>
  >({});
  const attachmentUrlRequests = useRef<Set<string>>(new Set());
  const allAttachments = useMemo(
    () => collectAttachments(messages),
    [messages],
  );
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );
  const requestAttachmentUrls = useCallback(
    async (
      targets: ChatFileAttachment[],
      options: { force?: boolean } = {},
    ) => {
      if (targets.length === 0) {
        return {};
      }
      const now = Date.now();
      const pending = targets.filter((attachment) => {
        const entry = attachmentUrlMap[attachment.id];
        if (!options.force && entry && !isAttachmentUrlStale(entry, now)) {
          return false;
        }
        if (
          attachmentUrlRequests.current.has(attachment.id) &&
          !options.force
        ) {
          return false;
        }
        return true;
      });
      if (pending.length === 0) {
        return {};
      }
      for (const attachment of pending) {
        attachmentUrlRequests.current.add(attachment.id);
      }
      const projectConfigId = getCurrProjectConfigId();
      let entries: AttachmentUrlResponseEntry[] = [];
      try {
        const res = await route_get_attachment_download_urls({
          artifactIds: pending.map((attachment) => attachment.id),
          projectConfigId,
        });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          console.warn(
            "Failed to load attachment URLs",
            detail ?? pending.map((attachment) => attachment.id),
          );
          return {};
        }
        entries = res.data;
      } catch (error) {
        console.warn("Failed to load attachment URLs", error);
        return {};
      } finally {
        for (const attachment of pending) {
          attachmentUrlRequests.current.delete(attachment.id);
        }
      }
      const nextEntries: Record<string, AttachmentUrlEntry> = {};
      for (const entry of entries) {
        if (
          typeof entry.expiresAt !== "number" ||
          !Number.isFinite(entry.expiresAt)
        ) {
          console.error("Attachment URL missing expiresAt", entry);
          continue;
        }
        const expiresAt = entry.expiresAt * 1000;
        nextEntries[entry.artifactId] = {
          url: entry.url,
          expiresAt,
        };
      }
      if (Object.keys(nextEntries).length > 0) {
        setAttachmentUrlMap((prev) => ({ ...prev, ...nextEntries }));
      }
      return nextEntries;
    },
    [attachmentUrlMap],
  );

  useEffect(() => {
    if (waitingForResponse) {
      setEditingMessageId(null);
      setEditingBubbleWidthPx(null);
    }
  }, [waitingForResponse]);

  useEffect(() => {
    if (allAttachments.length === 0) {
      return;
    }
    void requestAttachmentUrls(allAttachments);
  }, [allAttachments, requestAttachmentUrls]);
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
      const groupedMessageTimestampMs = groupedMessages[0]
        ? resolveMessageCreatedAtMs(groupedMessages[0])
        : null;
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
                      />
                    </AssistantToolCallCard>
                  )}
                </AssistantActivitySection>
              </AssistantReasoningCard>
            </AssistantActivityActionsAnchor>
          ) : null}
          <ChatMessageTimestampFooter timestampMs={groupedMessageTimestampMs} />
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

function escapeMessageIdSelectorValue(messageId: string): string {
  return messageId.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  allMessagesForToolResults,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMessageId = null,
  className,
  contentClassName,
  scrollRef,
  editDisabledReason,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: ChatMessageListProps) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
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
  const previousActiveSearchMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSearchMessageId) {
      previousActiveSearchMessageIdRef.current = null;
      return;
    }
    if (previousActiveSearchMessageIdRef.current === activeSearchMessageId) {
      return;
    }
    const scrollContainer = internalScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const escapedMessageId = escapeMessageIdSelectorValue(
      activeSearchMessageId,
    );
    const target = scrollContainer.querySelector<HTMLElement>(
      `[data-message-id="${escapedMessageId}"]`,
    );
    if (!target) {
      return;
    }
    previousActiveSearchMessageIdRef.current = activeSearchMessageId;
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeSearchMessageId]);

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
