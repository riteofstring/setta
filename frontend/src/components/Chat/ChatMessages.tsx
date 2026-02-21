import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
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
import { MdChevronLeft, MdChevronRight, MdErrorOutline } from "react-icons/md";
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
  { role: ChatRoleEnum.assistant }
>;
type ChatContentItem = AssistantChatMessage["content"][number];

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
const ASSISTANT_REASONING_BORDER_CLASS =
  "border-setta-100 dark:border-setta-700/50";
const CHAT_MARKDOWN_BASE_CLASS =
  "prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-snug prose-headings:mt-5 prose-headings:mb-2 prose-h1:text-[1.05rem] prose-h2:text-[1rem] prose-h3:text-[0.95rem] prose-h4:text-[0.9rem] prose-p:my-0 prose-p:leading-[1.45] prose-ul:my-1 prose-ol:my-1 prose-ul:pl-5 prose-ol:pl-5 prose-ul:leading-[1.45] prose-ol:leading-[1.45] prose-li:my-0 prose-li:leading-[1.45] prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 prose-pre:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p+p]:mt-2.5 [&_p+ul]:mt-2 [&_p+ol]:mt-2 [&_ul+p]:mt-2.5 [&_ol+p]:mt-2.5 [&_li+li]:mt-0.5 [&_li_p]:my-0 [&_*]:break-words";
const ASSISTANT_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;
const TOOL_CALL_RAIL_GRID_CLASS = "grid-cols-[1.75rem_minmax(0,1fr)]";
const TOOL_CALL_RAIL_BACKGROUND_CLASS =
  "bg-setta-100/75 dark:bg-setta-800/75";
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
  if (typeof toolResult?.tool_name === "string" && toolResult.tool_name.trim()) {
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

function resolveToolResultDisplay(result: ToolResultValue | undefined): string | null {
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
    const toolResult = toolResultsById[entry.toolCall.id];
    const resultDisplay = resolveToolResultDisplay(formatToolResult(toolResult));
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
): item is Extract<ChatContentItem, { type: typeof C.LLM_THINKING }> {
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
  const [showSpinner, setShowSpinner] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!shouldTrack) {
      setShowSpinner(false);
      return;
    }
    lastActivityRef.current = Date.now();
    setShowSpinner(false);
  }, [activityKey, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack) {
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

function useElapsedSeconds(active: boolean): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return elapsedSeconds;
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
  signature,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  signature: string | null | undefined;
  isStreaming: boolean;
}) {
  const streaming = !signature && isStreaming;
  const displayText = useTypewriterEffect(content, streaming, 5);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const summaryText = summary?.trim() ?? "";
  const title = summaryText || (streaming ? "Working..." : "Reasoning");
  const elapsedSeconds = useElapsedSeconds(streaming);

  useEffect(() => {
    if (streaming && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [displayText, streaming]);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative flex max-w-full cursor-pointer overflow-hidden">
          <div className="flex min-w-[30px] items-center px-1 py-1">
            {streaming ? (
              <div className="single-cell-container">
                <FaBrain
                  className="single-cell-child min-w-6 animate-ping text-setta-200 dark:text-setta-400"
                  size={15}
                />
                <FaBrain
                  className="single-cell-child min-w-6 text-setta-200 dark:text-setta-400"
                  size={15}
                />
              </div>
            ) : (
              <FaBrain className=" min-w-6 text-setta-200 dark:text-setta-400" />
            )}
          </div>

          <div className="relative my-1 mr-1 flex min-w-0 max-w-full flex-col gap-0">
            <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <div className="truncate">{title}</div>
              {streaming ? (
                <span
                  data-chat-thinking-timer="true"
                  className="shrink-0 font-mono text-[10px] text-setta-400 dark:text-setta-400/90"
                >
                  {formatElapsedDuration(elapsedSeconds)}
                </span>
              ) : null}
            </div>
            <div
              ref={previewRef}
              className="top-bottom-fade h-11 overflow-y-auto break-words px-0.5 text-[11px] text-setta-300 dark:text-setta-500"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {displayText}
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="mt-0 overflow-hidden px-0.5 py-0.5 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          <MarkdownContent
            content={content}
            className={ASSISTANT_MARKDOWN_CLASS}
            role={ChatRoleEnum.assistant}
            isStreaming={isStreaming}
          />
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
  const isStreaming = entries.some((entry) => entry.isStreaming);
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
        className="w-full"
        data-chat-context-compaction-section="true"
      >
        <Accordion.Trigger className="relative flex max-w-full cursor-pointer overflow-hidden">
          <div className="flex min-w-[30px] items-center px-1 py-1">
            <FiArchive
              className="min-w-6 text-setta-300 dark:text-setta-400"
              size={14}
            />
          </div>
          <div className="relative my-1 mr-1 flex min-w-0 max-w-full flex-col gap-0">
            <div className="flex items-center gap-2 px-0.5 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <span className="truncate">{title}</span>
              <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-setta-300/80 bg-setta-100 px-1.5 py-[1px] text-[10px] font-semibold leading-none text-setta-700 dark:border-setta-600/80 dark:bg-setta-800 dark:text-setta-200">
                {entries.length}
              </span>
            </div>
            <div
              className="top-bottom-fade h-11 overflow-y-auto break-words px-0.5 text-[11px] text-setta-300 dark:text-setta-500"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {displayText}
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="mt-0 overflow-hidden px-0.5 py-0.5 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          <MarkdownContent
            content={displayText}
            className={ASSISTANT_MARKDOWN_CLASS}
            role={ChatRoleEnum.assistant}
            isStreaming={isStreaming}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function ToolCallAccordionStatus({
  runState,
}: {
  runState: ToolCallRunState;
}) {
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
  const resultDisplay = (() => {
    const resolved = resolveToolResultDisplay(result);
    if (resolved) {
      return resolved;
    }
    if (runState === "failed") {
      return "Action failed";
    }
    if (runState === "success") {
      return "Action completed successfully";
    }
    if (runState === "stopped") {
      return "Action stopped before completion.";
    }
    return null;
  })();

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="details"
        className="w-full border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-action-item="true"
      >
        <Accordion.Trigger
          className={`grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/45 dark:hover:bg-setta-900/70`}
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-action-item-rail="true"
            title={`Action state: ${runState}`}
            aria-label={`Action state: ${runState}`}
          >
            <ToolCallAccordionStatus runState={runState} />
          </div>
          <div className="min-w-0 px-2 py-1">
            <div className="truncate break-words font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200">
              {actionLabel}
            </div>
            <div className="truncate text-[10px] text-setta-400 dark:text-setta-400/90">
              {name}
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {args !== null && args !== undefined ? (
            <div className="border-t border-setta-200/70 bg-setta-200/35 px-2 py-1 text-xs dark:border-setta-700/70 dark:bg-setta-860">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Input
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-[11px] text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          ) : null}
          {resultDisplay ? (
            <div className="border-t border-setta-200/70 bg-setta-200 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Output
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-[11px] text-setta-600 dark:text-setta-200">
                {resultDisplay}
              </pre>
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
  const resultDisplay = (() => {
    if (typeof result === "string") {
      if (result.trim().length > 0) {
        return result;
      }
    } else if (typeof result === "number" || typeof result === "boolean") {
      return String(result);
    }
    if (result && typeof result === "object") {
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    }
    if (runState === "failed") {
      return "Tool execution failed";
    }
    if (runState === "success") {
      return "Tool completed successfully";
    }
    if (runState === "stopped") {
      return "Stopped mid-tool call before completion.";
    }
    return null;
  })();

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="details"
        className="w-full border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
        data-chat-tool-call-item="true"
      >
        <Accordion.Trigger
          className={`grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/45 dark:hover:bg-setta-900/70`}
        >
          <div
            className={`flex h-full items-center justify-center text-setta-400 dark:text-setta-300 ${TOOL_CALL_RAIL_BACKGROUND_CLASS}`}
            data-chat-tool-call-item-rail="true"
            title={`Tool state: ${runState}`}
            aria-label={`Tool state: ${runState}`}
          >
            <ToolCallAccordionStatus runState={runState} />
          </div>
          <div className="min-w-0 truncate break-words px-2 py-1 font-mono text-[11px] font-semibold text-setta-500 dark:text-setta-200">
            {name}
          </div>
        </Accordion.Trigger>

        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {args !== null && args !== undefined ? (
            <div className="border-t border-setta-200/70 bg-setta-200/35 px-2 py-1 text-xs dark:border-setta-700/70 dark:bg-setta-860">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Arguments
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-[11px] text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          ) : null}
          {resultDisplay && (
            <div className="border-t border-setta-200/70 bg-setta-200 px-2 py-1 dark:border-setta-700/70 dark:bg-setta-900">
              <h3 className="!mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-[11px] text-setta-600 dark:text-setta-200">
                {resultDisplay}
              </pre>
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
}: {
  children: ReactNode;
  actionCount: number;
  latestActionLabel: string;
  sectionState: ToolCallSectionState;
}) {
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="action-details"
        className="w-full overflow-hidden rounded-md border border-setta-200/70 bg-setta-50/70 dark:border-setta-700/60 dark:bg-setta-900/45"
        data-chat-action-section="true"
        data-chat-action-section-state={sectionState}
      >
        <Accordion.Trigger
          className={`grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/60 dark:hover:bg-setta-900/80`}
        >
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
            <div className="ml-auto shrink-0 self-center">
              <ToolCallSectionStatus sectionState={sectionState} />
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

  return (
    <ActionSection
      actionCount={entries.length}
      latestActionLabel={latestActionLabel}
      sectionState={sectionState}
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

function ToolCallSectionStatus({
  sectionState,
}: {
  sectionState: ToolCallSectionState;
}) {
  if (sectionState === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-500 dark:text-setta-300">
        <IoMdCheckmark className="text-[11px]" />
        Complete
      </span>
    );
  }
  if (sectionState === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">
        <MdErrorOutline className="text-[11px]" />
        Stopped Mid-Tool Call
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-setta-500 dark:text-setta-300">
      <i className="gg-spinner !scale-75" />
      Working
    </span>
  );
}

const ToolCallSection = memo(function ToolCallSection({
  children,
  toolCount,
  latestToolLabel,
  sectionState,
}: {
  children: ReactNode;
  toolCount: number;
  latestToolLabel: string;
  sectionState: ToolCallSectionState;
}) {
  const title = "Tool calls";
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      <Accordion.Item
        value="tool-call-details"
        className="w-full overflow-hidden rounded-md border border-setta-200/70 bg-setta-50/70 dark:border-setta-700/60 dark:bg-setta-900/45"
        data-chat-tool-call-section="true"
        data-chat-tool-call-section-state={sectionState}
      >
        <Accordion.Trigger
          className={`grid w-full cursor-pointer ${TOOL_CALL_RAIL_GRID_CLASS} text-left transition-colors hover:bg-white/60 dark:hover:bg-setta-900/80`}
        >
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
            <div className="ml-auto shrink-0 self-center">
              <ToolCallSectionStatus sectionState={sectionState} />
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
      const resolvedAnswers = resolveQuestionAnswers(questionPayload, toolResult);
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

  return (
    <ToolCallSection
      toolCount={entries.length}
      latestToolLabel={latestToolLabel}
      sectionState={sectionState}
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
}: {
  item: ChatContentItem;
  isStreaming: boolean;
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
          signature={item.signature}
          isStreaming={isStreaming}
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
    <div className="w-full">
      <div
        className={`flex min-h-[24px] w-full min-w-[24px] max-w-full flex-shrink cursor-text flex-col gap-0.5 rounded-b-lg rounded-tr-lg border ${ASSISTANT_REASONING_BORDER_CLASS} bg-transparent px-1.5 py-1`}
        data-chat-assistant-reasoning-card="true"
      >
        {children}
      </div>
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
}: {
  children: ReactNode;
  messageId?: string;
}) {
  const widthClass = `group flex w-full ${ASSISTANT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-start gap-2`;
  return (
    <div className="mb-2 mt-1.5 flex justify-start">
      <div className={widthClass} data-message-id={messageId}>
        {children}
      </div>
    </div>
  );
}

function LLMChatBubble({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="w-fit max-w-full">
      <div
        className="relative flex min-h-[24px] w-fit min-w-[24px] max-w-full flex-shrink cursor-text flex-col gap-1.5 rounded-b-lg rounded-tr-lg border border-transparent bg-white pb-2 pl-3 pr-2.5 pt-1 text-setta-800 dark:border-setta-700/45 dark:bg-setta-850 dark:text-setta-50"
        data-chat-assistant-bubble="true"
      >
        {children}
        {actions ? (
          <div className="absolute bottom-0 left-0">{actions}</div>
        ) : null}
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
            <div className="absolute bottom-0 right-0">{actions}</div>
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
            <div className="absolute bottom-0.5 right-0.5">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const USER_MARKDOWN_CLASS =
  `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const SYSTEM_MARKDOWN_CLASS =
  `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

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
    <div className="inline-flex items-center gap-1 text-setta-500 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 dark:text-setta-300">
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
    const nextThinkingItems: Array<
      Extract<ChatContentItem, { type: typeof C.LLM_THINKING }>
    > = [];
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
    if (
      !shouldRenderBubble &&
      !hasThinkingContent &&
      !hasCompactionContent &&
      !hasActionContent &&
      !hasToolCallContent
    ) {
      return null;
    }
    return (
      <AssistantMessageGroup messageId={message.id}>
        {thinkingItems.map((item, idx) => (
          <AssistantReasoningCard key={`${message.id}-thinking-${idx}`}>
            <ThinkingBox
              content={item.thinking}
              summary={item.summary}
              signature={item.signature}
              isStreaming={isStreaming}
            />
          </AssistantReasoningCard>
        ))}
        {compactionEntries.length > 0 ? (
          <AssistantReasoningCard>
            <ContextCompactionSection
              entries={compactionEntries}
              toolResultsById={toolResultsById}
              toolCallArguments={toolCallArguments}
            />
          </AssistantReasoningCard>
        ) : null}
        {shouldRenderBubble ? (
          <LLMChatBubble actions={actionBar}>
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
                />
              );
            })}
          </LLMChatBubble>
        ) : (
          !hasActionContent && !hasToolCallContent ? actionBar : null
        )}
        <AssistantTypingIndicator
          visible={
            showTypingIndicator && lastTextIndex === -1 && thinkingItems.length === 0
          }
        />
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
  allMessages,
  editDisabledReason,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
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
      const firstMessageId = message.id;
      let groupEnd = index;
      while (groupEnd < messages.length) {
        const nextMessage = messages[groupEnd];
        if (!isToolCallOnlyAssistantMessage(nextMessage)) {
          break;
        }
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
      output.push(
        <AssistantMessageGroup
          key={`tool-call-group-${firstMessageId}`}
          messageId={firstMessageId}
        >
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
