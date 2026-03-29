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

export function formatElapsedDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function resolveDurationLabel({
  elapsedMs: _elapsedMs,
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

export function formatChatTimestamp(timestampMs: number | null): string | null {
  const resolvedTimestampMs = resolveTimestampMs(timestampMs);
  if (resolvedTimestampMs === null) {
    return null;
  }
  return CHAT_TIMESTAMP_FORMATTER.format(resolvedTimestampMs);
}

export function formatChatTimestampTitle(
  timestampMs: number | null,
): string | null {
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

const RUN_TIMER_STORAGE_KEY_PREFIX = "setta.chat.runTimer.v1";
const RUN_TIMER_MEMORY_FALLBACK = new Map<string, string>();
const RUN_TIMER_STORAGE_PROBE_KEY = `${RUN_TIMER_STORAGE_KEY_PREFIX}.__probe__`;
let cachedRunTimerStorageAdapter: RunTimerStorageAdapter | null | undefined;

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
    const nextRunKey = runKey ?? null;
    localStartMsRef.current = null;
    finalizedEndMsRef.current = null;
    hasBeenActiveRef.current = false;
    storageAvailableRef.current = getRunTimerStorageAdapter() !== null;
    if (storageAvailableRef.current && nextRunKey) {
      const persisted = readRunTimerSnapshot(nextRunKey);
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
