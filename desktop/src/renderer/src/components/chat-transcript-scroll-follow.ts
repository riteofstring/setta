import type {
  ApprovalQuestion,
  ChatMessage,
  MessagePart,
  Run,
  RunItemOutput,
  StructuredInputRequest,
  TranscriptBlock,
} from "@generated/backend";
import type { KeyboardEvent, PointerEvent, RefObject, UIEvent, WheelEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ListRange, VirtuosoHandle } from "react-virtuoso";

import type { RunItemOutputPageState } from "../stores/chat-store";
import type { TranscriptRenderRow } from "../lib/chat-transcript-render-rows";

export type TranscriptScrollFollowMode = "auto_follow" | "programmatic_anchor" | "user_detached";

export interface ChatTranscriptScrollDebugSnapshot {
  atBottom: boolean;
  clientHeight: number;
  distanceFromBottom: number;
  lastVisibleIndex: number;
  mode: TranscriptScrollFollowMode;
  pendingScrollCount: number;
  rowCount: number;
  scrollHeight: number;
  scrollTop: number;
  tailRevision: string;
  trace: ChatTranscriptScrollDebugTraceEntry[];
}

export interface ChatTranscriptScrollDebugTraceEntry {
  [key: string]: boolean | number | string | null;
  at: number;
  atBottom: boolean;
  clientHeight: number;
  distanceFromBottom: number;
  event: string;
  lastVisibleIndex: number;
  mode: TranscriptScrollFollowMode;
  pendingScrollCount: number;
  rowCount: number;
  scrollHeight: number;
  scrollTop: number;
  seq: number;
  tailRevision: string;
}

type ScrollToIndexLocation = Parameters<VirtuosoHandle["scrollToIndex"]>[0];

export interface TranscriptScrollMetrics {
  clientHeight: number;
  distanceFromBottom: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface TranscriptScrollFollowDecision {
  mode: TranscriptScrollFollowMode;
  shouldScrollToLatest: boolean;
}

interface TranscriptScrollFollowBottomInput {
  lastVisibleIndex: number;
  metrics: TranscriptScrollMetrics;
  rowCount: number;
}

interface TranscriptScrollFollowScrollDecisionInput {
  metrics: TranscriptScrollMetrics;
  mode: TranscriptScrollFollowMode;
  pointerScrollIntent: boolean;
  previousScrollTop: number;
  tailScrollIntent: boolean;
  wheelScrollIntent: boolean;
}

interface TranscriptScrollFollowInput {
  rowCount: number;
  tailRevision: string;
  virtuosoRef: RefObject<VirtuosoHandle | null>;
}

const strictBottomDistancePx = 24;
const reattachBottomDistancePx = 2;
const scrollDirectionThresholdPx = 1;
const scrollbarPointerIntentEdgePx = 24;
const transcriptScrollDebugTextLength = 160;
const transcriptScrollDebugTraceLimit = 30;
const tailRevisionRowCount = 24;
const virtualBottomDistancePx = 96;

export function useTranscriptScrollFollow({
  rowCount,
  tailRevision,
  virtuosoRef,
}: TranscriptScrollFollowInput) {
  const [mode, setModeState] = useState<TranscriptScrollFollowMode>("auto_follow");
  const autoScrollFrameRef = useRef<number | null>(null);
  const modeRef = useRef<TranscriptScrollFollowMode>("auto_follow");
  const pendingScrollCountRef = useRef(0);
  const programmaticAnchorFrameRef = useRef<number | null>(null);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const pointerScrollIntentRef = useRef(false);
  const rowCountRef = useRef(rowCount);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const tailRevisionRef = useRef(tailRevision);
  const tailScrollIntentRef = useRef(false);
  const visibleEndIndexRef = useRef(rowCount - 1);
  const wheelScrollIntentRef = useRef(false);
  const metricsRef = useRef<TranscriptScrollMetrics>({
    clientHeight: 0,
    distanceFromBottom: 0,
    scrollHeight: 0,
    scrollTop: 0,
  });
  const traceRef = useRef<ChatTranscriptScrollDebugTraceEntry[]>([]);
  const traceSeqRef = useRef(0);
  const [debugSnapshot, setDebugSnapshot] = useState<ChatTranscriptScrollDebugSnapshot>(() => ({
    atBottom: rowCount <= 0,
    clientHeight: 0,
    distanceFromBottom: 0,
    lastVisibleIndex: rowCount - 1,
    mode: "auto_follow",
    pendingScrollCount: 0,
    rowCount,
    scrollHeight: 0,
    scrollTop: 0,
    tailRevision: truncateTranscriptScrollDebugText(tailRevision),
    trace: [],
  }));

  useEffect(() => {
    rowCountRef.current = rowCount;
    tailRevisionRef.current = tailRevision;
  }, [rowCount, tailRevision]);

  const clearDirectionalScrollIntent = useCallback(() => {
    tailScrollIntentRef.current = false;
    wheelScrollIntentRef.current = false;
  }, []);

  const clearScrollIntent = useCallback(() => {
    clearDirectionalScrollIntent();
    pointerScrollIntentRef.current = false;
  }, [clearDirectionalScrollIntent]);

  const cancelAutoScrollToLatest = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
      pendingScrollCountRef.current = 0;
    }
  }, []);

  const updateMetricsFromElement = useCallback((element: HTMLElement) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const distanceFromBottom = Math.max(0, maxScrollTop - element.scrollTop);
    metricsRef.current = {
      clientHeight: element.clientHeight,
      distanceFromBottom,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  }, []);

  const updateMetricsFromScroller = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      updateMetricsFromElement(scroller);
    }
  }, [updateMetricsFromElement]);

  const atBottom = useCallback(() => {
    return transcriptAtAutoFollowBottom({
      lastVisibleIndex: visibleEndIndexRef.current,
      metrics: metricsRef.current,
      rowCount: rowCountRef.current,
    });
  }, []);

  const readDebugSnapshot = useCallback(
    (): ChatTranscriptScrollDebugSnapshot => ({
      atBottom: atBottom(),
      clientHeight: metricsRef.current.clientHeight,
      distanceFromBottom: metricsRef.current.distanceFromBottom,
      lastVisibleIndex: visibleEndIndexRef.current,
      mode: modeRef.current,
      pendingScrollCount: pendingScrollCountRef.current,
      rowCount: rowCountRef.current,
      scrollHeight: metricsRef.current.scrollHeight,
      scrollTop: metricsRef.current.scrollTop,
      tailRevision: truncateTranscriptScrollDebugText(tailRevisionRef.current),
      trace: traceRef.current,
    }),
    [atBottom],
  );

  const refreshDebugSnapshot = useCallback(() => {
    if (transcriptScrollDebugRecordingEnabled()) {
      setDebugSnapshot(readDebugSnapshot());
    }
  }, [readDebugSnapshot]);

  const recordDebugTrace = useCallback(
    (event: string, extra: Record<string, boolean | number | string | null | undefined> = {}) => {
      if (!transcriptScrollDebugRecordingEnabled()) {
        return;
      }
      const entry: ChatTranscriptScrollDebugTraceEntry = {
        at: Math.round(performance.now()),
        atBottom: atBottom(),
        clientHeight: metricsRef.current.clientHeight,
        distanceFromBottom: metricsRef.current.distanceFromBottom,
        event,
        lastVisibleIndex: visibleEndIndexRef.current,
        mode: modeRef.current,
        pendingScrollCount: pendingScrollCountRef.current,
        rowCount: rowCountRef.current,
        scrollHeight: metricsRef.current.scrollHeight,
        scrollTop: metricsRef.current.scrollTop,
        seq: traceSeqRef.current + 1,
        tailRevision: truncateTranscriptScrollDebugText(tailRevisionRef.current),
      };
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) {
          entry[key] = value;
        }
      }
      traceSeqRef.current = entry.seq;
      traceRef.current = [...traceRef.current, entry].slice(-transcriptScrollDebugTraceLimit);
      setDebugSnapshot(readDebugSnapshot());
    },
    [atBottom, readDebugSnapshot],
  );

  useEffect(() => {
    recordDebugTrace("tail_revision");
  }, [recordDebugTrace, rowCount, tailRevision]);

  const setMode = useCallback(
    (next: TranscriptScrollFollowMode, reason: string) => {
      if (next === "auto_follow") {
        clearDirectionalScrollIntent();
      } else {
        cancelAutoScrollToLatest();
      }
      const previous = modeRef.current;
      if (previous === next) {
        refreshDebugSnapshot();
        return;
      }
      modeRef.current = next;
      setModeState(next);
      recordDebugTrace("mode_change", { nextMode: next, previousMode: previous, reason });
    },
    [
      cancelAutoScrollToLatest,
      clearDirectionalScrollIntent,
      recordDebugTrace,
      refreshDebugSnapshot,
    ],
  );

  const scrollToLatest = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [virtuosoRef]);

  const scheduleAutoScrollToLatest = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      recordDebugTrace("auto_scroll_already_pending");
      return;
    }
    pendingScrollCountRef.current = 1;
    recordDebugTrace("auto_scroll_scheduled");
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      if (modeRef.current !== "auto_follow") {
        pendingScrollCountRef.current = 0;
        recordDebugTrace("auto_scroll_skipped", { reason: "mode_not_auto_follow" });
        return;
      }
      scrollToLatest();
      recordDebugTrace("auto_scroll_to_latest");
      requestAnimationFrame(() => {
        pendingScrollCountRef.current = 0;
        updateMetricsFromScroller();
        recordDebugTrace("auto_scroll_completed");
      });
    });
  }, [recordDebugTrace, scrollToLatest, updateMetricsFromScroller]);

  const applyDecision = useCallback(
    (
      source: string,
      decision: TranscriptScrollFollowDecision,
      extra: Record<string, boolean | number | string | null | undefined> = {},
    ) => {
      recordDebugTrace(`${source}_decision`, {
        ...extra,
        nextMode: decision.mode,
        previousMode: modeRef.current,
        shouldScrollToLatest: decision.shouldScrollToLatest,
      });
      setMode(decision.mode, `${source}_decision`);
      if (decision.shouldScrollToLatest) {
        scheduleAutoScrollToLatest();
      }
    },
    [recordDebugTrace, scheduleAutoScrollToLatest, setMode],
  );

  const finishProgrammaticAnchor = useCallback(() => {
    if (programmaticAnchorFrameRef.current !== null) {
      cancelAnimationFrame(programmaticAnchorFrameRef.current);
    }
    programmaticAnchorFrameRef.current = requestAnimationFrame(() => {
      programmaticAnchorFrameRef.current = requestAnimationFrame(() => {
        programmaticAnchorFrameRef.current = null;
        updateMetricsFromScroller();
        if (atBottom()) {
          recordDebugTrace("programmatic_anchor_finished", { result: "at_bottom" });
          setMode("auto_follow", "programmatic_anchor_finished");
          scheduleAutoScrollToLatest();
        } else {
          recordDebugTrace("programmatic_anchor_finished", { result: "not_at_bottom" });
          setMode("user_detached", "programmatic_anchor_finished");
        }
      });
    });
  }, [atBottom, recordDebugTrace, scheduleAutoScrollToLatest, setMode, updateMetricsFromScroller]);

  const scrollToIndexAsProgrammaticAnchor = useCallback(
    (location: ScrollToIndexLocation) => {
      clearDirectionalScrollIntent();
      recordDebugTrace("programmatic_anchor_start");
      setMode("programmatic_anchor", "programmatic_anchor_start");
      if (programmaticScrollFrameRef.current !== null) {
        cancelAnimationFrame(programmaticScrollFrameRef.current);
      }
      programmaticScrollFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollFrameRef.current = null;
        virtuosoRef.current?.scrollToIndex(location);
        finishProgrammaticAnchor();
      });
    },
    [
      clearDirectionalScrollIntent,
      finishProgrammaticAnchor,
      recordDebugTrace,
      setMode,
      virtuosoRef,
    ],
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target !== scrollerRef.current) {
        return;
      }
      const previousScrollTop = metricsRef.current.scrollTop;
      const tailScrollIntent = tailScrollIntentRef.current;
      const wheelScrollIntent = wheelScrollIntentRef.current;
      const pointerScrollIntent = pointerScrollIntentRef.current;
      tailScrollIntentRef.current = false;
      wheelScrollIntentRef.current = false;
      updateMetricsFromElement(target);
      const scrollDirection = transcriptScrollDirection(
        metricsRef.current.scrollTop,
        previousScrollTop,
      );
      applyDecision(
        "scroll",
        decideTranscriptScrollFollowAfterScroll({
          metrics: metricsRef.current,
          mode: modeRef.current,
          pointerScrollIntent,
          previousScrollTop,
          tailScrollIntent,
          wheelScrollIntent,
        }),
        {
          pointerScrollIntent,
          previousScrollTop,
          scrollDirection,
          tailScrollIntent,
          wheelScrollIntent,
        },
      );
    },
    [applyDecision, updateMetricsFromElement],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY < 0) {
        tailScrollIntentRef.current = false;
        wheelScrollIntentRef.current = true;
        recordDebugTrace("wheel", { deltaY: event.deltaY, intent: "history" });
        setMode("user_detached", "wheel_history");
      } else if (event.deltaY > 0) {
        wheelScrollIntentRef.current = false;
        tailScrollIntentRef.current = true;
        recordDebugTrace("wheel", { deltaY: event.deltaY, intent: "tail" });
      }
    },
    [recordDebugTrace, setMode],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      if (
        event.button === 0 &&
        scroller &&
        event.clientX >= scroller.getBoundingClientRect().right - scrollbarPointerIntentEdgePx
      ) {
        pointerScrollIntentRef.current = true;
        recordDebugTrace("pointer_scrollbar_down", { clientX: event.clientX });
      }
    },
    [recordDebugTrace],
  );

  const handlePointerEnd = useCallback(() => {
    if (pointerScrollIntentRef.current) {
      recordDebugTrace("pointer_scrollbar_end");
    }
    pointerScrollIntentRef.current = false;
  }, [recordDebugTrace]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        ["ArrowUp", "Home", "PageUp"].includes(event.key) ||
        (event.key === " " && event.shiftKey)
      ) {
        clearDirectionalScrollIntent();
        recordDebugTrace("key", { intent: "history", key: event.key, shiftKey: event.shiftKey });
        setMode("user_detached", "key_history");
      } else if (["ArrowDown", "End", "PageDown"].includes(event.key) || event.key === " ") {
        wheelScrollIntentRef.current = false;
        tailScrollIntentRef.current = true;
        recordDebugTrace("key", { intent: "tail", key: event.key, shiftKey: event.shiftKey });
      }
    },
    [clearDirectionalScrollIntent, recordDebugTrace, setMode],
  );

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      visibleEndIndexRef.current = range.endIndex;
      applyDecision(
        "range",
        decideTranscriptScrollFollowAfterRangeChanged({
          lastVisibleIndex: range.endIndex,
          metrics: metricsRef.current,
          mode: modeRef.current,
          rowCount: rowCountRef.current,
        }),
        { rangeEndIndex: range.endIndex, rangeStartIndex: range.startIndex },
      );
    },
    [applyDecision],
  );

  const handleAtBottomStateChange = useCallback(
    (isAtBottom: boolean) => {
      updateMetricsFromScroller();
      applyDecision(
        "at_bottom_state",
        decideTranscriptScrollFollowAfterAtBottomStateChange({
          isAtBottom,
          mode: modeRef.current,
        }),
        { isAtBottom },
      );
    },
    [applyDecision, updateMetricsFromScroller],
  );

  const handleTotalListHeightChanged = useCallback(() => {
    updateMetricsFromScroller();
    recordDebugTrace("total_list_height_changed");
    if (modeRef.current === "auto_follow") {
      scheduleAutoScrollToLatest();
    }
  }, [recordDebugTrace, scheduleAutoScrollToLatest, updateMetricsFromScroller]);

  const setScrollerRef = useCallback(
    (element: HTMLElement | Window | null) => {
      scrollerRef.current = element instanceof HTMLElement ? element : null;
      updateMetricsFromScroller();
      recordDebugTrace("scroller_ref", { attached: scrollerRef.current !== null });
    },
    [recordDebugTrace, updateMetricsFromScroller],
  );

  const detach = useCallback(() => {
    clearDirectionalScrollIntent();
    recordDebugTrace("detach");
    setMode("user_detached", "detach");
  }, [clearDirectionalScrollIntent, recordDebugTrace, setMode]);

  const jumpToLatest = useCallback(() => {
    clearScrollIntent();
    recordDebugTrace("jump_to_latest");
    setMode("auto_follow", "jump_to_latest");
    scrollToLatest();
    scheduleAutoScrollToLatest();
  }, [clearScrollIntent, recordDebugTrace, scheduleAutoScrollToLatest, scrollToLatest, setMode]);

  const getDebugSnapshot = useCallback((): ChatTranscriptScrollDebugSnapshot => {
    updateMetricsFromScroller();
    const snapshot = readDebugSnapshot();
    if (transcriptScrollDebugRecordingEnabled()) {
      setDebugSnapshot(snapshot);
    }
    return snapshot;
  }, [readDebugSnapshot, updateMetricsFromScroller]);

  useEffect(() => {
    if (modeRef.current === "auto_follow") {
      scheduleAutoScrollToLatest();
    }
  }, [scheduleAutoScrollToLatest, tailRevision]);

  useEffect(() => {
    const api = { getSnapshot: getDebugSnapshot };
    window.__settaChatTranscriptScrollDebug = api;
    return () => {
      if (window.__settaChatTranscriptScrollDebug === api) {
        delete window.__settaChatTranscriptScrollDebug;
      }
    };
  }, [getDebugSnapshot]);

  useEffect(
    () => () => {
      for (const frame of [
        autoScrollFrameRef.current,
        programmaticAnchorFrameRef.current,
        programmaticScrollFrameRef.current,
      ]) {
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
      }
    },
    [],
  );

  return {
    detach,
    debugAttributes: transcriptScrollDebugAttributes(debugSnapshot),
    getDebugSnapshot,
    handleAtBottomStateChange,
    handleKeyDown,
    handlePointerCancel: handlePointerEnd,
    handlePointerDown,
    handlePointerUp: handlePointerEnd,
    handleRangeChanged,
    handleScroll,
    handleTotalListHeightChanged,
    handleWheel,
    jumpToLatest,
    mode,
    scrollToIndexAsProgrammaticAnchor,
    setScrollerRef,
  };
}

function transcriptScrollDebugAttributes(
  snapshot: ChatTranscriptScrollDebugSnapshot,
): Record<string, string> | undefined {
  if (!transcriptScrollDebugRecordingEnabled()) {
    return undefined;
  }
  return {
    "data-scroll-follow-at-bottom": String(snapshot.atBottom),
    "data-scroll-follow-client-height": String(Math.round(snapshot.clientHeight)),
    "data-scroll-follow-distance-from-bottom": String(Math.round(snapshot.distanceFromBottom)),
    "data-scroll-follow-last-visible-index": String(snapshot.lastVisibleIndex),
    "data-scroll-follow-mode": snapshot.mode,
    "data-scroll-follow-pending-scroll-count": String(snapshot.pendingScrollCount),
    "data-scroll-follow-row-count": String(snapshot.rowCount),
    "data-scroll-follow-scroll-height": String(Math.round(snapshot.scrollHeight)),
    "data-scroll-follow-scroll-top": String(Math.round(snapshot.scrollTop)),
    "data-scroll-follow-tail-revision": snapshot.tailRevision,
    "data-scroll-follow-trace": JSON.stringify(snapshot.trace),
  };
}

function transcriptScrollDebugRecordingEnabled() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-setta-recording") === "true"
  );
}

function truncateTranscriptScrollDebugText(value: string) {
  return value.length > transcriptScrollDebugTextLength
    ? `${value.slice(0, transcriptScrollDebugTextLength - 3)}...`
    : value;
}

export function decideTranscriptScrollFollowAfterScroll({
  metrics,
  mode,
  pointerScrollIntent,
  previousScrollTop,
  tailScrollIntent,
  wheelScrollIntent,
}: TranscriptScrollFollowScrollDecisionInput): TranscriptScrollFollowDecision {
  const scrollDirection = transcriptScrollDirection(metrics.scrollTop, previousScrollTop);

  switch (mode) {
    case "programmatic_anchor":
      return { mode, shouldScrollToLatest: false };
    case "user_detached":
      if (
        shouldReattachDetachedFromScroll({
          metrics,
          pointerScrollIntent,
          scrollDirection,
          tailScrollIntent,
        })
      ) {
        return { mode: "auto_follow", shouldScrollToLatest: true };
      }
      return { mode, shouldScrollToLatest: false };
    case "auto_follow":
      if (shouldDetachAutoFollowFromScroll({ scrollDirection, wheelScrollIntent })) {
        return { mode: "user_detached", shouldScrollToLatest: false };
      }
      return { mode, shouldScrollToLatest: true };
  }
}

type TranscriptScrollDirection = "history" | "tail" | "none";

function transcriptScrollDirection(
  currentScrollTop: number,
  previousScrollTop: number,
): TranscriptScrollDirection {
  if (currentScrollTop < previousScrollTop - scrollDirectionThresholdPx) {
    return "history";
  }
  if (currentScrollTop > previousScrollTop + scrollDirectionThresholdPx) {
    return "tail";
  }
  return "none";
}

function shouldDetachAutoFollowFromScroll({
  scrollDirection,
  wheelScrollIntent,
}: {
  scrollDirection: TranscriptScrollDirection;
  wheelScrollIntent: boolean;
}) {
  return wheelScrollIntent || scrollDirection === "history";
}

function shouldReattachDetachedFromScroll({
  metrics,
  pointerScrollIntent,
  scrollDirection,
  tailScrollIntent,
}: {
  metrics: TranscriptScrollMetrics;
  pointerScrollIntent: boolean;
  scrollDirection: TranscriptScrollDirection;
  tailScrollIntent: boolean;
}) {
  const hasTailDirectedIntent =
    tailScrollIntent || (pointerScrollIntent && scrollDirection === "tail");
  return hasTailDirectedIntent && transcriptAtStrictBottom(metrics);
}

export function decideTranscriptScrollFollowAfterRangeChanged({
  lastVisibleIndex,
  metrics,
  mode,
  rowCount,
}: TranscriptScrollFollowBottomInput & {
  mode: TranscriptScrollFollowMode;
}): TranscriptScrollFollowDecision {
  if (
    mode === "auto_follow" &&
    transcriptAtAutoFollowBottom({ lastVisibleIndex, metrics, rowCount })
  ) {
    return { mode, shouldScrollToLatest: true };
  }
  return { mode, shouldScrollToLatest: false };
}

export function decideTranscriptScrollFollowAfterAtBottomStateChange({
  isAtBottom,
  mode,
}: {
  isAtBottom: boolean;
  mode: TranscriptScrollFollowMode;
}): TranscriptScrollFollowDecision {
  if (mode === "auto_follow" && isAtBottom) {
    return { mode, shouldScrollToLatest: true };
  }
  return { mode, shouldScrollToLatest: false };
}

export function transcriptAtAutoFollowBottom({
  lastVisibleIndex,
  metrics,
  rowCount,
}: TranscriptScrollFollowBottomInput) {
  if (rowCount <= 0) {
    return true;
  }
  if (metrics.distanceFromBottom <= strictBottomDistancePx) {
    return true;
  }
  return lastVisibleIndex >= rowCount - 1 && metrics.distanceFromBottom <= virtualBottomDistancePx;
}

export function transcriptAtStrictBottom(metrics: TranscriptScrollMetrics) {
  return metrics.distanceFromBottom <= reattachBottomDistancePx;
}

export function transcriptTailRevision({
  activeRun,
  rows,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
}: {
  activeRun: Run | null;
  rows: TranscriptRenderRow[];
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
}) {
  const tailRows = rows.slice(-tailRevisionRowCount);
  return [
    `rows:${rows.length}:${rows.at(-1)?.key ?? ""}`,
    `active:${activeRunRevisionPart(activeRun)}`,
    `tail:${tailRows.map(transcriptRenderRowRevisionPart).join("|")}`,
    `outputs:${runItemOutputsRevisionPart(runItemOutputIdsByRunItemId, runItemOutputsById)}`,
    `outputPages:${runItemOutputPagesRevisionPart(runItemOutputPagesByRunItemId)}`,
  ].join("\n");
}

function activeRunRevisionPart(run: Run | null) {
  if (run === null) {
    return "none";
  }
  return [
    run.id,
    run.status,
    run.completedAt,
    run.error,
    approvalRevisionPart(run.pendingApproval),
  ].join(":");
}

function approvalRevisionPart(approval: Run["pendingApproval"]) {
  if (approval === null) {
    return "none";
  }
  return (
    JSON.stringify([
      approval.id,
      approval.runItemId,
      approval.providerItemId,
      approval.kind,
      approval.status,
      approval.title,
      approval.body,
      approval.command,
      approval.filePath,
      approval.permission,
      approval.question,
      approval.options,
      approval.questions.map(approvalQuestionRevisionPart),
      structuredInputRevisionPart(approval.structuredInput),
    ]) ?? ""
  );
}

function approvalQuestionRevisionPart(question: ApprovalQuestion) {
  return [
    question.id,
    question.header,
    question.question,
    question.options,
    question.isOther,
    question.isSecret,
  ];
}

function structuredInputRevisionPart(input: StructuredInputRequest | null) {
  if (input === null) {
    return null;
  }
  return [
    input.providerRequestId,
    input.threadId,
    input.turnId,
    input.serverName,
    input.mode,
    input.message,
    input.schema,
    input.url,
    input.elicitationId,
    input.meta,
  ];
}

function transcriptRenderRowRevisionPart(row: TranscriptRenderRow) {
  switch (row.kind) {
    case "activity-group":
      return [
        row.key,
        row.kind,
        row.expanded ? "expanded" : "collapsed",
        row.group.id,
        row.group.memberBlockIds.join(","),
        row.members.map(transcriptBlockRevisionPart).join(","),
      ].join(":");
    case "activity-item":
      return [row.key, row.kind, row.group.id, transcriptBlockRevisionPart(row.block)].join(":");
    case "block":
      return [
        row.key,
        row.kind,
        row.showTimestamp ? "timestamp" : "no-timestamp",
        transcriptBlockRevisionPart(row.block),
      ].join(":");
    case "message":
      return [
        row.key,
        row.kind,
        row.showTimestamp ? "timestamp" : "no-timestamp",
        chatMessageRevisionPart(row.message),
      ].join(":");
    case "queued":
      return [row.key, row.kind, chatMessageRevisionPart(row.message)].join(":");
  }
}

function transcriptBlockRevisionPart(block: TranscriptBlock) {
  return [
    block.id,
    block.kind,
    block.ordinal,
    block.status,
    block.updatedAt,
    assistantTextRevisionPart(block.assistantText),
    userMessageRevisionPart(block.userMessage),
    reasoningRevisionPart(block.reasoning),
    activityRevisionPart(block.activity),
    runStatusRevisionPart(block.runStatus),
    backgroundTerminalRevisionPart(block.backgroundTerminal),
  ].join(":");
}

function assistantTextRevisionPart(assistantText: TranscriptBlock["assistantText"]) {
  return assistantText?.text.length ?? 0;
}

function userMessageRevisionPart(userMessage: TranscriptBlock["userMessage"]) {
  return userMessage ? messagePartsRevisionPart(userMessage.parts) : "";
}

function reasoningRevisionPart(reasoning: TranscriptBlock["reasoning"]) {
  return [reasoning?.headline ?? "", reasoning?.summary.length ?? 0].join(":");
}

function activityRevisionPart(activity: TranscriptBlock["activity"]) {
  if (!activity) {
    return ":::no-output";
  }
  return [
    activity.sourceRunItemId,
    activity.status,
    activity.title,
    activity.hasOutput ? "output" : "no-output",
  ].join(":");
}

function runStatusRevisionPart(runStatus: TranscriptBlock["runStatus"]) {
  return [runStatus?.mode ?? "", runStatus?.label ?? "", runStatus?.error ?? ""].join(":");
}

function backgroundTerminalRevisionPart(backgroundTerminal: TranscriptBlock["backgroundTerminal"]) {
  return [backgroundTerminal?.processId ?? "", backgroundTerminal?.label ?? ""].join(":");
}

function chatMessageRevisionPart(message: ChatMessage) {
  return [
    message.id,
    message.role,
    message.delivery,
    message.ordinal,
    message.status,
    message.updatedAt,
    messagePartsRevisionPart(message.parts),
  ].join(":");
}

function messagePartsRevisionPart(parts: MessagePart[]) {
  return parts.map(messagePartRevisionPart).join(",");
}

function messagePartRevisionPart(part: MessagePart) {
  switch (part.type) {
    case "text":
      return textMessagePartRevisionPart(part);
    case "image":
      return imageMessagePartRevisionPart(part);
  }
  return `${part.id}:${part.type}`;
}

function textMessagePartRevisionPart(part: MessagePart) {
  return `${part.id}:text:${part.text?.text.length ?? 0}:${part.text?.format ?? ""}`;
}

function imageMessagePartRevisionPart(part: MessagePart) {
  return [
    part.id,
    "image",
    part.image?.attachmentId ?? "",
    part.image?.fileName ?? "",
    part.image?.variants.length ?? 0,
  ].join(":");
}

function runItemOutputsRevisionPart(
  runItemOutputIdsByRunItemId: Record<string, string[]>,
  runItemOutputsById: Record<string, RunItemOutput>,
) {
  return Object.entries(runItemOutputIdsByRunItemId)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([runItemId, outputIds]) => {
      const lastOutputID = outputIds.at(-1) ?? "";
      const lastOutput = runItemOutputsById[lastOutputID];
      return [
        runItemId,
        outputIds.length,
        lastOutput?.id ?? "",
        lastOutput?.ordinal ?? 0,
        lastOutput?.text.length ?? 0,
      ].join(":");
    })
    .join("|");
}

function runItemOutputPagesRevisionPart(
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>,
) {
  return Object.entries(runItemOutputPagesByRunItemId)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([runItemId, page]) =>
      [
        runItemId,
        page.loading ? "loading" : "idle",
        page.hasMore ? "more" : "done",
        page.error ?? "",
      ].join(":"),
    )
    .join("|");
}
