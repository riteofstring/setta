import * as Accordion from "@radix-ui/react-accordion";

import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";

import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  ReactNode,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { IoMdCheckmark } from "react-icons/io";

import {
  MdErrorOutline,
  MdKeyboardArrowDown,
  MdOutlineSmartToy,
} from "react-icons/md";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";

import {
  getConversationSearchRehypePlugins,
  renderConversationSearchHighlightedText,
} from "../chatSearchHighlight";

import { useScrambledLabel } from "../chatThinkingSummary";

import { resolveDurationLabel, useRunElapsedDuration } from "../chatTiming";

import {
  ACTIVITY_COUNT_BADGE_CLASS,
  ACTIVITY_PARENT_HOVER_META_CLASS,
  ACTIVITY_PARENT_LABEL_CLASS,
  ACTIVITY_THOUGHT_TOP_ONLY_MASK,
  ASSISTANT_ACTIVITY_CONTENT_CLASS,
  ASSISTANT_ACTIVITY_DETAILS_VALUE,
  ASSISTANT_ACTIVITY_PARENT_CLASS,
  ASSISTANT_ACTIVITY_TRIGGER_CLASS,
  ActivityPreviewData,
  AssistantActivityChildAccordionControl,
} from "./modelAndAttachmentPreview";

import { ThoughtPreviewMarkdown } from "./streamingMarkdownAndToolLabels";

import { AnimatedCountBadgeValue } from "./activityPreviewsAndAttachmentDialog";

import {
  ToolCallRunState,
  ToolCallSectionState,
} from "./activityRowsAndBubbles";

export const ActivityThoughtPreview = memo(function ActivityThoughtPreview({
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

export type AssistantActivityDisplayState = {
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

export function normalizeAssistantActivityAccordionValue(
  nextValue: string | undefined,
): string | undefined {
  return nextValue === ASSISTANT_ACTIVITY_DETAILS_VALUE
    ? ASSISTANT_ACTIVITY_DETAILS_VALUE
    : undefined;
}

export function resolveAssistantActivityDurationClassName(
  sectionState: ToolCallSectionState,
): string {
  return sectionState === "stopped"
    ? "font-mono text-[10px] text-amber-700 dark:text-amber-200"
    : "font-mono text-[10px] text-setta-400 dark:text-setta-400/90";
}

export function resolveAssistantActivityTitleLabel({
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

export function resolveAssistantActivityPrimaryLabel({
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

export function resolveAssistantThoughtPreviewDisplayState({
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

export function resolveAssistantActivityDisplayState({
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

export function useAssistantActivityState({
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

export function useAssistantActivityTriggerHandlers(
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

export function AssistantActivityPreviewLabel({
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

export function AssistantActivityHeader({
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

export function AssistantActivityThoughtPreviewShell({
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

export const AssistantActivitySection = memo(function AssistantActivitySection({
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

export function ToolCallAccordionStatus({
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
    <BrailleSpinner
      className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
    />
  );
}
