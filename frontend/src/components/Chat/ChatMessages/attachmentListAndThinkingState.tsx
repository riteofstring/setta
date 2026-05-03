import * as Accordion from "@radix-ui/react-accordion";

import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";

import {
  type MutableRefObject,
  ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { FaBrain } from "react-icons/fa6";

import { FiCopy } from "react-icons/fi";

import { MdErrorOutline, MdKeyboardArrowDown } from "react-icons/md";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";

import { isImageAttachment } from "utils/attachmentPreview";

import { ChatFileAttachment, ChatRoleEnum } from "utils/generatedTypes";

import {
  getConversationSearchRehypePlugins,
  renderConversationSearchHighlightedText,
} from "../chatSearchHighlight";

import {
  resolveCollapsedThinkingActivityLabel,
  resolveThinkingSummaryHeadline,
} from "../chatThinkingSummary";

import {
  ChatTimestamp,
  resolveDurationLabel,
  useRunElapsedDuration,
} from "../chatTiming";

import {
  type AttachmentUrlEntry,
  isAttachmentUrlStale,
} from "../useChatMessageAttachmentUrls";

import {
  ACTIVITY_ACCORDION_CONTENT_CLASS,
  ACTIVITY_CHILD_TRIGGER_CLASS,
  ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS,
  ACTIVITY_ITEM_HOVER_META_CLASS,
  ACTIVITY_ITEM_LABEL_CLASS,
  ACTIVITY_ROW_DETAILS_VALUE,
  ASSISTANT_MARKDOWN_CLASS,
  TOOL_CALL_RAIL_BACKGROUND_CLASS,
  TOOL_CALL_RAIL_GRID_CLASS,
} from "./modelAndAttachmentPreview";

import { MarkdownContent } from "./streamingMarkdownAndToolLabels";

import {
  AttachmentPreviewDialog,
  ChatImage,
  getAttachmentSizeLabel,
} from "./activityPreviewsAndAttachmentDialog";

import {
  ToolCallRunState,
  ToolCallSectionState,
} from "./activityRowsAndBubbles";

export function ChatAttachmentList({
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

export function resolveThinkingRowRunState(
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

export function useActivityAccordionState({
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

export function useThinkingSummaryOverflow({
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

export function ThinkingBoxSummaryLabel({
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

export function ThinkingBoxStatus({
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

export function ThinkingBoxExpandedContent({
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

export function ThinkingBoxHeader({
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

export type ThinkingBoxBaseState = {
  summaryText: string;
  hasThinkingText: boolean;
  summaryHeadlineText: string;
  collapsedSummaryWithHint: string;
  shouldRenderPlainSummaryWithHint: boolean;
  shouldMeasureSummaryOverflow: boolean;
};

export function resolveThinkingSummaryHeadlineText(args: {
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

export function resolveCollapsedSummaryWithHint(args: {
  activityHint?: string | null;
  hasThinkingText: boolean;
  summaryHeadlineText: string;
}): string {
  if (args.activityHint && !args.hasThinkingText) {
    return `${args.summaryHeadlineText} - ${args.activityHint}`;
  }
  return args.summaryHeadlineText;
}

export function resolveThinkingBoxBaseState({
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

export function resolveThinkingTriggerClassName(
  hasExpandableContent: boolean,
): string {
  return `grid w-full ${TOOL_CALL_RAIL_GRID_CLASS} ${ACTIVITY_CHILD_TRIGGER_CLASS} max-w-full overflow-hidden text-left transition-colors [&[data-state=open]_.chat-accordion-chevron]:rotate-180 ${
    hasExpandableContent ? "cursor-pointer" : "cursor-default"
  }`;
}

export function resolveThinkingExpandableState({
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

export function normalizeActivityAccordionValue(
  nextValue: string | undefined,
): string | undefined {
  return nextValue === ACTIVITY_ROW_DETAILS_VALUE
    ? ACTIVITY_ROW_DETAILS_VALUE
    : undefined;
}

export const ThinkingBox = memo(function ThinkingBox({
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
  const [accordionValue, setAccordionValue] = useActivityAccordionState({
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
        setAccordionValue(normalizeActivityAccordionValue(nextValue));
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

export function resolveThinkingSectionState({
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
