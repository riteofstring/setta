import {
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
  type ChatHydrationOutcome,
  type ChatHydrationOutcomeType,
} from "state/actions/aiHydration";
import type { ChatRunType } from "state/actions/chatHistoryTypes";

export function buildProjectChatHydrationCacheKey({
  projectConfigId,
  chatId,
  hydrationRunType,
  hydrationMetadataRevision,
}: {
  projectConfigId: string;
  chatId: string | null | undefined;
  hydrationRunType: ChatRunType | null;
  hydrationMetadataRevision: string;
}): string | null {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedProjectConfigId || !normalizedChatId || !hydrationRunType) {
    return null;
  }
  const normalizedRevision = hydrationMetadataRevision.trim();
  if (!normalizedRevision) {
    return null;
  }
  return `${normalizedProjectConfigId}:${normalizedChatId}:${hydrationRunType}:${normalizedRevision}`;
}

export async function hydrateProjectChatFromRuntime({
  chatId,
  projectConfigId,
  hydrationRunType,
}: {
  chatId: string;
  projectConfigId: string;
  hydrationRunType: ChatRunType | null;
}): Promise<ChatHydrationOutcome> {
  if (hydrationRunType === "external_agent") {
    return getExternalAgentChatHydrationOutcome(chatId, projectConfigId);
  }
  return getLLMChatHydrationOutcome(chatId);
}

export type ProjectChatHydrationRetryStatus =
  | "in_flight"
  | "succeeded"
  | "failed"
  | "retry_scheduled"
  | "terminal_failure";

export type ProjectChatHydrationRetryEntry = {
  status: ProjectChatHydrationRetryStatus;
  timerId: ReturnType<typeof setTimeout> | null;
  attempt: number;
  lastTouchedAt: number;
};

const PROJECT_CHAT_HYDRATION_RETRY_BASE_DELAY_MS = 1000;
const PROJECT_CHAT_HYDRATION_RETRY_MAX_DELAY_MS = 30000;
export const PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS = 6;
const PROJECT_CHAT_HYDRATION_MAX_CACHE_ENTRIES = 300;

type ProjectChatHydrationRetryDecision =
  | { type: "success" }
  | { type: "terminal_failure" }
  | {
      type: "transient_retry";
      nextAttempt: number;
      delayMs: number;
    }
  | {
      type: "transient_exhausted";
      nextAttempt: number;
    };

export function resolveProjectChatHydrationRetryDelayMs(
  attempt: number,
): number {
  const normalizedAttempt = Math.max(1, attempt);
  const exponentialDelayMs =
    PROJECT_CHAT_HYDRATION_RETRY_BASE_DELAY_MS * 2 ** (normalizedAttempt - 1);
  return Math.min(
    PROJECT_CHAT_HYDRATION_RETRY_MAX_DELAY_MS,
    exponentialDelayMs,
  );
}

export function resolveProjectChatHydrationRetryDecision({
  outcomeType,
  attempt,
}: {
  outcomeType: ChatHydrationOutcomeType;
  attempt: number;
}): ProjectChatHydrationRetryDecision {
  if (outcomeType === "success") {
    return { type: "success" };
  }
  if (outcomeType === "terminal_failure") {
    return { type: "terminal_failure" };
  }
  const nextAttempt = attempt + 1;
  if (nextAttempt > PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS) {
    return {
      type: "transient_exhausted",
      nextAttempt,
    };
  }
  return {
    type: "transient_retry",
    nextAttempt,
    delayMs: resolveProjectChatHydrationRetryDelayMs(nextAttempt),
  };
}

export function shouldSkipProjectChatHydration(
  state: {
    status: ProjectChatHydrationRetryStatus;
    hasLiveRetryTimer: boolean;
  } | null,
): boolean {
  if (!state) {
    return false;
  }
  if (state.status === "in_flight" || state.status === "succeeded") {
    return true;
  }
  if (state.status === "terminal_failure") {
    return true;
  }
  return state.status === "retry_scheduled" && state.hasLiveRetryTimer;
}

function buildProjectChatHydrationRouteKeyPrefix({
  projectConfigId,
  chatId,
}: {
  projectConfigId: string;
  chatId: string;
}): string | null {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedChatId = chatId.trim();
  if (!normalizedProjectConfigId || !normalizedChatId) {
    return null;
  }
  return `${normalizedProjectConfigId}:${normalizedChatId}:`;
}

export function clearProjectChatHydrationCacheEntriesForChat({
  cache,
  projectConfigId,
  chatId,
  keepCacheKey,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  projectConfigId: string;
  chatId: string;
  keepCacheKey: string | null;
}): string[] {
  const keyPrefix = buildProjectChatHydrationRouteKeyPrefix({
    projectConfigId,
    chatId,
  });
  if (!keyPrefix) {
    return [];
  }
  const removedCacheKeys: string[] = [];
  for (const cacheKey of Object.keys(cache)) {
    if (!cacheKey.startsWith(keyPrefix)) {
      continue;
    }
    if (keepCacheKey !== null && cacheKey === keepCacheKey) {
      continue;
    }
    removedCacheKeys.push(cacheKey);
  }
  return removedCacheKeys;
}

function touchProjectChatHydrationRetryEntry(
  entry: ProjectChatHydrationRetryEntry,
): void {
  entry.lastTouchedAt = Date.now();
}

export function trimProjectChatHydrationCache({
  cache,
  maxEntries = PROJECT_CHAT_HYDRATION_MAX_CACHE_ENTRIES,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  maxEntries?: number;
}): string[] {
  const cacheKeys = Object.keys(cache);
  if (cacheKeys.length <= maxEntries) {
    return [];
  }
  const removableEntries = cacheKeys
    .filter((cacheKey) => cache[cacheKey]?.timerId === null)
    .sort((leftKey, rightKey) => {
      const leftEntry = cache[leftKey];
      const rightEntry = cache[rightKey];
      const leftLastTouchedAt = leftEntry?.lastTouchedAt ?? 0;
      const rightLastTouchedAt = rightEntry?.lastTouchedAt ?? 0;
      return leftLastTouchedAt - rightLastTouchedAt;
    });
  const overflowCount = cacheKeys.length - maxEntries;
  const removedCacheKeys: string[] = [];
  for (let index = 0; index < removableEntries.length; index += 1) {
    if (removedCacheKeys.length >= overflowCount) {
      break;
    }
    const cacheKey = removableEntries[index];
    if (cache[cacheKey] === undefined) {
      continue;
    }
    delete cache[cacheKey];
    removedCacheKeys.push(cacheKey);
  }
  return removedCacheKeys;
}

export function touchProjectChatHydrationCacheEntry(
  cache: Record<string, ProjectChatHydrationRetryEntry>,
  cacheKey: string,
): void {
  const entry = cache[cacheKey];
  if (!entry) {
    return;
  }
  touchProjectChatHydrationRetryEntry(entry);
}
