import * as Dialog from "@radix-ui/react-dialog";

import { formatBytes } from "@setta/app-subsystem-frontend-sdk";

import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";

import {
  ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { IoMdClose } from "react-icons/io";

import {
  getAttachmentPreviewKind,
  isTextAttachment,
} from "utils/attachmentPreview";

import { C } from "utils/c";

import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";

import { type AttachmentUrlEntry } from "../useChatMessageAttachmentUrls";

import {
  ActivityPreviewData,
  ActivityTimelineEntry,
  AssistantContentPartition,
  AssistantDisplayItem,
  AttachmentTextPreview,
  COUNT_BADGE_STEP_ANIMATION_MS,
  COUNT_BADGE_STEP_PAUSE_MS,
  ChatContentItem,
  ThinkingContentItem,
  buildUnavailableTextPreview,
  createTextPreviewState,
  fetchAttachmentTextPreview,
  renderAttachmentPreviewContent,
  resolveAttachmentUrlEntry,
  resolveOversizeTextPreview,
} from "./modelAndAttachmentPreview";

import {
  ActivityPreviewBase,
  buildActivityPreviewData,
  resolveActionEntryLabel,
  resolveCompactionEntryLabel,
  resolveFallbackThinkingHeadline,
  resolveHasStreamingThought,
  resolveLatestThoughtPreview,
  resolveSubagentEntryLabel,
  resolveThinkingPreviewHeadline,
  resolveToolEntryLabel,
} from "./streamingMarkdownAndToolLabels";

export function resolveThinkingActivityPreview({
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

export function resolveToolActivityPreview({
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

export function resolveLatestActivityPreview({
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

export type StreamActivitySummary = {
  activityKey: string;
  lastTextIndex: number;
};

export const ASSISTANT_ERROR_PREFIX = "[Error]";

export function isAssistantErrorText(text: string): boolean {
  return text.trimStart().startsWith(ASSISTANT_ERROR_PREFIX);
}

export function stripAssistantErrorPrefix(text: string): string {
  const next = text.replace(/^\s*\[Error\]\s*/u, "");
  return next.trim().length > 0 ? next : "The AI request failed.";
}

export function isThinkingContentItem(
  item: ChatContentItem,
): item is ThinkingContentItem {
  return item.type === C.LLM_THINKING;
}

export function partitionAssistantContent(
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

export function isMeaningfulAssistantDisplayItem(
  item: ChatContentItem,
): boolean {
  if (item.type === C.LLM_TEXT) {
    return item.text.trim().length > 0;
  }
  if (item.type === "image_url") {
    return item.image_url.url.trim().length > 0;
  }
  return false;
}

export function hasMeaningfulAssistantDisplayItems(
  displayItems: AssistantDisplayItem[],
): boolean {
  return displayItems.some(({ item }) =>
    isMeaningfulAssistantDisplayItem(item),
  );
}

export function getStreamActivitySummary(
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

export function resolveStreamingAssistantMessageId(
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

export function useIdleStreamSpinner(
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

export function normalizeCountBadgeValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export type CountBadgeTransition = {
  from: number;
  to: number;
  direction: 1 | -1;
  animate: boolean;
};

export const AnimatedCountBadgeValue = memo(function AnimatedCountBadgeValue({
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

export function ChatImage({
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

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;

export const TEXT_PREVIEW_CHAR_LIMIT = 4_000;

export const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

export function getAttachmentSizeLabel(
  attachment: ChatFileAttachment,
): string | null {
  if (attachment.size === null || attachment.size === undefined) {
    return null;
  }
  return formatBytes(attachment.size);
}

export function AttachmentPreviewDialog({
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
