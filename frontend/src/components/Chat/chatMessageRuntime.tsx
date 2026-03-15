import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ThoughtPreviewMarkdown } from "./chatMessageContent";

const CHAT_TIMESTAMP_CLASS =
  "shrink-0 text-[10px] font-medium tabular-nums text-setta-400 dark:text-setta-500";
const CHAT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const CHAT_TIMESTAMP_TOOLTIP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long",
});
const COUNT_BADGE_STEP_ANIMATION_MS = 120;
const COUNT_BADGE_STEP_PAUSE_MS = 24;
const SCRAMBLE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SCRAMBLE_UPDATE_INTERVAL_MS = 120;
const SCRAMBLE_REVEAL_DURATION_MS = 220;
const SCRAMBLE_MAX_HOLD_MS = 240;
const ACTIVITY_THOUGHT_TOP_ONLY_MASK =
  "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)";
const THOUGHT_PREVIEW_MARKDOWN_CLASS =
  "prose prose-sm max-w-none text-[9px] leading-[1.35] text-setta-400 dark:prose-invert dark:text-setta-400/90 prose-headings:my-0 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-[10px] prose-h2:text-[9.5px] prose-h3:text-[9px] prose-h4:text-[9px] prose-p:my-0 prose-p:text-[9px] prose-p:leading-[1.35] prose-ul:my-0.5 prose-ol:my-0.5 prose-ul:pl-3.5 prose-ol:pl-3.5 prose-ul:text-[9px] prose-ol:text-[9px] prose-li:my-0 prose-li:text-[9px] prose-li:leading-[1.35] prose-code:before:hidden prose-code:after:hidden prose-code:text-[8px] prose-pre:my-1 prose-pre:px-2 prose-pre:py-1.5 prose-pre:text-[8px] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_li+li]:mt-0.5 [&_*]:break-words";
const THOUGHT_PREVIEW_TAIL_CLASS =
  "whitespace-pre-wrap break-words text-[9px] leading-[1.35] text-setta-400 dark:text-setta-400/90";

type RunTimerStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type RunTimerSnapshot = {
  startMs: number | null;
  endMs: number | null;
  hasBeenActive: boolean;
};

type CountBadgeTransition = {
  from: number;
  to: number;
  direction: 1 | -1;
  animate: boolean;
};

const RUN_TIMER_STORAGE_KEY_PREFIX = "setta.chat.runTimer.v1";
const RUN_TIMER_MEMORY_FALLBACK = new Map<string, string>();
const RUN_TIMER_STORAGE_PROBE_KEY = `${RUN_TIMER_STORAGE_KEY_PREFIX}.__probe__`;
let cachedRunTimerStorageAdapter: RunTimerStorageAdapter | null | undefined;

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
    if (!shouldTrack || delayMs <= 0) {
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

export function resolveDurationLabel({
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

function resolveTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatChatTimestamp(timestampMs: number | null): string | null {
  const resolvedTimestampMs = resolveTimestampMs(timestampMs);
  if (resolvedTimestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_FORMATTER.format(resolvedTimestampMs);
}

function formatChatTimestampTitle(timestampMs: number | null): string | null {
  const resolvedTimestampMs = resolveTimestampMs(timestampMs);
  if (resolvedTimestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_TOOLTIP_FORMATTER.format(resolvedTimestampMs);
}

export function ChatTimestamp({
  timestampMs,
  kind,
}: {
  timestampMs: number | null;
  kind: "message" | "activity-item";
}) {
  const label = formatChatTimestamp(timestampMs);
  if (!label) {
    return null;
  }
  const title = formatChatTimestampTitle(timestampMs) ?? undefined;
  if (kind === "activity-item") {
    return (
      <span
        data-chat-activity-item-timestamp="true"
        className={CHAT_TIMESTAMP_CLASS}
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      data-chat-message-timestamp="true"
      className={CHAT_TIMESTAMP_CLASS}
      title={title}
    >
      {label}
    </span>
  );
}

export function ChatMessageTimestampFooter({
  timestampMs,
}: {
  timestampMs: number | null;
}) {
  if (timestampMs === null) {
    return null;
  }
  return (
    <div className="mt-0.5 flex justify-end">
      <ChatTimestamp timestampMs={timestampMs} kind="message" />
    </div>
  );
}

function sampleScrambleChar(): string {
  const index = Math.floor(Math.random() * SCRAMBLE_CHARSET.length);
  return SCRAMBLE_CHARSET[index] ?? "X";
}

function buildScramblePlaceholder(length: number): string {
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

function buildScrambleRevealText({
  targetText,
  length,
  revealCount,
}: {
  targetText: string;
  length: number;
  revealCount: number;
}): string {
  if (length <= 0) {
    return "";
  }
  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const targetChar = targetText[index];
    if (index < revealCount && targetChar !== undefined) {
      chars.push(targetChar);
      continue;
    }
    if (targetChar === " ") {
      chars.push(" ");
      continue;
    }
    chars.push(sampleScrambleChar());
  }
  return chars.join("");
}

export function useScrambledLabel({
  label,
  scramble,
}: {
  label: string;
  scramble: boolean;
}): string {
  const [displayText, setDisplayText] = useState(label);
  const displayRef = useRef(label);
  const scrambleSeedRef = useRef(label.length > 0 ? label.length : 24);
  const previousScrambleRef = useRef(scramble);

  useEffect(() => {
    displayRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayText(label);
      return;
    }
    let intervalId: number | null = null;
    let frameId: number | null = null;
    let holdTimeoutId: number | null = null;
    if (scramble) {
      scrambleSeedRef.current = Math.max(
        18,
        Math.min(64, displayRef.current.length || label.length || 24),
      );
      const updateScramble = () => {
        setDisplayText(buildScramblePlaceholder(scrambleSeedRef.current));
      };
      updateScramble();
      intervalId = window.setInterval(
        updateScramble,
        SCRAMBLE_UPDATE_INTERVAL_MS,
      );
      holdTimeoutId = window.setTimeout(() => {
        if (!previousScrambleRef.current) {
          return;
        }
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        setDisplayText(label);
      }, SCRAMBLE_MAX_HOLD_MS);
      previousScrambleRef.current = true;
      return () => {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        if (holdTimeoutId !== null) {
          window.clearTimeout(holdTimeoutId);
        }
      };
    }
    const wasScrambling = previousScrambleRef.current;
    previousScrambleRef.current = false;
    if (!wasScrambling) {
      setDisplayText(label);
      return undefined;
    }
    const startText = displayRef.current;
    const startLength = startText.length;
    const targetLength = label.length;
    const startTs = window.performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(
        1,
        (timestamp - startTs) / SCRAMBLE_REVEAL_DURATION_MS,
      );
      const nextLength = Math.max(
        1,
        Math.round(startLength + (targetLength - startLength) * progress),
      );
      const revealCount = Math.floor(targetLength * progress);
      if (progress >= 1) {
        setDisplayText(label);
        return;
      }
      setDisplayText(
        buildScrambleRevealText({
          targetText: label,
          length: nextLength,
          revealCount,
        }),
      );
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (holdTimeoutId !== null) {
        window.clearTimeout(holdTimeoutId);
      }
    };
  }, [label, scramble]);

  return displayText;
}

function normalizeCountBadgeValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

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

export function parseIsoTimestampMs(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

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

export function useRunElapsedDuration({
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
    localStartMsRef.current = null;
    finalizedEndMsRef.current = null;
    hasBeenActiveRef.current = false;
    storageAvailableRef.current = getRunTimerStorageAdapter() !== null;
    if (storageAvailableRef.current && runKey) {
      const persisted = readRunTimerSnapshot(runKey);
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
      const currentMaxScrollTop = Math.max(
        0,
        current.scrollHeight - current.clientHeight,
      );
      if (currentMaxScrollTop <= 0) {
        animatedScrollTopRef.current = 0;
        current.scrollTop = 0;
        pinnedBottomTextRef.current = null;
        setIsPinnedToBottom(false);
        return;
      }
      if (pinnedBottomTextRef.current === text) {
        animatedScrollTopRef.current = currentMaxScrollTop;
        current.scrollTop = currentMaxScrollTop;
        setIsPinnedToBottom(true);
        return;
      }
      const progress = Math.min(
        1,
        Math.max(0, (timestamp - initialTimestamp) / durationMs),
      );
      const nextScrollTop = startScrollTop + distanceToBottomPx * progress;
      if (progress >= 1 || nextScrollTop >= currentMaxScrollTop) {
        animatedScrollTopRef.current = currentMaxScrollTop;
        current.scrollTop = currentMaxScrollTop;
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
      <ThoughtPreviewMarkdown
        text={text}
        animate={animate}
        markdownClassName={THOUGHT_PREVIEW_MARKDOWN_CLASS}
        tailClassName={THOUGHT_PREVIEW_TAIL_CLASS}
      />
    </div>
  );
});
