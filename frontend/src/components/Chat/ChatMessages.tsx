import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
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
import { FiArchive, FiFileText, FiMusic, FiVideo } from "react-icons/fi";
import { IoMdCheckmark, IoMdClose } from "react-icons/io";
import { IoImageOutline } from "react-icons/io5";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
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
import { QuestionCard } from "./QuestionCard";
import { TodoListCard } from "./TodoListCard";
import { useTypewriterEffect } from "./useTypewriterEffect";

type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: ChatRoleEnum.assistant }
>;
type ChatContentItem = AssistantChatMessage["content"][number];

type ToolResultValue = ToolChatMessage["result"] | string;

type ToolCallContext = {
  todoPayloadById: Record<string, TodoListPayload>;
  questionPayloadById: Record<string, AskUserQuestionPayload>;
  approvalPayloadById: Record<string, ApprovalPayload>;
  latestTodoCallId: string | null;
};

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;
const ATTACHMENT_URL_REFRESH_BUFFER_MS = 30_000;

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
};

type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
  typingIndicator?: boolean;
};

function MarkdownContent({
  content,
  className,
  role,
  isStreaming,
  typingIndicator = false,
}: MarkdownContentProps) {
  const shouldAnimate = role === ChatRoleEnum.assistant && isStreaming;
  const displayText = useTypewriterEffect(content, shouldAnimate, 5);

  return (
    <div
      className={typingIndicator ? "chat-typing" : undefined}
      data-typing={typingIndicator ? "true" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className={className}
        components={{ code: CodeBlock }}
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

type StreamActivitySummary = {
  activityKey: string;
  lastTextIndex: number;
};

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

async function openAttachmentInNewTab(
  attachment: ChatFileAttachment,
  attachmentUrlMap: Record<string, AttachmentUrlEntry>,
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>,
) {
  const now = Date.now();
  const entry = attachmentUrlMap[attachment.id];
  if (entry && !isAttachmentUrlStale(entry, now)) {
    window.open(entry.url, "_blank", "noopener,noreferrer");
    return;
  }
  const refreshed = await requestAttachmentUrls([attachment], { force: true });
  const nextEntry = refreshed[attachment.id] ?? attachmentUrlMap[attachment.id];
  if (!nextEntry || isAttachmentUrlStale(nextEntry, Date.now())) {
    return;
  }
  window.open(nextEntry.url, "_blank", "noopener,noreferrer");
}

function AttachmentPreviewDialog({
  open,
  onOpenChange,
  attachments,
  selectedAttachmentId,
  onSelectAttachmentId,
  attachmentUrlMap,
  requestAttachmentUrls,
  onOpenAttachment,
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
  onOpenAttachment: (attachment: ChatFileAttachment) => void;
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
    (
      attachment: ChatFileAttachment,
      icon: ReactNode,
      description?: string,
    ) => {
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
            <audio
              controls
              preload="metadata"
              className="w-full max-w-[720px]"
            >
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
                  <div className="flex items-center gap-3">
                    {sizeLabel ? <span>{sizeLabel}</span> : null}
                    <button
                      type="button"
                      onClick={() => onOpenAttachment(selectedAttachment)}
                      className="uppercase tracking-[0.2em] text-setta-400 transition hover:text-setta-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:text-setta-200"
                    >
                      Open
                    </button>
                  </div>
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
  const handleAttachmentOpen = useCallback(
    (attachment: ChatFileAttachment) => {
      void openAttachmentInNewTab(
        attachment,
        attachmentUrlMap,
        requestAttachmentUrls,
      );
    },
    [attachmentUrlMap, requestAttachmentUrls],
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
        onOpenAttachment={handleAttachmentOpen}
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
                {sizeLabel ? <span className="opacity-70">{sizeLabel}</span> : null}
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
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleAttachmentOpen(attachment);
              }}
              className={`text-[10px] uppercase tracking-[0.2em] ${detailClassName}`}
            >
              Open
            </button>
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
  const title = summaryText || (streaming ? "Thinking..." : "Reasoning");

  useEffect(() => {
    if (streaming && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [displayText, streaming]);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative mb-4 flex w-full cursor-pointer overflow-hidden rounded-lg  bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="flex min-w-[40px] items-center  px-2 py-5 ">
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

          <div className="relative my-3 mr-3 flex w-full flex-col gap-1">
            <div className="px-1 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <div className="truncate">{title}</div>
            </div>
            <div className="relative w-full overflow-clip rounded-xl border border-solid border-white shadow-[inset_0px_2px_4px_2px_rgb(0_0_0_/_0.15)] dark:border-setta-800/30 dark:bg-setta-860 ">
              <div
                ref={previewRef}
                className="top-bottom-fade h-20 overflow-y-auto px-3 py-2 text-xs text-setta-300 dark:text-setta-500"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {displayText}
              </div>
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="-mt-6 mb-2 overflow-hidden rounded-b-md bg-setta-200 px-3 pb-3 pt-4 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-860">
          <MarkdownContent
            content={content}
            className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words"
            role={ChatRoleEnum.assistant}
            isStreaming={isStreaming}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function ToolCallAccordionStatus({
  success,
  isStreaming,
}: {
  success: boolean | undefined;
  isStreaming: boolean;
}) {
  if (success === true) {
    return (
      <IoMdCheckmark className="mr-1.5 self-center justify-self-end text-setta-400" />
    );
  }
  if (success === false) {
    return (
      <MdErrorOutline className="mr-1.5 self-center justify-self-end text-red-500" />
    );
  }
  return (
    <i
      className={`gg-spinner mr-1.5 !scale-75 self-center justify-self-end ${
        isStreaming
          ? "text-setta-400 dark:text-setta-300/70"
          : "text-setta-300/70"
      }`}
    />
  );
}

const ToolCallItem = memo(function ToolCallItem({
  name,
  args,
  result,
  success,
  isStreaming,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  success: boolean | undefined;
  isStreaming: boolean;
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
    if (success === false) {
      return "Tool execution failed";
    }
    if (success === true) {
      return "Tool completed successfully";
    }
    return null;
  })();

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="px-2 py-2 ">
            <PiWrenchFill
              size={15}
              className="min-w-6 text-setta-200 dark:text-setta-400"
            />
          </div>

          <div className="max-w-[calc(100%_-_6rem)] truncate break-words font-mono text-xs font-bold text-setta-500 dark:text-setta-200">
            {name}
          </div>
          <ToolCallAccordionStatus
            success={success}
            isStreaming={isStreaming}
          />
        </Accordion.Trigger>

        <Accordion.Content className="overflow-hidden rounded-b-md data-[state=open]:-mt-2.5 data-[state=open]:mb-2 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {args && (
            <div className="bg-setta-200/50 px-3 pb-2 pt-2.5 text-xs dark:bg-setta-860">
              <h3 className="!mt-2.5 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Arguments
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-xs text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          )}
          {resultDisplay && (
            <div className=" bg-setta-200 p-3  dark:bg-setta-900">
              <h3 className="!mt-0 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-xs text-setta-600 dark:text-setta-200">
                {resultDisplay}
              </pre>
            </div>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function StreamItem({
  item,
  isStreaming,
  showTypingIndicator = false,
}: {
  item: ChatContentItem;
  isStreaming: boolean;
  showTypingIndicator?: boolean;
}) {
  switch (item.type) {
    case C.LLM_TEXT:
      return (
        <MarkdownContent
          content={item.text}
          className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words [&_*]:marker:text-setta-400"
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
          typingIndicator={showTypingIndicator}
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

function LLMChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex justify-start">
      <div className="flex min-h-[25px] w-fit min-w-[25px] max-w-[min(85%,800px)] flex-shrink cursor-text flex-col gap-2 rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-4 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50">
        {children}
      </div>
    </div>
  );
}

function UserChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex justify-end">
      <div className="flex w-fit max-w-[min(85%,800px)] flex-shrink cursor-text flex-col gap-3 rounded-t-lg rounded-bl-lg bg-blue-500 px-4 py-4 text-white dark:bg-blue-700">
        {children}
      </div>
    </div>
  );
}

function SystemChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 flex justify-center">
      <div className="flex max-w-[min(90%,800px)] cursor-text flex-col gap-2 rounded-md border border-setta-200 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300">
        {children}
      </div>
    </div>
  );
}

const USER_MARKDOWN_CLASS =
  "prose prose-sm text-white dark:prose-invert prose-headings:tracking-tighter prose-headings:text-blue-200 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden [&>p]:inline-block [&_*]:break-words [&_*]:marker:text-setta-400";
const SYSTEM_MARKDOWN_CLASS =
  "prose prose-sm text-setta-600 dark:prose-invert prose-p:text-xs prose-headings:text-xs prose-headings:font-semibold prose-code:before:hidden prose-code:after:hidden [&_*]:break-words";

const ChatMessage = memo(function ChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  toolCallContext,
  attachmentUrlMap,
  requestAttachmentUrls,
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
}) {
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
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
  const showAssistantSpinner = useIdleStreamSpinner(
    isAssistant && isStreaming && toolCalls.length === 0,
    activityKey,
    spinnerDelayMs,
  );
  if (message.role === ChatRoleEnum.assistant) {
    const showTypingIndicator = showAssistantSpinner;
    return (
      <LLMChatBubble>
        <ChatAttachmentList
          attachments={attachments}
          isUser={false}
          attachmentUrlMap={attachmentUrlMap}
          requestAttachmentUrls={requestAttachmentUrls}
        />
        {message.content.map((item, idx) => (
          <StreamItem
            key={idx}
            item={item}
            isStreaming={isStreaming}
            showTypingIndicator={showTypingIndicator && idx === lastTextIndex}
          />
        ))}
        {showTypingIndicator && lastTextIndex === -1 ? (
          <span
            className="chat-typing-inline"
            data-typing="true"
            aria-hidden="true"
          />
        ) : null}
        {toolCalls.length > 0 ? (
          <div className="flex flex-col gap-1">
            {toolCalls.map((toolCall: ToolCall) => {
              const toolResult = toolResultsById[toolCall.id];
              const questionPayload =
                toolCallContext.questionPayloadById[toolCall.id];
              if (questionPayload) {
                const resolvedAnswers = resolveQuestionAnswers(
                  questionPayload,
                  toolResult,
                );
                return (
                  <QuestionCard
                    key={toolCall.id}
                    toolCallId={toolCall.id}
                    payload={questionPayload}
                    resolvedAnswers={resolvedAnswers}
                  />
                );
              }
              const todoPayload = toolCallContext.todoPayloadById[toolCall.id];
              if (todoPayload) {
                const summaryOnly =
                  toolCallContext.latestTodoCallId !== toolCall.id;
                return (
                  <TodoListCard
                    key={toolCall.id}
                    todos={todoPayload.todos}
                    summaryOnly={summaryOnly}
                  />
                );
              }
              const approvalPayload =
                toolCallContext.approvalPayloadById[toolCall.id];
              if (approvalPayload) {
                return (
                  <ApprovalCard
                    key={toolCall.id}
                    toolCallId={toolCall.id}
                    toolName={approvalPayload.toolName ?? null}
                    toolType={approvalPayload.toolType ?? null}
                    input={approvalPayload.input}
                    toolResult={toolResult}
                    isStreaming={isStreaming}
                  />
                );
              }
              const argsFromAssistant = toolCall.function?.arguments;
              const pendingArgs = toolCallArguments?.[toolCall.id];
              let argsToDisplay = pendingArgs;
              if (
                toolResult?.arguments &&
                Object.keys(toolResult.arguments).length > 0
              ) {
                argsToDisplay = toolResult.arguments;
              } else if (
                argsFromAssistant &&
                Object.keys(argsFromAssistant).length > 0
              ) {
                argsToDisplay = argsFromAssistant;
              }
              const rawToolName =
                toolResult?.tool_name ||
                toolCall.function?.name ||
                `Tool call ${toolCall.id}`;
              return (
                <ToolCallItem
                  key={toolCall.id}
                  name={rawToolName}
                  args={argsToDisplay}
                  result={formatToolResult(toolResult)}
                  success={toolResult ? !toolResult.is_error : undefined}
                  isStreaming={isStreaming}
                />
              );
            })}
          </div>
        ) : null}
      </LLMChatBubble>
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
    <Wrapper>
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

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  allMessages,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  allMessages: Array<BaseChatMessageUnion>;
}) {
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
        if (attachmentUrlRequests.current.has(attachment.id)) {
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
  for (const message of messages) {
    const isStreamingMessage =
      waitingForResponse &&
      message.role === ChatRoleEnum.assistant &&
      message.id === streamingMessageId;
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
      />,
    );
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
}: ChatMessageListProps) {
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const toolArgs = toolCallArguments ?? {};
  const wrapperClassName =
    `flex min-h-0 flex-1 flex-col-reverse overflow-y-auto pr-2 ${className ?? ""}`.trim();

  return (
    <div ref={scrollRef} className={wrapperClassName}>
      <div>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolArgs}
          allMessages={messages}
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
