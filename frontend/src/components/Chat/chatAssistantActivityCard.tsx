import * as Accordion from "@radix-ui/react-accordion";
import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
  FiCpu,
  FiEdit3,
  FiFileText,
  FiTerminal,
  FiTrash2,
} from "react-icons/fi";
import { IoMdCheckmark } from "react-icons/io";
import {
  MdErrorOutline,
  MdKeyboardArrowDown,
  MdOutlineSmartToy,
} from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import { normalizeToolName } from "utils/claudeTools";
import { ChatRoleEnum, type ToolChatMessage } from "utils/generatedTypes";
import {
  type ActivityTimelineEntry,
  buildCopyTextForActivityTimelineEntry,
  extractNonEmptyStringArg,
  resolveActionLabel,
  resolveActivityTimestampMs,
  resolveCollapsedThinkingActivityLabel,
  resolveCompactionEntryLabel,
  resolveDisplayArgsForToolCallEntry,
  resolveLatestActivityPreview,
  resolveThinkingSummaryHeadline,
  type ToolResultValue,
} from "./chatAssistantActivity";
import { copyTextWithNotifications } from "./chatCopyText";
import {
  ASSISTANT_MARKDOWN_CLASS,
  InlineMarkdownText,
  MarkdownContent,
  renderConversationSearchHighlightedText,
} from "./chatMessageContent";
import {
  ActivityThoughtPreview,
  AnimatedCountBadgeValue,
  ChatTimestamp,
  parseIsoTimestampMs,
  resolveDurationLabel,
  useRunElapsedDuration,
  useScrambledLabel,
} from "./chatMessageRuntime";
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

type ActivityToolLikeRowKind = StructuredOutputOwner;
type ToolCallRunState = StructuredOutputRunState;
type ToolCallSectionState = "running" | "complete" | "stopped";

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
const TOOL_CALL_RAIL_GRID_CLASS = "grid-cols-[1.75rem_minmax(0,1fr)]";
const TOOL_CALL_RAIL_BACKGROUND_CLASS = "bg-setta-100/75 dark:bg-setta-800/75";
const ACTIVITY_ROW_HOVER_CLASS =
  "hover:bg-setta-100/35 dark:hover:bg-setta-900/55";
const ACTIVITY_CHILD_TRIGGER_CLASS =
  "bg-setta-50/95 hover:bg-setta-100/95 dark:bg-setta-875 dark:hover:bg-setta-850";
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
const ASSISTANT_ACTIVITY_DETAILS_VALUE = "assistant-activity-details";
const ACTIVITY_ROW_DETAILS_VALUE = "details";

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

function resolveToolResultTimingAnchors(
  toolResult: ToolChatMessage | undefined,
): {
  startedAtMs: number | null;
  completedAtMs: number | null;
} {
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
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHasAdditionalLines = /\r?\n/u.test(summaryText);
  const resolvedSummaryHeadlineText = resolveThinkingSummaryHeadline({
    content,
    summary,
    isStreaming,
  });
  const summaryHeadlineText = suppressCollapsedSummary
    ? resolveCollapsedThinkingActivityLabel({
        isStreaming,
      })
    : resolvedSummaryHeadlineText;
  const collapsedSummaryWithHint =
    activityHint && !hasThinkingText
      ? `${summaryHeadlineText} - ${activityHint}`
      : summaryHeadlineText;
  const shouldRenderPlainSummaryWithHint = Boolean(
    !suppressCollapsedSummary && activityHint && !hasThinkingText,
  );
  const shouldMeasureSummaryOverflow =
    !suppressCollapsedSummary &&
    !hasThinkingText &&
    summaryHeadlineText.length > 0;
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
  const thinkingRunState: ToolCallSectionState = isStreaming
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
      active: isStreaming,
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
      setIsSummaryTitleTruncated((previous) =>
        previous === truncated ? previous : truncated,
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
                    <InlineMarkdownText
                      content={summaryHeadlineText}
                      highlightTerms={conversationSearchTerms}
                    />
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
            <div className="px-2 py-1">
              <MarkdownContent
                content={expandedContent}
                className={ASSISTANT_MARKDOWN_CLASS}
                role={ChatRoleEnum.assistant}
                isStreaming={hasThinkingText ? isStreaming : false}
                highlightTerms={conversationSearchTerms}
              />
            </div>
          </Accordion.Content>
        ) : null}
      </Accordion.Item>
    </Accordion.Root>
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
  preview: ReturnType<typeof resolveLatestActivityPreview>;
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
      setAccordionValue((previous) =>
        previous === ASSISTANT_ACTIVITY_DETAILS_VALUE
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
                        setCloseAllSignal((previous) => previous + 1);
                        setAllChildrenExpanded(false);
                        return;
                      }
                      setAccordionValue(ASSISTANT_ACTIVITY_DETAILS_VALUE);
                      setOpenAllSignal((previous) => previous + 1);
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
                      <InlineMarkdownText
                        content={activityTitleLabel}
                        highlightTerms={conversationSearchTerms}
                      />
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

export const AssistantActivityCard = memo(function AssistantActivityCard({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
  runKey,
  actionBar,
  suppressThoughtScrollAnimation = false,
  defaultOpen = false,
  defaultChildrenOpen = false,
  conversationSearchTerms = [],
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  runKey: string;
  actionBar?: ReactNode;
  suppressThoughtScrollAnimation?: boolean;
  defaultOpen?: boolean;
  defaultChildrenOpen?: boolean;
  conversationSearchTerms?: Array<string>;
}) {
  const preview = useMemo(
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

  if (timelineEntries.length === 0) {
    return null;
  }

  return (
    <AssistantActivityActionsAnchor actions={actionBar}>
      <AssistantReasoningCard>
        <AssistantActivitySection
          preview={preview}
          itemCount={timelineEntries.length}
          sectionState={activitySectionTiming.sectionState}
          startedAtMs={activitySectionTiming.startedAtMs}
          completedAtMs={activitySectionTiming.completedAtMs}
          runKey={runKey}
          suppressThoughtScrollAnimation={suppressThoughtScrollAnimation}
          defaultOpen={defaultOpen}
          defaultChildrenOpen={defaultChildrenOpen}
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
  );
});
