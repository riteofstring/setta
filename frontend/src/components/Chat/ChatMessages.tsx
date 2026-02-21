import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import {
  CodeBlock,
  MarkdownCodePre,
} from "components/Section/Layouts/TextBlock";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import {
  ReactNode,
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
  FiArchive,
  FiCopy,
  FiEdit3,
  FiFileText,
  FiMusic,
  FiVideo,
} from "react-icons/fi";
import { IoMdCheckmark, IoMdClose } from "react-icons/io";
import { IoImageOutline } from "react-icons/io5";
import {
  MdChevronLeft,
  MdChevronRight,
  MdErrorOutline,
  MdKeyboardArrowDown,
} from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
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
import {
  resolveCodeLanguageFromPath,
  type CodeLanguage,
} from "utils/codeLanguage";
import { ApprovalCard } from "./ApprovalCard";
import { ChatMessageEditor } from "./ChatMessageEditor";
import { QuestionCard } from "./QuestionCard";
import { TodoListCard } from "./TodoListCard";
import { useTypewriterEffect } from "./useTypewriterEffect";

type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: ChatRoleEnum.assistant }
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

type ToolCallDisplayKind = "tool" | "action" | "compaction";

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
const TOOL_SECTION_CARD_CLASS =
  "w-full overflow-hidden rounded-md border border-setta-200/70 bg-setta-50/70 dark:border-setta-700/60 dark:bg-setta-900/45";
const TOOL_SECTION_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/60 dark:hover:bg-setta-900/80 [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const TOOL_ROW_TRIGGER_CLASS = `group grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/45 dark:hover:bg-setta-900/70 [&[data-state=open]_.chat-accordion-chevron]:rotate-180`;
const ASSISTANT_ACTIVITY_PARENT_CLASS =
  "w-full overflow-hidden rounded-md border border-setta-200/65 bg-setta-50/40 dark:border-setta-700/60 dark:bg-setta-900/30";
const ASSISTANT_ACTIVITY_TRIGGER_CLASS =
  "group flex w-full items-start gap-2 px-2 py-1 text-left transition-colors hover:bg-white/50 dark:hover:bg-setta-900/70 [&[data-state=open]_.chat-accordion-chevron]:rotate-180";
const CONTEXT_COMPACTION_TOOL_NAME = "compacted";
const ACTION_TOOL_NAMES = new Set<string>([
  "command_execution",
  "file_change",
  "webSearch",
  "imageView",
  "collabToolCall",
  "enteredReviewMode",
  "exitedReviewMode",
]);

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

type ChatMessageListProps = {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments?: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
  editDisabledReason?: string | null;
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

  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className={className}
        components={{ code: CodeBlock, pre: MarkdownCodePre }}
      >
        {displayText}
      </ReactMarkdown>
    </div>
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

function partitionToolCallEntries(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
): {
  toolEntries: ToolCallRenderEntry[];
  actionEntries: ToolCallRenderEntry[];
  compactionEntries: ToolCallRenderEntry[];
} {
  const toolEntries: ToolCallRenderEntry[] = [];
  const actionEntries: ToolCallRenderEntry[] = [];
  const compactionEntries: ToolCallRenderEntry[] = [];
  for (const entry of entries) {
    const kind = resolveToolCallDisplayKind(entry, toolResultsById);
    if (kind === "compaction") {
      compactionEntries.push(entry);
      continue;
    }
    if (kind === "action") {
      actionEntries.push(entry);
      continue;
    }
    toolEntries.push(entry);
  }
  return {
    toolEntries,
    actionEntries,
    compactionEntries,
  };
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
export type StructuredOutputPayload = {
  text: string;
  kind: StructuredOutputKind;
  language: CodeLanguage | null;
  useJsx: boolean;
  pathHint: string | null;
};

export type StructuredOutputPart = "input" | "output";

function resolveCodeLanguageFromMimeType(
  mimeType: string | null,
): { language: CodeLanguage | null; useJsx: boolean } {
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
  if (normalized === "application/typescript" || normalized === "text/typescript") {
    return { language: CodeLanguageEnum.typescript, useJsx: false };
  }
  return { language: null, useJsx: false };
}

function resolveLanguageFromPathHint(
  pathHint: string | null,
): { language: CodeLanguage | null; useJsx: boolean } {
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

export function classifyDiffLineForChat(line: string): "add" | "del" | "hunk" | "file" | "meta" | "context" {
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

function resolveLatestActionSectionLabel(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
  toolCallArguments: Record<string, string>,
): string | null {
  const latestEntry = entries[entries.length - 1];
  if (!latestEntry) {
    return null;
  }
  const toolCall = latestEntry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  const rawToolName =
    toolResult?.tool_name ||
    toolCall.function?.name ||
    `Action ${toolCall.id}`;
  const argsFromResult = toolResult?.arguments;
  const argsFromAssistant = toolCall.function?.arguments;
  const pendingArgs = toolCallArguments?.[toolCall.id];
  let argsToDisplay: unknown = pendingArgs;
  if (argsFromResult && Object.keys(argsFromResult).length > 0) {
    argsToDisplay = argsFromResult;
  } else if (argsFromAssistant && Object.keys(argsFromAssistant).length > 0) {
    argsToDisplay = argsFromAssistant;
  }
  return resolveActionLabel(rawToolName, argsToDisplay);
}

function resolveLatestToolSectionLabel(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
): string | null {
  const latestEntry = entries[entries.length - 1];
  if (!latestEntry) {
    return null;
  }
  const latestResult = toolResultsById[latestEntry.toolCall.id];
  return (
    latestResult?.tool_name ||
    latestEntry.toolCall.function?.name ||
    `Tool call ${latestEntry.toolCall.id}`
  );
}

function resolveLatestActivityPreviewLabel({
  thinkingItems,
  isStreamingThinking,
  compactionEntries,
  actionEntries,
  toolEntries,
  toolResultsById,
  toolCallArguments,
}: {
  thinkingItems: ThinkingContentItem[];
  isStreamingThinking: boolean;
  compactionEntries: ToolCallRenderEntry[];
  actionEntries: ToolCallRenderEntry[];
  toolEntries: ToolCallRenderEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  let latestLabel = "No recent activity";
  if (thinkingItems.length > 0) {
    latestLabel = `Thought: ${resolveLatestThinkingSummary(
      thinkingItems,
      isStreamingThinking,
    )}`;
  }
  if (compactionEntries.length > 0) {
    const compactionPreview =
      resolveCompactionSummaryText(
        compactionEntries,
        toolResultsById,
        toolCallArguments,
      ) ?? "Compaction completed.";
    latestLabel = `Context: ${compactionPreview}`;
  }
  if (actionEntries.length > 0) {
    const latestAction = resolveLatestActionSectionLabel(
      actionEntries,
      toolResultsById,
      toolCallArguments,
    );
    if (latestAction) {
      latestLabel = `Action: ${latestAction}`;
    }
  }
  if (toolEntries.length > 0) {
    const latestTool = resolveLatestToolSectionLabel(toolEntries, toolResultsById);
    if (latestTool) {
      latestLabel = `Tool: ${latestTool}`;
    }
  }
  return latestLabel;
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

function useIdleStreamSpinner(
  shouldTrack: boolean,
  activityKey: string,
  delayMs: number,
): boolean {
  const [showSpinner, setShowSpinner] = useState(
    shouldTrack && delayMs <= 0,
  );
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

function resolveThinkingSummaryHeadline({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): string {
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHeadlineSourceText = (summaryText.split(/\r?\n/u)[0] ?? "").trim();
  const normalizedSummaryText = summaryText.replace(/\s+/gu, " ").trim();
  const normalizedThinkingText = content.replace(/\s+/gu, " ").trim();
  const summaryLooksLikeThinking =
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText;
  const collapsedSummaryText = summaryLooksLikeThinking
    ? ""
    : summaryHeadlineSourceText;
  if (collapsedSummaryText) {
    return collapsedSummaryText;
  }
  if (hasThinkingText) {
    return "Summary unavailable. Expand to view full reasoning.";
  }
  return isStreaming ? "Thinking..." : "Reasoning complete.";
}

function resolveLatestThinkingSummary(
  thinkingItems: ThinkingContentItem[],
  isStreaming: boolean,
): string {
  const latestItem = thinkingItems[thinkingItems.length - 1];
  if (!latestItem) {
    return isStreaming ? "Thinking..." : "No thoughts yet.";
  }
  return resolveThinkingSummaryHeadline({
    content: latestItem.thinking,
    summary: latestItem.summary,
    isStreaming,
  });
}

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
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
  wasInterrupted: boolean;
  runKey: string;
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
  const shouldMeasureSummaryOverflow =
    !hasThinkingText && collapsedSummaryText.length > 0;
  const [isSummaryTitleTruncated, setIsSummaryTitleTruncated] = useState(false);
  const hasExpandableContent =
    hasThinkingText ||
    isSummaryTitleTruncated ||
    (!hasThinkingText && summaryHasAdditionalLines);
  const expandedContent = hasThinkingText ? content : summaryText;
  const thinkingRunState: ToolCallSectionState = streaming
    ? "running"
    : wasInterrupted
      ? "stopped"
      : "complete";
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration({
    active: streaming,
    runKey,
  });
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: thinkingRunState === "running",
  });
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
      const verticallyTruncated = element.scrollHeight > element.clientHeight + 1;
      const horizontallyTruncated = element.scrollWidth > element.clientWidth + 1;
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
  }, [shouldMeasureSummaryOverflow, summaryHeadlineText]);

  const triggerClassName = `grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} max-w-full overflow-hidden text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent
      ? "cursor-pointer hover:bg-white/60 dark:hover:bg-setta-900/80"
      : "cursor-default"
  }`;

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="details"
        className={TOOL_SECTION_CARD_CLASS}
        data-chat-thinking-section="true"
      >
        <Accordion.Trigger
          disabled={!hasExpandableContent}
          data-chat-thinking-trigger="true"
          data-chat-thinking-expandable={hasExpandableContent ? "true" : "false"}
          className={triggerClassName}
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
          >
            <FaBrain
              size={13}
              className={`min-w-4 ${streaming ? "animate-pulse" : ""}`}
            />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div
                ref={summaryPreviewRef}
                className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200 [&_p]:m-0 [&_p]:inline [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <span>{children}</span>,
                    a: ({ children }) => <span>{children}</span>,
                  }}
                >
                  {summaryHeadlineText}
                </ReactMarkdown>
              </div>
            </div>
            <div className="ml-auto inline-flex shrink-0 items-center gap-1.5 self-center">
              {thinkingRunState === "complete" ? (
                <span
                  data-chat-thinking-status="true"
                  className="inline-flex items-center gap-1 text-setta-500 dark:text-setta-300"
                >
                  <IoMdCheckmark
                    data-chat-thinking-complete-icon="true"
                    className="text-[12px]"
                  />
                  {durationLabel ? (
                    <span
                      data-chat-thinking-timer="true"
                      className="font-mono text-[10px] text-setta-400 dark:text-setta-400/90"
                    >
                      {durationLabel}
                    </span>
                  ) : null}
                </span>
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
                  <i className="gg-spinner !scale-75" />
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
        {hasExpandableContent ? (
          <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
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
    thoughtCount <= 1 && !hasExpandableDetails && latestSummary.trim().length > 0;
  const hasExpandableContent =
    thoughtCount > 1 || hasExpandableDetails || isSummaryTitleTruncated;
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration({
    active: sectionState === "running",
    runKey,
  });

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
      const verticallyTruncated = element.scrollHeight > element.clientHeight + 1;
      const horizontallyTruncated = element.scrollWidth > element.clientWidth + 1;
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

  const triggerClassName = `group grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent
      ? "cursor-pointer hover:bg-white/60 dark:hover:bg-setta-900/80"
      : "cursor-default"
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
          data-chat-thinking-list-expandable={hasExpandableContent ? "true" : "false"}
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
                  className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200"
                  title={`${thoughtCount} thought sections`}
                >
                  {thoughtCount}
                </span>
              </div>
              <div
                data-chat-thinking-list-latest-summary="true"
                ref={summaryPreviewRef}
                className="truncate text-[10px] text-setta-400 dark:text-setta-400/90 [&_p]:m-0 [&_p]:inline [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80"
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
          <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
            <div className="flex w-full flex-col gap-1 px-1 py-1">{children}</div>
          </Accordion.Content>
        ) : null}
      </Accordion.Item>
    </Accordion.Root>
  );
});

const AssistantThinkingSection = memo(function AssistantThinkingSection({
  thinkingItems,
  isStreaming,
  wasInterrupted,
  messageId,
}: {
  thinkingItems: ThinkingContentItem[];
  isStreaming: boolean;
  wasInterrupted: boolean;
  messageId: string;
}) {
  const sectionState = resolveThinkingSectionState({ isStreaming, wasInterrupted });
  const latestSummary = resolveLatestThinkingSummary(thinkingItems, isStreaming);
  const hasExpandableDetails = thinkingItems.some(thinkingItemHasExpandableDetail);
  return (
    <ThinkingSection
      thoughtCount={thinkingItems.length}
      latestSummary={latestSummary}
      sectionState={sectionState}
      runKey={`${messageId}-thinking-list`}
      hasExpandableDetails={hasExpandableDetails}
    >
      {thinkingItems.map((item, idx) => (
        <ThinkingBox
          key={`${messageId}-thinking-${idx}`}
          content={item.thinking}
          summary={item.summary}
          isStreaming={isStreaming}
          wasInterrupted={wasInterrupted}
          runKey={`${messageId}-thinking-${idx}`}
        />
      ))}
    </ThinkingSection>
  );
});

const AssistantActivitySection = memo(function AssistantActivitySection({
  latestLabel,
  children,
}: {
  latestLabel: string;
  children: ReactNode;
}) {
  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue="assistant-activity-details"
      className="w-full"
    >
      <Accordion.Item
        value="assistant-activity-details"
        className={ASSISTANT_ACTIVITY_PARENT_CLASS}
        data-chat-assistant-activity-section="true"
      >
        <Accordion.Trigger
          className={ASSISTANT_ACTIVITY_TRIGGER_CLASS}
          data-chat-assistant-activity-trigger="true"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-400 dark:text-setta-500">
              Activity
            </div>
            <div
              data-chat-assistant-activity-latest="true"
              className="truncate text-[11px] text-setta-500 dark:text-setta-300 [&_p]:m-0 [&_p]:inline [&_code]:rounded [&_code]:bg-setta-100/80 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[10px] dark:[&_code]:bg-setta-800/80"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <span>{children}</span>,
                  a: ({ children }) => <span>{children}</span>,
                }}
              >
                {latestLabel}
              </ReactMarkdown>
            </div>
          </div>
          <MdKeyboardArrowDown
            data-chat-assistant-activity-chevron="true"
            className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
          />
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
          <div className="flex w-full flex-col gap-1 p-1">{children}</div>
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
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration({
    active: sectionState === "running",
    startedAtMs,
    completedAtMs,
    runKey,
  });
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
            <FiArchive
              className="min-w-4"
              size={14}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0 px-2 py-1">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{title}</span>
                <span
                  data-chat-context-compaction-count-badge="true"
                  className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200"
                >
                  {entries.length}
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
        <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
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
    <i className="gg-spinner !scale-75 text-setta-400 dark:text-setta-300/70" />
  );
}

function resolveDiffLineClassName(kind: "add" | "del" | "hunk" | "file" | "meta" | "context"): string {
  if (kind === "add") {
    return "bg-emerald-500/12 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200";
  }
  if (kind === "del") {
    return "bg-red-500/12 text-red-800 dark:bg-red-500/15 dark:text-red-200";
  }
  if (kind === "hunk") {
    return "text-blue-700 dark:text-blue-300";
  }
  if (kind === "file") {
    return "text-slate-600 dark:text-slate-300";
  }
  if (kind === "meta") {
    return "text-slate-500 dark:text-slate-400";
  }
  return "";
}

const StructuredOutputBlock = memo(function StructuredOutputBlock({
  payload,
  owner,
  part,
}: {
  payload: StructuredOutputPayload;
  owner: "action" | "tool";
  part: StructuredOutputPart;
}) {
  const codeMirrorTheme = useCodeMirrorStyle();
  if (payload.kind === "diff") {
    const lines = payload.text.split(/\r?\n/u);
    return (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="diff"
        data-chat-structured-output-language="diff"
        className="m-0 cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
      >
        <pre className="m-0 whitespace-pre">
          {lines.map((line, index) => {
            const lineKind = classifyDiffLineForChat(line);
            return (
              <span
                key={`diff-line-${index + 1}`}
                data-chat-diff-line-kind={lineKind}
                className={`block ${resolveDiffLineClassName(lineKind)}`}
              >
                {line.length > 0 ? line : " "}
              </span>
            );
          })}
        </pre>
      </div>
    );
  }

  if (payload.kind === "code") {
    return (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="code"
        data-chat-structured-output-language={payload.language ?? "plaintext"}
      >
        <DummyCodeMirror
          code={payload.text}
          theme={codeMirrorTheme}
          className="cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
          language={payload.language}
          useJsx={payload.useJsx}
          wrapLines={false}
        />
      </div>
    );
  }

  return (
    <pre
      data-chat-structured-output="true"
      data-chat-structured-output-owner={owner}
      data-chat-structured-output-part={part}
      data-chat-structured-output-kind="plain"
      data-chat-structured-output-language="plaintext"
      className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-[11px] text-setta-600 dark:text-setta-200"
    >
      {payload.text}
    </pre>
  );
});

const ActionItem = memo(function ActionItem({
  name,
  args,
  result,
  runState,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
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
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="details"
        className="w-full border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-action-item="true"
      >
        <Accordion.Trigger
          className={TOOL_ROW_TRIGGER_CLASS}
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-action-item-rail="true"
            title={`Action state: ${runState}`}
            aria-label={`Action state: ${runState}`}
          >
            <ToolCallAccordionStatus runState={runState} />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="truncate break-words font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200">
                {actionLabel}
              </div>
              <div className="truncate text-[10px] text-setta-400 dark:text-setta-400/90">
                {name}
              </div>
            </div>
            <MdKeyboardArrowDown
              data-chat-action-item-chevron="true"
              className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
            />
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {inputPayload ? (
            <div className="border-t border-setta-200/70 bg-setta-200/35 px-2 py-1 text-xs dark:border-setta-700/70 dark:bg-setta-860">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Input
              </h3>
              <StructuredOutputBlock
                payload={inputPayload}
                owner="action"
                part="input"
              />
            </div>
          ) : null}
          {resultPayload ? (
            <div className="border-t border-setta-200/70 bg-setta-200 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Output
              </h3>
              <StructuredOutputBlock
                payload={resultPayload}
                owner="action"
                part="output"
              />
            </div>
          ) : null}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const ToolCallItem = memo(function ToolCallItem({
  name,
  args,
  result,
  runState,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
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
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="details"
        className="w-full border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-tool-call-item="true"
      >
        <Accordion.Trigger
          className={TOOL_ROW_TRIGGER_CLASS}
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-tool-call-item-rail="true"
            title={`Tool state: ${runState}`}
            aria-label={`Tool state: ${runState}`}
          >
            <ToolCallAccordionStatus runState={runState} />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1 truncate break-words font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200">
              {name}
            </div>
            <MdKeyboardArrowDown
              data-chat-tool-call-item-chevron="true"
              className="chat-accordion-chevron mt-[1px] shrink-0 text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
            />
          </div>
        </Accordion.Trigger>

        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {inputPayload ? (
            <div className="border-t border-setta-200/70 bg-setta-200/35 px-2 py-1 text-xs dark:border-setta-700/70 dark:bg-setta-860">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Arguments
              </h3>
              <StructuredOutputBlock
                payload={inputPayload}
                owner="tool"
                part="input"
              />
            </div>
          ) : null}
          {resultPayload && (
            <div className="border-t border-setta-200/70 bg-setta-200 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <StructuredOutputBlock
                payload={resultPayload}
                owner="tool"
                part="output"
              />
            </div>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const ActionSection = memo(function ActionSection({
  children,
  actionCount,
  latestActionLabel,
  sectionState,
  startedAtMs,
  completedAtMs,
  runKey,
}: {
  children: ReactNode;
  actionCount: number;
  latestActionLabel: string;
  sectionState: ToolCallSectionState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
}) {
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration({
    active: sectionState === "running",
    startedAtMs,
    completedAtMs,
    runKey,
  });
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="action-details"
        className={TOOL_SECTION_CARD_CLASS}
        data-chat-action-section="true"
        data-chat-action-section-state={sectionState}
      >
        <Accordion.Trigger className={TOOL_SECTION_TRIGGER_CLASS}>
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-action-section-rail="true"
          >
            <FiFileText size={12} className="min-w-4" />
          </div>
          <div className="flex min-w-0 items-start gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] font-semibold text-setta-500 dark:text-setta-200">
                  Actions
                </span>
                <span
                  data-chat-action-count-badge="true"
                  className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200"
                  title={`${actionCount} actions`}
                >
                  {actionCount}
                </span>
              </div>
              <div className="truncate text-[10px] text-setta-400 dark:text-setta-400/90">
                {latestActionLabel}
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
                data-chat-action-section-chevron="true"
                className="chat-accordion-chevron text-[16px] text-setta-400 transition-transform dark:text-setta-300/90"
              />
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
          <div className="flex w-full flex-col">{children}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const AssistantActionSection = memo(function AssistantActionSection({
  entries,
  toolResultsById,
  toolCallArguments,
}: {
  entries: ToolCallRenderEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}) {
  const actionStates: ToolCallRunState[] = [];
  const actionLabels: string[] = [];
  const rows = entries.map(({ toolCall, isStreaming }) => {
    const toolResult = toolResultsById[toolCall.id];
    const rawToolName =
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Action ${toolCall.id}`;
    const runState = resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      isStreaming,
    );
    actionStates.push(runState);
    const argsFromResult = toolResult?.arguments;
    const argsFromAssistant = toolCall.function?.arguments;
    const pendingArgs = toolCallArguments?.[toolCall.id];
    let argsToDisplay: unknown = pendingArgs;
    if (argsFromResult && Object.keys(argsFromResult).length > 0) {
      argsToDisplay = argsFromResult;
    } else if (argsFromAssistant && Object.keys(argsFromAssistant).length > 0) {
      argsToDisplay = argsFromAssistant;
    }
    actionLabels.push(resolveActionLabel(rawToolName, argsToDisplay));
    return (
      <ActionItem
        key={toolCall.id}
        name={rawToolName}
        args={argsToDisplay}
        result={formatToolResult(toolResult)}
        runState={runState}
      />
    );
  });

  const sectionState = resolveToolCallSectionState(actionStates);
  const latestActionLabel = actionLabels.at(-1) ?? "Action activity";
  const { startedAtMs, completedAtMs } = resolveToolSectionTimingAnchors(
    entries,
    toolResultsById,
  );
  const runKey = entries.map((entry) => entry.toolCall.id).join("|");

  return (
    <ActionSection
      actionCount={entries.length}
      latestActionLabel={latestActionLabel}
      sectionState={sectionState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
    >
      {rows}
    </ActionSection>
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

function resolveToolSectionTimingAnchors(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
): ToolSectionTimingAnchors {
  let startedAtMs: number | null = null;
  let completedAtMs: number | null = null;
  for (const entry of entries) {
    const toolResult = toolResultsById[entry.toolCall.id];
    const entryStartedAtMs = parseIsoTimestampMs(toolResult?.started_at);
    if (entryStartedAtMs !== null) {
      startedAtMs =
        startedAtMs === null
          ? entryStartedAtMs
          : Math.min(startedAtMs, entryStartedAtMs);
    }
    const entryCompletedAtMs = parseIsoTimestampMs(toolResult?.completed_at);
    if (entryCompletedAtMs !== null) {
      completedAtMs =
        completedAtMs === null
          ? entryCompletedAtMs
          : Math.max(completedAtMs, entryCompletedAtMs);
    }
  }
  return { startedAtMs, completedAtMs };
}

function ToolCallSectionStatus({
  sectionState,
  elapsedSeconds,
  elapsedMs,
  hasKnownDuration,
  runningLabel = "Working",
  stoppedLabel = "Stopped Mid-Tool Call",
  includeThinkingDataAttrs = false,
}: {
  sectionState: ToolCallSectionState;
  elapsedSeconds: number;
  elapsedMs: number;
  hasKnownDuration: boolean;
  runningLabel?: string;
  stoppedLabel?: string;
  includeThinkingDataAttrs?: boolean;
}) {
  const durationLabel = resolveDurationLabel({
    elapsedMs,
    elapsedSeconds,
    hasKnownDuration,
    isRunning: sectionState === "running",
  });
  if (sectionState === "complete") {
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
      <i className="gg-spinner !scale-75" />
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
  const { elapsedSeconds, elapsedMs, hasKnownDuration } = useRunElapsedDuration({
    active: sectionState === "running",
    startedAtMs,
    completedAtMs,
    runKey,
  });
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
                  className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200"
                  title={`${toolCount} tool calls`}
                >
                  {toolCount}
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
        <Accordion.Content className="overflow-hidden border-t border-setta-200/60 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:border-setta-700/60">
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
}: {
  children: ReactNode;
  messageId?: string;
  actions?: ReactNode;
}) {
  const widthClass = `group flex w-full ${ASSISTANT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-start gap-2`;
  return (
    <div className="mb-2 mt-1.5 flex justify-start">
      <div className={`${widthClass} relative`} data-message-id={messageId}>
        {children}
        {actions ? (
          <div
            className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2"
            data-chat-actions-anchor="right"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LLMChatBubble({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="w-fit max-w-full">
      <div
        className="relative flex min-h-[24px] w-fit min-w-[24px] max-w-full flex-shrink cursor-text flex-col gap-1.5 rounded-b-lg rounded-tr-lg border border-transparent bg-white pb-2 pl-3 pr-2.5 pt-1 text-setta-800 dark:border-setta-700/45 dark:bg-setta-850 dark:text-setta-50"
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
  messageId,
  bubbleWidthPx,
}: {
  children: ReactNode;
  actions?: ReactNode;
  messageId?: string;
  bubbleWidthPx?: number | null;
}) {
  return (
    <div className="my-2 flex justify-end">
      <div
        className={`group flex ${CHAT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-end`}
        data-message-id={messageId}
      >
        <div
          className="relative flex w-fit max-w-full flex-shrink cursor-text flex-col gap-1.5 rounded-t-lg rounded-bl-lg border border-blue-300 bg-blue-200 pb-2 pl-3 pr-2.5 pt-1 text-setta-950 dark:border-blue-800/80 dark:bg-blue-950 dark:text-white"
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
              className="absolute right-full top-1/2 mr-1.5 -translate-y-1/2"
              data-chat-actions-anchor="left"
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SystemChatBubble({
  children,
  actions,
  messageId,
}: {
  children: ReactNode;
  actions?: ReactNode;
  messageId?: string;
}) {
  return (
    <div className="my-2 flex justify-center">
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
              className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2"
              data-chat-actions-anchor="right"
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const USER_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const SYSTEM_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

function ChatMessageActions({
  onCopy,
  showEdit,
  editDisabled,
  editDisabledReason,
  onEdit,
  branchInfo,
  onBranchSwitch,
}: {
  onCopy: () => void;
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
      className="pointer-events-none inline-flex items-center gap-1 rounded-md border border-setta-200/90 bg-setta-100/95 px-1 py-0.5 text-setta-500 shadow-sm opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 dark:border-setta-700/90 dark:bg-setta-925/95 dark:text-setta-300"
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

const ChatMessage = memo(function ChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  toolCallContext,
  attachmentUrlMap,
  requestAttachmentUrls,
  isEditing,
  editingBubbleWidthPx,
  interrupted,
  canEdit,
  editDisabledReason,
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
  toolCallContext: ToolCallContext;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  isEditing: boolean;
  editingBubbleWidthPx?: number | null;
  interrupted: boolean;
  canEdit: boolean;
  editDisabledReason: string | null;
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
  const showEdit = isUser && canEdit;
  const editDisabled = Boolean(editDisabledReason);
  const handleCopy = useCallback(() => {
    const text = buildCopyTextForMessage({
      message,
      toolResultsById,
      toolCallArguments,
    });
    if (text.length === 0) {
      addTemporaryNotification("Nothing to copy for this message.", "warning");
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        addTemporaryNotification("Copied message.");
      })
      .catch((error) => {
        console.error("Failed to copy message:", error);
        addTemporaryNotification("Failed to copy message.", "error");
      });
  }, [message, toolCallArguments, toolResultsById]);
  const actionBar = !isEditing ? (
    <ChatMessageActions
      onCopy={handleCopy}
      showEdit={showEdit}
      editDisabled={editDisabled}
      editDisabledReason={editDisabledReason}
      onEdit={onStartEdit}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  ) : null;
  const isAssistant = message.role === ChatRoleEnum.assistant;
  const assistantContent = isAssistant
    ? message.content
    : EMPTY_ASSISTANT_CONTENT;
  const { activityKey, lastTextIndex } = useMemo(
    () => getStreamActivitySummary(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const toolCalls = isAssistant ? message.tool_calls ?? [] : [];
  const { thinkingItems, displayItems } = useMemo(() => {
    const nextThinkingItems: ThinkingContentItem[] = [];
    const nextDisplayItems: Array<{
      item: ChatContentItem;
      fullIndex: number;
    }> = [];
    if (!isAssistant) {
      return {
        thinkingItems: nextThinkingItems,
        displayItems: nextDisplayItems,
      };
    }
    for (let index = 0; index < message.content.length; index += 1) {
      const item = message.content[index];
      if (isThinkingContentItem(item)) {
        nextThinkingItems.push(item);
        continue;
      }
      nextDisplayItems.push({ item, fullIndex: index });
    }
    return {
      thinkingItems: nextThinkingItems,
      displayItems: nextDisplayItems,
    };
  }, [isAssistant, message.content]);
  const showAssistantSpinner = useIdleStreamSpinner(
    isAssistant && isStreaming,
    activityKey,
    spinnerDelayMs,
  );
  const toolCallEntries = useMemo<ToolCallRenderEntry[]>(
    () =>
      toolCalls.map((toolCall) => ({
        toolCall,
        isStreaming,
      })),
    [isStreaming, toolCalls],
  );
  const { toolEntries, actionEntries, compactionEntries } = useMemo(
    () => partitionToolCallEntries(toolCallEntries, toolResultsById),
    [toolCallEntries, toolResultsById],
  );

  if (message.role === ChatRoleEnum.assistant) {
    const showTypingIndicator = showAssistantSpinner;
    const hasBubbleContent = attachments.length > 0 || displayItems.length > 0;
    const shouldRenderBubble = hasBubbleContent;
    const hasThinkingContent = thinkingItems.length > 0;
    const hasCompactionContent = compactionEntries.length > 0;
    const hasActionContent = actionEntries.length > 0;
    const hasToolCallContent = toolEntries.length > 0;
    const hasActivityContent =
      hasThinkingContent ||
      hasCompactionContent ||
      hasActionContent ||
      hasToolCallContent;
    if (
      !shouldRenderBubble &&
      !hasActivityContent
    ) {
      if (showTypingIndicator) {
        return (
          <AssistantMessageGroup messageId={message.id}>
            <AssistantTypingIndicator visible={true} />
          </AssistantMessageGroup>
        );
      }
      return null;
    }
    const latestActivityLabel = resolveLatestActivityPreviewLabel({
      thinkingItems,
      isStreamingThinking: isStreaming,
      compactionEntries,
      actionEntries,
      toolEntries,
      toolResultsById,
      toolCallArguments,
    });
    return (
      <AssistantMessageGroup messageId={message.id} actions={actionBar}>
        {hasActivityContent ? (
          <AssistantReasoningCard>
            <AssistantActivitySection latestLabel={latestActivityLabel}>
              {hasThinkingContent ? (
                <AssistantReasoningCard>
                  <AssistantThinkingSection
                    thinkingItems={thinkingItems}
                    isStreaming={isStreaming}
                    wasInterrupted={interrupted}
                    messageId={message.id}
                  />
                </AssistantReasoningCard>
              ) : null}
              {hasCompactionContent ? (
                <AssistantReasoningCard>
                  <ContextCompactionSection
                    entries={compactionEntries}
                    toolResultsById={toolResultsById}
                    toolCallArguments={toolCallArguments}
                  />
                </AssistantReasoningCard>
              ) : null}
              {hasActionContent ? (
                <AssistantToolCallCard>
                  <AssistantActionSection
                    entries={actionEntries}
                    toolResultsById={toolResultsById}
                    toolCallArguments={toolCallArguments}
                  />
                </AssistantToolCallCard>
              ) : null}
              {hasToolCallContent ? (
                <AssistantToolCallCard>
                  <AssistantToolCallSection
                    entries={toolEntries}
                    toolResultsById={toolResultsById}
                    toolCallArguments={toolCallArguments}
                    toolCallContext={toolCallContext}
                  />
                </AssistantToolCallCard>
              ) : null}
            </AssistantActivitySection>
          </AssistantReasoningCard>
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
        <AssistantTypingIndicator
          visible={
            showTypingIndicator &&
            lastTextIndex === -1 &&
            thinkingItems.length === 0
          }
        />
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
    <Wrapper messageId={message.id} actions={actionBar}>
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

function isToolCallOnlyAssistantMessage(
  message: BaseChatMessageUnion,
): message is AssistantChatMessage {
  if (message.role !== ChatRoleEnum.assistant) {
    return false;
  }
  const toolCalls = message.tool_calls ?? [];
  if (toolCalls.length === 0) {
    return false;
  }
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
  if (attachments.length > 0) {
    return false;
  }
  return message.content.length === 0;
}

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  allMessages,
  editDisabledReason,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  allMessages: Array<BaseChatMessageUnion>;
  editDisabledReason?: string | null;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfoByMessage?: Record<string, ChatMessageBranchInfo>;
}) {
  const { canEditParams } = useShareCapabilities();
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
  const toolCallContext = useMemo(
    () => buildToolCallContext(allMessages, toolCallArguments),
    [allMessages, toolCallArguments],
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
  if (waitingForResponse && lastMessage?.role === ChatRoleEnum.assistant) {
    streamingMessageId = lastMessage.id;
  }
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (isToolCallOnlyAssistantMessage(message)) {
      const groupedToolCalls: ToolCallRenderEntry[] = [];
      const groupedMessages: AssistantChatMessage[] = [];
      const firstMessageId = message.id;
      let groupEnd = index;
      while (groupEnd < messages.length) {
        const nextMessage = messages[groupEnd];
        if (!isToolCallOnlyAssistantMessage(nextMessage)) {
          break;
        }
        groupedMessages.push(nextMessage);
        const isStreamingMessage =
          waitingForResponse && nextMessage.id === streamingMessageId;
        const toolCalls = nextMessage.tool_calls ?? [];
        for (const toolCall of toolCalls) {
          groupedToolCalls.push({
            toolCall,
            isStreaming: isStreamingMessage,
          });
        }
        groupEnd += 1;
      }
      const { toolEntries, actionEntries, compactionEntries } =
        partitionToolCallEntries(groupedToolCalls, toolResultsById);
      const hasActivityContent =
        compactionEntries.length > 0 ||
        actionEntries.length > 0 ||
        toolEntries.length > 0;
      const latestActivityLabel = resolveLatestActivityPreviewLabel({
        thinkingItems: [],
        isStreamingThinking: false,
        compactionEntries,
        actionEntries,
        toolEntries,
        toolResultsById,
        toolCallArguments,
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
        if (text.length === 0) {
          addTemporaryNotification("Nothing to copy for this message.", "warning");
          return;
        }
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            addTemporaryNotification("Copied message.");
          })
          .catch((error) => {
            console.error("Failed to copy message:", error);
            addTemporaryNotification("Failed to copy message.", "error");
          });
      };
      const actionBar = (
        <ChatMessageActions
          onCopy={handleGroupedCopy}
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
          actions={actionBar}
        >
          {hasActivityContent ? (
            <AssistantReasoningCard>
              <AssistantActivitySection latestLabel={latestActivityLabel}>
                {compactionEntries.length > 0 ? (
                  <AssistantReasoningCard>
                    <ContextCompactionSection
                      entries={compactionEntries}
                      toolResultsById={toolResultsById}
                      toolCallArguments={toolCallArguments}
                    />
                  </AssistantReasoningCard>
                ) : null}
                {actionEntries.length > 0 ? (
                  <AssistantToolCallCard>
                    <AssistantActionSection
                      entries={actionEntries}
                      toolResultsById={toolResultsById}
                      toolCallArguments={toolCallArguments}
                    />
                  </AssistantToolCallCard>
                ) : null}
                {toolEntries.length > 0 ? (
                  <AssistantToolCallCard>
                    <AssistantToolCallSection
                      entries={toolEntries}
                      toolResultsById={toolResultsById}
                      toolCallArguments={toolCallArguments}
                      toolCallContext={toolCallContext}
                    />
                  </AssistantToolCallCard>
                ) : null}
              </AssistantActivitySection>
            </AssistantReasoningCard>
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
        toolCallContext={toolCallContext}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        isEditing={isEditing}
        editingBubbleWidthPx={isEditing ? editingBubbleWidthPx : null}
        interrupted={Boolean(interruptedAssistantMessageIds?.[message.id])}
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
        interrupted={false}
        toolCallContext={toolCallContext}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
      />,
    );
  }

  return output;
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  className,
  scrollRef,
  editDisabledReason,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: ChatMessageListProps) {
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const toolArgs = toolCallArguments ?? {};
  const wrapperClassName =
    `flex min-h-0 flex-1 flex-col-reverse overflow-y-auto pr-1 ${className ?? ""}`.trim();

  return (
    <div ref={scrollRef} className={wrapperClassName}>
      <div>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolArgs}
          interruptedAssistantMessageIds={interruptedAssistantMessageIds}
          allMessages={messages}
          editDisabledReason={editDisabledReason}
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
