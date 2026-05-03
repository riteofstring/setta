import * as Accordion from "@radix-ui/react-accordion";

import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";

import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";

import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";

import {
  ReactNode,
  type PointerEvent as ReactPointerEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { FiCopy, FiTerminal } from "react-icons/fi";

import { MdKeyboardArrowDown } from "react-icons/md";

import {
  type StructuredOutputPart,
  type StructuredOutputPayload,
  resolveStructuredOutputFallbackPayload,
  resolveStructuredOutputPayload,
} from "../chatStructuredOutput";

import {
  ChatTimestamp,
  resolveActivityTimestampMs,
  resolveDurationLabel,
  useRunElapsedDuration,
} from "../chatTiming";

import { useTypewriterEffect } from "../useTypewriterEffect";

import {
  ACTIVITY_ACCORDION_CONTENT_CLASS,
  ACTIVITY_ITEM_HOVER_COPY_BUTTON_CLASS,
  ACTIVITY_ITEM_HOVER_META_CLASS,
  ACTIVITY_ITEM_LABEL_CLASS,
  ACTIVITY_ROW_DETAILS_VALUE,
  ActivityToolLikeRowKind,
  STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX,
  STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO,
  STRUCTURED_OUTPUT_MIN_HEIGHT_PX,
  STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS,
  STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS,
  StructuredOutputOwner,
  TOOL_CALL_RAIL_BACKGROUND_CLASS,
  TOOL_ROW_TRIGGER_CLASS,
  ToolResultValue,
} from "./modelAndAttachmentPreview";

import { resolveActionLabel } from "./streamingMarkdownAndToolLabels";

import {
  normalizeActivityAccordionValue,
  useActivityAccordionState,
} from "./attachmentListAndThinkingState";

import { ToolCallAccordionStatus } from "./thoughtPreviewAndAssistantActivity";

import { ToolCallRunState } from "./activityRowsAndBubbles";

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

function resolveActivityDurationClassName(runState: ToolCallRunState): string {
  return runState === "failed" || runState === "stopped"
    ? "font-mono text-[10px] text-amber-700 dark:text-amber-200"
    : "font-mono text-[10px] text-setta-400 dark:text-setta-400/90";
}

function useActivityToolLikeAccordionState({
  defaultOpen,
  expandAllSignal,
  collapseAllSignal,
  runKey,
  onExpansionChange,
}: {
  defaultOpen: boolean;
  expandAllSignal: number;
  collapseAllSignal: number;
  runKey: string;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const [accordionValue, setAccordionValue] = useActivityAccordionState({
    defaultOpen,
    hasExpandableContent: true,
    expandAllSignal,
    collapseAllSignal,
  });
  const isExpanded = accordionValue === ACTIVITY_ROW_DETAILS_VALUE;

  useEffect(() => {
    onExpansionChange?.(runKey, isExpanded);
  }, [isExpanded, onExpansionChange, runKey]);

  return {
    accordionValue,
    setAccordionValue,
  };
}

export const ActivityToolLikeItem = memo(function ActivityToolLikeItem({
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
  const durationClassName = resolveActivityDurationClassName(runState);
  const { accordionValue, setAccordionValue } =
    useActivityToolLikeAccordionState({
      defaultOpen,
      expandAllSignal,
      collapseAllSignal,
      runKey,
      onExpansionChange,
    });

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

export const ActionItem = memo(function ActionItem({
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

export const ToolCallItem = memo(function ToolCallItem({
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

export const TerminalItem = memo(function TerminalItem({
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
