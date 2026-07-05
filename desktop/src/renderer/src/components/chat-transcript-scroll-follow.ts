import type { KeyboardEvent, PointerEvent, RefObject, UIEvent, WheelEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ListRange, VirtuosoHandle } from "react-virtuoso";

export type TranscriptScrollFollowMode = "auto_follow" | "user_detached";

export interface ChatTranscriptScrollDebugSnapshot {
  awayFromBottom: boolean;
  atBottom: boolean;
  clientHeight: number;
  distanceFromBottom: number;
  hasScrollableOverflow: boolean;
  lastVisibleIndex: number;
  mode: TranscriptScrollFollowMode;
  programmaticScrollCount: number;
  pendingScrollCount: number;
  rowCount: number;
  scrollHeight: number;
  scrollTop: number;
  tailRevision: string;
  trace: ChatTranscriptScrollDebugTraceEntry[];
}

export interface ChatTranscriptScrollDebugTraceEntry {
  [key: string]: boolean | number | string | null;
  awayFromBottom: boolean;
  at: number;
  atBottom: boolean;
  clientHeight: number;
  distanceFromBottom: number;
  event: string;
  hasScrollableOverflow: boolean;
  lastVisibleIndex: number;
  mode: TranscriptScrollFollowMode;
  programmaticScrollCount: number;
  pendingScrollCount: number;
  rowCount: number;
  scrollHeight: number;
  scrollTop: number;
  seq: number;
  tailRevision: string;
}

export type ScrollToIndexLocation = Parameters<VirtuosoHandle["scrollToIndex"]>[0];

export interface TranscriptScrollMetrics {
  clientHeight: number;
  distanceFromBottom: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface TranscriptScrollGeometry extends TranscriptScrollMetrics {
  atBottom: boolean;
  awayFromBottom: boolean;
  hasScrollableOverflow: boolean;
}

export interface TranscriptScrollFollowDecision {
  mode: TranscriptScrollFollowMode;
  shouldScrollToLatest: boolean;
}

interface TranscriptScrollFollowScrollDecisionInput {
  geometry: TranscriptScrollGeometry;
  keyboardScrollIntent: boolean;
  mode: TranscriptScrollFollowMode;
  pointerScrollIntent: boolean;
  previousScrollTop: number;
  programmaticScrollActive: boolean;
  tailScrollIntent: boolean;
  wheelScrollIntent: boolean;
}

interface TranscriptScrollFollowInput {
  conversationKey: string;
  rowCount: number;
  tailRevision: string;
  virtuosoRef: RefObject<VirtuosoHandle | null>;
}

const bottomEpsilonPx = 16;
const autoFollowSettleFrameLimit = 3;
const scrollDirectionThresholdPx = 1;
const scrollbarPointerIntentEdgePx = 24;
const transcriptScrollDebugTextLength = 160;
const transcriptScrollDebugTraceLimit = 30;

export function useTranscriptScrollFollow({
  conversationKey,
  rowCount,
  tailRevision,
  virtuosoRef,
}: TranscriptScrollFollowInput) {
  const [mode, setModeState] = useState<TranscriptScrollFollowMode>("auto_follow");
  const [canJumpToLatest, setCanJumpToLatest] = useState(false);
  const autoScrollFrameRef = useRef<number | null>(null);
  const conversationKeyRef = useRef(conversationKey);
  const keyboardScrollIntentRef = useRef(false);
  const modeRef = useRef<TranscriptScrollFollowMode>("auto_follow");
  const pendingScrollCountRef = useRef(0);
  const programmaticScrollSettleFrameRef = useRef<number | null>(null);
  const programmaticScrollCountRef = useRef(0);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const pointerScrollIntentRef = useRef(false);
  const rowCountRef = useRef(rowCount);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const scrollGenerationRef = useRef(0);
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
  const geometryRef = useRef<TranscriptScrollGeometry>(
    classifyTranscriptScrollGeometry(metricsRef.current),
  );
  const traceRef = useRef<ChatTranscriptScrollDebugTraceEntry[]>([]);
  const traceSeqRef = useRef(0);
  const [debugSnapshot, setDebugSnapshot] = useState<ChatTranscriptScrollDebugSnapshot>(() => ({
    awayFromBottom: false,
    atBottom: true,
    clientHeight: 0,
    distanceFromBottom: 0,
    hasScrollableOverflow: false,
    lastVisibleIndex: rowCount - 1,
    mode: "auto_follow",
    pendingScrollCount: 0,
    programmaticScrollCount: 0,
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
    keyboardScrollIntentRef.current = false;
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
    geometryRef.current = classifyTranscriptScrollGeometry(metricsRef.current);
    setCanJumpToLatest(transcriptScrollCanJumpToLatest(modeRef.current, geometryRef.current));
  }, []);

  const updateMetricsFromScroller = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      updateMetricsFromElement(scroller);
    }
  }, [updateMetricsFromElement]);

  const readDebugSnapshot = useCallback(
    (): ChatTranscriptScrollDebugSnapshot => ({
      awayFromBottom: geometryRef.current.awayFromBottom,
      atBottom: geometryRef.current.atBottom,
      clientHeight: metricsRef.current.clientHeight,
      distanceFromBottom: metricsRef.current.distanceFromBottom,
      hasScrollableOverflow: geometryRef.current.hasScrollableOverflow,
      lastVisibleIndex: visibleEndIndexRef.current,
      mode: modeRef.current,
      pendingScrollCount: pendingScrollCountRef.current,
      programmaticScrollCount: programmaticScrollCountRef.current,
      rowCount: rowCountRef.current,
      scrollHeight: metricsRef.current.scrollHeight,
      scrollTop: metricsRef.current.scrollTop,
      tailRevision: truncateTranscriptScrollDebugText(tailRevisionRef.current),
      trace: traceRef.current,
    }),
    [],
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
        awayFromBottom: geometryRef.current.awayFromBottom,
        at: Math.round(performance.now()),
        atBottom: geometryRef.current.atBottom,
        clientHeight: metricsRef.current.clientHeight,
        distanceFromBottom: metricsRef.current.distanceFromBottom,
        event,
        hasScrollableOverflow: geometryRef.current.hasScrollableOverflow,
        lastVisibleIndex: visibleEndIndexRef.current,
        mode: modeRef.current,
        pendingScrollCount: pendingScrollCountRef.current,
        programmaticScrollCount: programmaticScrollCountRef.current,
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
    [readDebugSnapshot],
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
      setCanJumpToLatest(transcriptScrollCanJumpToLatest(next, geometryRef.current));
      recordDebugTrace("mode_change", { nextMode: next, previousMode: previous, reason });
    },
    [
      cancelAutoScrollToLatest,
      clearDirectionalScrollIntent,
      recordDebugTrace,
      refreshDebugSnapshot,
    ],
  );

  const invalidateScheduledScrollWork = useCallback(
    (reason: string) => {
      scrollGenerationRef.current += 1;
      cancelAutoScrollToLatest();
      recordDebugTrace("scroll_generation_invalidated", {
        generation: scrollGenerationRef.current,
        reason,
      });
      return scrollGenerationRef.current;
    },
    [cancelAutoScrollToLatest, recordDebugTrace],
  );

  const detachForHistoryScrollIntent = useCallback(
    (reason: string) => {
      invalidateScheduledScrollWork(reason);
      setMode("user_detached", reason);
    },
    [invalidateScheduledScrollWork, setMode],
  );

  const scrollToLatest = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [virtuosoRef]);

  const runProgrammaticScroll = useCallback(
    (
      scroll: () => void,
      reason: string,
      settleFrames = 2,
      generation = scrollGenerationRef.current,
    ) => {
      programmaticScrollCountRef.current += 1;
      recordDebugTrace("programmatic_scroll_started", { generation, reason });
      if (generation !== scrollGenerationRef.current) {
        programmaticScrollCountRef.current = Math.max(0, programmaticScrollCountRef.current - 1);
        recordDebugTrace("programmatic_scroll_skipped", { generation, reason: "stale" });
        return;
      }
      scroll();
      const finish = (remainingFrames: number) => {
        requestAnimationFrame(() => {
          if (remainingFrames > 1) {
            finish(remainingFrames - 1);
            return;
          }
          programmaticScrollCountRef.current = Math.max(0, programmaticScrollCountRef.current - 1);
          if (generation !== scrollGenerationRef.current) {
            updateMetricsFromScroller();
            recordDebugTrace("programmatic_scroll_skipped", { generation, reason: "stale_finish" });
            return;
          }
          updateMetricsFromScroller();
          recordDebugTrace("programmatic_scroll_finished", { generation, reason });
        });
      };
      finish(settleFrames);
    },
    [recordDebugTrace, updateMetricsFromScroller],
  );

  const scheduleAutoScrollToLatest = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      recordDebugTrace("auto_scroll_already_pending");
      return;
    }
    const generation = scrollGenerationRef.current;
    pendingScrollCountRef.current = autoFollowSettleFrameLimit;
    recordDebugTrace("auto_scroll_scheduled", { generation });
    const runFrame = (remainingFrames: number) => {
      pendingScrollCountRef.current = remainingFrames;
      autoScrollFrameRef.current = requestAnimationFrame(() => {
        autoScrollFrameRef.current = null;
        if (generation !== scrollGenerationRef.current) {
          pendingScrollCountRef.current = 0;
          recordDebugTrace("auto_scroll_skipped", { generation, reason: "stale" });
          return;
        }
        if (modeRef.current !== "auto_follow") {
          pendingScrollCountRef.current = 0;
          recordDebugTrace("auto_scroll_skipped", {
            generation,
            reason: "mode_not_auto_follow",
          });
          return;
        }
        runProgrammaticScroll(scrollToLatest, "auto_follow", 1, generation);
        recordDebugTrace("auto_scroll_to_latest", { generation, remainingFrames });
        requestAnimationFrame(() => {
          if (generation !== scrollGenerationRef.current) {
            pendingScrollCountRef.current = 0;
            recordDebugTrace("auto_scroll_skipped", { generation, reason: "stale_settle" });
            return;
          }
          updateMetricsFromScroller();
          if (
            modeRef.current === "auto_follow" &&
            geometryRef.current.awayFromBottom &&
            remainingFrames > 1
          ) {
            runFrame(remainingFrames - 1);
            return;
          }
          pendingScrollCountRef.current = 0;
          recordDebugTrace("auto_scroll_completed", {
            atBottom: geometryRef.current.atBottom,
            generation,
            remainingFrames,
          });
        });
      });
    };
    runFrame(autoFollowSettleFrameLimit);
  }, [recordDebugTrace, runProgrammaticScroll, scrollToLatest, updateMetricsFromScroller]);

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

  const finishProgrammaticScroll = useCallback(
    (generation: number) => {
      if (programmaticScrollSettleFrameRef.current !== null) {
        cancelAnimationFrame(programmaticScrollSettleFrameRef.current);
      }
      programmaticScrollCountRef.current += 1;
      programmaticScrollSettleFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollSettleFrameRef.current = requestAnimationFrame(() => {
          programmaticScrollSettleFrameRef.current = null;
          programmaticScrollCountRef.current = Math.max(0, programmaticScrollCountRef.current - 1);
          if (generation !== scrollGenerationRef.current) {
            updateMetricsFromScroller();
            recordDebugTrace("programmatic_scroll_finished", {
              generation,
              result: "stale",
            });
            return;
          }
          updateMetricsFromScroller();
          if (geometryRef.current.atBottom) {
            recordDebugTrace("programmatic_scroll_finished", { generation, result: "at_bottom" });
            setMode("auto_follow", "programmatic_scroll_finished");
            scheduleAutoScrollToLatest();
          } else {
            recordDebugTrace("programmatic_scroll_finished", {
              generation,
              result: "not_at_bottom",
            });
            setMode("user_detached", "programmatic_scroll_finished");
          }
        });
      });
    },
    [recordDebugTrace, scheduleAutoScrollToLatest, setMode, updateMetricsFromScroller],
  );

  const scrollToIndexAsProgrammaticScroll = useCallback(
    (location: ScrollToIndexLocation) => {
      clearDirectionalScrollIntent();
      const generation = invalidateScheduledScrollWork("programmatic_scroll_start");
      recordDebugTrace("programmatic_scroll_start", { generation });
      if (programmaticScrollFrameRef.current !== null) {
        cancelAnimationFrame(programmaticScrollFrameRef.current);
      }
      programmaticScrollFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollFrameRef.current = null;
        if (generation !== scrollGenerationRef.current) {
          recordDebugTrace("programmatic_scroll_skipped", { generation, reason: "stale_frame" });
          return;
        }
        virtuosoRef.current?.scrollToIndex(location);
        finishProgrammaticScroll(generation);
      });
    },
    [
      clearDirectionalScrollIntent,
      finishProgrammaticScroll,
      invalidateScheduledScrollWork,
      recordDebugTrace,
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
      const keyboardScrollIntent = keyboardScrollIntentRef.current;
      const tailScrollIntent = tailScrollIntentRef.current;
      const wheelScrollIntent = wheelScrollIntentRef.current;
      const pointerScrollIntent = pointerScrollIntentRef.current;
      const programmaticScrollActive = programmaticScrollCountRef.current > 0;
      keyboardScrollIntentRef.current = false;
      tailScrollIntentRef.current = false;
      wheelScrollIntentRef.current = false;
      updateMetricsFromElement(target);
      const scrollDirection = transcriptScrollDirection(
        metricsRef.current.scrollTop,
        previousScrollTop,
      );
      const historyScrollIntent = transcriptScrollHasHistoryIntent(
        {
          keyboardScrollIntent,
          pointerScrollIntent,
          tailScrollIntent,
          wheelScrollIntent,
        },
        scrollDirection,
      );
      if (historyScrollIntent) {
        invalidateScheduledScrollWork("history_scroll");
      }
      applyDecision(
        "scroll",
        decideTranscriptScrollFollowAfterScroll({
          geometry: geometryRef.current,
          keyboardScrollIntent,
          mode: modeRef.current,
          pointerScrollIntent,
          previousScrollTop,
          programmaticScrollActive,
          tailScrollIntent,
          wheelScrollIntent,
        }),
        {
          keyboardScrollIntent,
          pointerScrollIntent,
          previousScrollTop,
          programmaticScrollActive,
          historyScrollIntent,
          scrollDirection,
          tailScrollIntent,
          wheelScrollIntent,
        },
      );
    },
    [applyDecision, invalidateScheduledScrollWork, updateMetricsFromElement],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY < 0) {
        tailScrollIntentRef.current = false;
        wheelScrollIntentRef.current = true;
        detachForHistoryScrollIntent("wheel_history");
        recordDebugTrace("wheel", { deltaY: event.deltaY, intent: "history" });
      } else if (event.deltaY > 0) {
        wheelScrollIntentRef.current = false;
        tailScrollIntentRef.current = true;
        recordDebugTrace("wheel", { deltaY: event.deltaY, intent: "tail" });
      }
    },
    [detachForHistoryScrollIntent, recordDebugTrace],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      if (
        event.button === 0 &&
        scroller &&
        (event.pointerType === "touch" ||
          event.pointerType === "pen" ||
          event.clientX >= scroller.getBoundingClientRect().right - scrollbarPointerIntentEdgePx)
      ) {
        pointerScrollIntentRef.current = true;
        recordDebugTrace("pointer_scroll_start", {
          clientX: event.clientX,
          pointerType: event.pointerType,
        });
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
      keyboardScrollIntentRef.current = false;
      if (
        ["ArrowUp", "Home", "PageUp"].includes(event.key) ||
        (event.key === " " && event.shiftKey)
      ) {
        tailScrollIntentRef.current = false;
        wheelScrollIntentRef.current = false;
        keyboardScrollIntentRef.current = true;
        detachForHistoryScrollIntent("keyboard_history");
        recordDebugTrace("key", { intent: "history", key: event.key, shiftKey: event.shiftKey });
      } else if (["ArrowDown", "End", "PageDown"].includes(event.key) || event.key === " ") {
        wheelScrollIntentRef.current = false;
        tailScrollIntentRef.current = true;
        keyboardScrollIntentRef.current = true;
        recordDebugTrace("key", { intent: "tail", key: event.key, shiftKey: event.shiftKey });
      }
    },
    [detachForHistoryScrollIntent, recordDebugTrace],
  );

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      visibleEndIndexRef.current = range.endIndex;
      applyDecision(
        "range",
        decideTranscriptScrollFollowAfterRangeChanged({
          geometry: geometryRef.current,
          mode: modeRef.current,
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
          geometry: geometryRef.current,
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
    applyDecision(
      "content_changed",
      decideTranscriptScrollFollowAfterRangeChanged({
        geometry: geometryRef.current,
        mode: modeRef.current,
      }),
    );
  }, [applyDecision, recordDebugTrace, updateMetricsFromScroller]);

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
    invalidateScheduledScrollWork("detach");
    recordDebugTrace("detach");
    setMode("user_detached", "detach");
  }, [clearDirectionalScrollIntent, invalidateScheduledScrollWork, recordDebugTrace, setMode]);

  const jumpToLatest = useCallback(() => {
    clearScrollIntent();
    const generation = invalidateScheduledScrollWork("jump_to_latest");
    recordDebugTrace("jump_to_latest");
    setMode("auto_follow", "jump_to_latest");
    runProgrammaticScroll(scrollToLatest, "jump_to_latest", 1, generation);
    scheduleAutoScrollToLatest();
  }, [
    clearScrollIntent,
    invalidateScheduledScrollWork,
    recordDebugTrace,
    runProgrammaticScroll,
    scheduleAutoScrollToLatest,
    scrollToLatest,
    setMode,
  ]);

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
    if (conversationKeyRef.current === conversationKey) {
      return;
    }
    conversationKeyRef.current = conversationKey;
    clearScrollIntent();
    invalidateScheduledScrollWork("conversation_changed");
    programmaticScrollCountRef.current = 0;
    updateMetricsFromScroller();
    setMode("auto_follow", "conversation_changed");
    recordDebugTrace("conversation_changed");
    scheduleAutoScrollToLatest();
  }, [
    clearScrollIntent,
    conversationKey,
    invalidateScheduledScrollWork,
    recordDebugTrace,
    scheduleAutoScrollToLatest,
    setMode,
    updateMetricsFromScroller,
  ]);

  useEffect(() => {
    const api = {
      detach,
      getSnapshot: getDebugSnapshot,
      jumpToLatest,
      scrollToIndexAsProgrammaticScroll,
    };
    window.__settaChatTranscriptScrollDebug = api;
    return () => {
      if (window.__settaChatTranscriptScrollDebug === api) {
        delete window.__settaChatTranscriptScrollDebug;
      }
    };
  }, [detach, getDebugSnapshot, jumpToLatest, scrollToIndexAsProgrammaticScroll]);

  useEffect(
    () => () => {
      for (const frame of [
        autoScrollFrameRef.current,
        programmaticScrollSettleFrameRef.current,
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
    canJumpToLatest,
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
    scrollToIndexAsProgrammaticScroll,
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
    "data-scroll-follow-away-from-bottom": String(snapshot.awayFromBottom),
    "data-scroll-follow-client-height": String(Math.round(snapshot.clientHeight)),
    "data-scroll-follow-distance-from-bottom": String(Math.round(snapshot.distanceFromBottom)),
    "data-scroll-follow-has-scrollable-overflow": String(snapshot.hasScrollableOverflow),
    "data-scroll-follow-last-visible-index": String(snapshot.lastVisibleIndex),
    "data-scroll-follow-mode": snapshot.mode,
    "data-scroll-follow-pending-scroll-count": String(snapshot.pendingScrollCount),
    "data-scroll-follow-programmatic-scroll-count": String(snapshot.programmaticScrollCount),
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
  geometry,
  keyboardScrollIntent,
  mode,
  pointerScrollIntent,
  previousScrollTop,
  programmaticScrollActive,
  tailScrollIntent,
  wheelScrollIntent,
}: TranscriptScrollFollowScrollDecisionInput): TranscriptScrollFollowDecision {
  if (!geometry.hasScrollableOverflow) {
    return { mode: "auto_follow", shouldScrollToLatest: false };
  }
  const userScrollIntent = transcriptScrollHasUserIntent({
    keyboardScrollIntent,
    pointerScrollIntent,
    tailScrollIntent,
    wheelScrollIntent,
  });
  const scrollDirection = transcriptScrollDirection(geometry.scrollTop, previousScrollTop);
  if (
    transcriptScrollHasHistoryIntent(
      { keyboardScrollIntent, pointerScrollIntent, tailScrollIntent, wheelScrollIntent },
      scrollDirection,
    )
  ) {
    return { mode: "user_detached", shouldScrollToLatest: false };
  }
  if (geometry.atBottom) {
    return transcriptScrollAtBottomDecision({ mode, programmaticScrollActive, userScrollIntent });
  }
  if (mode === "auto_follow") {
    if (
      shouldDetachTranscriptAutoFollow({
        geometry,
        keyboardScrollIntent,
        scrollDirection,
        userScrollIntent,
        wheelScrollIntent,
      })
    ) {
      return { mode: "user_detached", shouldScrollToLatest: false };
    }
    return { mode, shouldScrollToLatest: userScrollIntent || programmaticScrollActive };
  }
  return { mode, shouldScrollToLatest: false };
}

function transcriptScrollAtBottomDecision({
  mode,
  programmaticScrollActive,
  userScrollIntent,
}: Pick<TranscriptScrollFollowScrollDecisionInput, "mode" | "programmaticScrollActive"> & {
  userScrollIntent: boolean;
}): TranscriptScrollFollowDecision {
  return {
    mode: userScrollIntent || mode === "auto_follow" ? "auto_follow" : mode,
    shouldScrollToLatest: userScrollIntent || programmaticScrollActive,
  };
}

function transcriptScrollHasUserIntent({
  keyboardScrollIntent,
  pointerScrollIntent,
  tailScrollIntent,
  wheelScrollIntent,
}: Pick<
  TranscriptScrollFollowScrollDecisionInput,
  "keyboardScrollIntent" | "pointerScrollIntent" | "tailScrollIntent" | "wheelScrollIntent"
>) {
  return keyboardScrollIntent || pointerScrollIntent || tailScrollIntent || wheelScrollIntent;
}

function transcriptScrollHasHistoryIntent(
  {
    keyboardScrollIntent,
    pointerScrollIntent,
    tailScrollIntent,
    wheelScrollIntent,
  }: Pick<
    TranscriptScrollFollowScrollDecisionInput,
    "keyboardScrollIntent" | "pointerScrollIntent" | "tailScrollIntent" | "wheelScrollIntent"
  >,
  scrollDirection: TranscriptScrollDirection,
) {
  return (
    wheelScrollIntent ||
    (keyboardScrollIntent && !tailScrollIntent) ||
    (pointerScrollIntent && scrollDirection === "history")
  );
}

function shouldDetachTranscriptAutoFollow({
  geometry,
  keyboardScrollIntent,
  scrollDirection,
  userScrollIntent,
  wheelScrollIntent,
}: Pick<
  TranscriptScrollFollowScrollDecisionInput,
  "geometry" | "keyboardScrollIntent" | "wheelScrollIntent"
> & {
  scrollDirection: TranscriptScrollDirection;
  userScrollIntent: boolean;
}) {
  if (!userScrollIntent || !geometry.awayFromBottom) {
    return false;
  }
  return scrollDirection === "history" || wheelScrollIntent || keyboardScrollIntent;
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

export function decideTranscriptScrollFollowAfterRangeChanged({
  geometry,
  mode,
}: {
  geometry: TranscriptScrollGeometry;
  mode: TranscriptScrollFollowMode;
}): TranscriptScrollFollowDecision {
  if (!geometry.hasScrollableOverflow) {
    return { mode: "auto_follow", shouldScrollToLatest: false };
  }
  return { mode, shouldScrollToLatest: false };
}

export function decideTranscriptScrollFollowAfterAtBottomStateChange({
  geometry,
  isAtBottom,
  mode,
}: {
  geometry: TranscriptScrollGeometry;
  isAtBottom: boolean;
  mode: TranscriptScrollFollowMode;
}): TranscriptScrollFollowDecision {
  if (!geometry.hasScrollableOverflow) {
    return { mode: "auto_follow", shouldScrollToLatest: false };
  }
  void isAtBottom;
  return { mode, shouldScrollToLatest: false };
}

export function classifyTranscriptScrollGeometry(
  metrics: TranscriptScrollMetrics,
): TranscriptScrollGeometry {
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const distanceFromBottom = Math.max(0, maxScrollTop - metrics.scrollTop);
  const hasScrollableOverflow = maxScrollTop > bottomEpsilonPx;
  const atBottom = !hasScrollableOverflow || distanceFromBottom <= bottomEpsilonPx;
  return {
    ...metrics,
    distanceFromBottom: hasScrollableOverflow ? distanceFromBottom : 0,
    atBottom,
    awayFromBottom: hasScrollableOverflow && !atBottom,
    hasScrollableOverflow,
  };
}

export function transcriptScrollCanJumpToLatest(
  mode: TranscriptScrollFollowMode,
  geometry: TranscriptScrollGeometry,
) {
  return mode === "user_detached" && geometry.hasScrollableOverflow && geometry.awayFromBottom;
}
