import { useCallback, useEffect, useRef, useState } from "react";
import { type BaseChatMessageUnion } from "utils/generatedTypes";

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

function formatElapsedDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function resolveDurationLabel({
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

export function resolveMessageCreatedAtMs(
  message: BaseChatMessageUnion,
): number | null {
  return resolveTimestampMs((message as { createdAt?: unknown }).createdAt);
}

export function resolveActivityTimestampMs(
  startedAtMs: number | null,
  completedAtMs: number | null,
): number | null {
  return resolveTimestampMs(startedAtMs) ?? resolveTimestampMs(completedAtMs);
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

type RunTimerStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type RunTimerSnapshot = {
  startMs: number | null;
  endMs: number | null;
  hasBeenActive: boolean;
};

type RunElapsedDuration = {
  elapsedSeconds: number;
  elapsedMs: number;
  hasKnownDuration: boolean;
};

const RUN_TIMER_STORAGE_KEY_PREFIX = "setta.chat.runTimer.v1";
const RUN_TIMER_MEMORY_FALLBACK = new Map<string, string>();
const RUN_TIMER_STORAGE_PROBE_KEY = `${RUN_TIMER_STORAGE_KEY_PREFIX}.__probe__`;
let cachedRunTimerStorageAdapter: RunTimerStorageAdapter | null | undefined;
const UNKNOWN_RUN_DURATION: RunElapsedDuration = {
  elapsedSeconds: 0,
  elapsedMs: 0,
  hasKnownDuration: false,
};
const ZERO_KNOWN_RUN_DURATION: RunElapsedDuration = {
  elapsedSeconds: 0,
  elapsedMs: 0,
  hasKnownDuration: true,
};

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

function normalizeRunTimerMs(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function resolveRunTimerStartMs({
  active,
  localStartMs,
  startedAtMs,
}: {
  active: boolean;
  localStartMs: number | null;
  startedAtMs: number | null;
}): number | null {
  return startedAtMs ?? localStartMs ?? (active ? Date.now() : null);
}

function resolveRunElapsedDuration({
  active,
  completedAtMs,
  finalizedEndMs,
  hasBeenActive,
  localStartMs,
  runKey,
  startedAtMs,
}: {
  active: boolean;
  completedAtMs: number | null;
  finalizedEndMs: number | null;
  hasBeenActive: boolean;
  localStartMs: number | null;
  runKey?: string;
  startedAtMs: number | null;
}): RunElapsedDuration {
  if (!runKey) {
    return UNKNOWN_RUN_DURATION;
  }
  const startMs = resolveRunTimerStartMs({
    active,
    localStartMs,
    startedAtMs,
  });
  if (startMs === null) {
    return UNKNOWN_RUN_DURATION;
  }
  if (active) {
    const elapsedMs = Math.max(0, Date.now() - startMs);
    return {
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      elapsedMs,
      hasKnownDuration: true,
    };
  }
  const endMs = completedAtMs ?? finalizedEndMs;
  if (endMs === null) {
    return hasBeenActive ? ZERO_KNOWN_RUN_DURATION : UNKNOWN_RUN_DURATION;
  }
  const elapsedMs = Math.max(0, endMs - startMs);
  return {
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    elapsedMs,
    hasKnownDuration: true,
  };
}

function restoreRunTimerState({
  runKey,
  setStorageAvailable,
  setState,
}: {
  runKey?: string;
  setStorageAvailable: (available: boolean) => void;
  setState: (snapshot: RunTimerSnapshot) => void;
}): void {
  const storageAvailable = getRunTimerStorageAdapter() !== null;
  setStorageAvailable(storageAvailable);
  if (!storageAvailable || !runKey) {
    setState({ startMs: null, endMs: null, hasBeenActive: false });
    return;
  }
  setState(
    readRunTimerSnapshot(runKey) ?? {
      startMs: null,
      endMs: null,
      hasBeenActive: false,
    },
  );
}

function maybeUpdateRunTimerStart({
  currentStartMs,
  startedAtMs,
  setState,
}: {
  currentStartMs: number | null;
  startedAtMs: number | null;
  setState: (snapshot: Partial<RunTimerSnapshot>) => void;
}): boolean {
  if (startedAtMs === null) {
    return false;
  }
  if (currentStartMs !== null && startedAtMs >= currentStartMs) {
    return false;
  }
  setState({ startMs: startedAtMs });
  return true;
}

function beginActiveRun({
  currentStartMs,
  onTick,
  startedAtMs,
  setState,
}: {
  currentStartMs: number | null;
  onTick: () => void;
  startedAtMs: number | null;
  setState: (snapshot: Partial<RunTimerSnapshot>) => void;
}): number {
  setState({
    startMs: currentStartMs ?? startedAtMs ?? Date.now(),
    endMs: null,
    hasBeenActive: true,
  });
  return window.setInterval(() => {
    onTick();
  }, 1000);
}

function finishInactiveRun({
  completedAtMs,
  finalizedEndMs,
  hasBeenActive,
  setState,
}: {
  completedAtMs: number | null;
  finalizedEndMs: number | null;
  hasBeenActive: boolean;
  setState: (snapshot: Partial<RunTimerSnapshot>) => void;
}): void {
  if (completedAtMs !== null) {
    setState({ endMs: completedAtMs });
    return;
  }
  if (hasBeenActive && finalizedEndMs === null) {
    setState({ endMs: Date.now() });
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
}): RunElapsedDuration {
  const [, setTick] = useState(0);
  const localStartMsRef = useRef<number | null>(null);
  const finalizedEndMsRef = useRef<number | null>(null);
  const hasBeenActiveRef = useRef(false);
  const storageAvailableRef = useRef<boolean>(
    getRunTimerStorageAdapter() !== null,
  );
  const setRunTimerState = useCallback(
    (snapshot: Partial<RunTimerSnapshot> | RunTimerSnapshot) => {
      if ("startMs" in snapshot) {
        localStartMsRef.current = snapshot.startMs;
      }
      if ("endMs" in snapshot) {
        finalizedEndMsRef.current = snapshot.endMs;
      }
      if ("hasBeenActive" in snapshot) {
        hasBeenActiveRef.current = snapshot.hasBeenActive;
      }
    },
    [],
  );
  const bumpTick = useCallback(() => {
    setTick((current) => current + 1);
  }, []);

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
    restoreRunTimerState({
      runKey,
      setStorageAvailable: (available) => {
        storageAvailableRef.current = available;
      },
      setState: setRunTimerState,
    });
    bumpTick();
  }, [bumpTick, runKey, setRunTimerState]);

  useEffect(() => {
    if (
      !maybeUpdateRunTimerStart({
        currentStartMs: localStartMsRef.current,
        startedAtMs: normalizeRunTimerMs(startedAtMs),
        setState: setRunTimerState,
      })
    ) {
      return;
    }
    persistSnapshot();
    bumpTick();
  }, [bumpTick, persistSnapshot, setRunTimerState, startedAtMs]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = beginActiveRun({
      currentStartMs: localStartMsRef.current,
      onTick: bumpTick,
      startedAtMs: normalizeRunTimerMs(startedAtMs),
      setState: setRunTimerState,
    });
    persistSnapshot();
    bumpTick();
    return () => window.clearInterval(timer);
  }, [active, bumpTick, persistSnapshot, setRunTimerState, startedAtMs]);

  useEffect(() => {
    if (active) {
      return;
    }
    const previousEndMs = finalizedEndMsRef.current;
    finishInactiveRun({
      completedAtMs: normalizeRunTimerMs(completedAtMs),
      finalizedEndMs: previousEndMs,
      hasBeenActive: hasBeenActiveRef.current,
      setState: setRunTimerState,
    });
    if (finalizedEndMsRef.current === previousEndMs) {
      return;
    }
    persistSnapshot();
    bumpTick();
  }, [active, bumpTick, completedAtMs, persistSnapshot, setRunTimerState]);

  return resolveRunElapsedDuration({
    active,
    completedAtMs: normalizeRunTimerMs(completedAtMs),
    finalizedEndMs: finalizedEndMsRef.current,
    hasBeenActive: hasBeenActiveRef.current,
    localStartMs: localStartMsRef.current,
    runKey,
    startedAtMs: normalizeRunTimerMs(startedAtMs),
  });
}
