import { useCallback, useEffect, useRef, useState } from "react";
import { type ProjectChatBlockedErrorCode } from "./projectChatExecutionSettings";
import { type ProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import {
  buildProjectChatHydrationCacheKey,
  clearProjectChatHydrationCacheEntriesForChat,
  hydrateProjectChatFromRuntime,
  resolveProjectChatHydrationRetryDecision,
  shouldSkipProjectChatHydration,
  touchProjectChatHydrationCacheEntry,
  trimProjectChatHydrationCache,
  type ProjectChatHydrationRetryEntry,
} from "./projectChatHydrationRuntime";

type UseProjectChatCoreHydrationSessionArgs = {
  chatId: string | null | undefined;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  projectConfigId: string;
  waitingForResponse: boolean;
};

// Owns selected-thread hydration retry state, timers, and blocked-code orchestration for ProjectChatCore.
export function useProjectChatCoreHydrationSession({
  chatId,
  hydrationAuthority,
  hydrationMetadataRevision,
  projectConfigId,
  waitingForResponse,
}: UseProjectChatCoreHydrationSessionArgs) {
  const [hydrationBlockedErrorCode, setHydrationBlockedErrorCode] =
    useState<ProjectChatBlockedErrorCode | null>(null);
  const hydrationStatusByKeyRef = useRef<
    Record<string, ProjectChatHydrationRetryEntry>
  >({});
  const hydrationRunType = hydrationAuthority.hydrationRunType;

  const clearHydrationRetryTimer = useCallback((cacheKey: string) => {
    const state = hydrationStatusByKeyRef.current[cacheKey];
    if (!state || state.timerId === null) {
      return;
    }
    globalThis.clearTimeout(state.timerId);
    state.timerId = null;
    if (state.status === "retry_scheduled") {
      state.status = "failed";
    }
    touchProjectChatHydrationCacheEntry(
      hydrationStatusByKeyRef.current,
      cacheKey,
    );
  }, []);

  const clearAllHydrationRetryTimers = useCallback(() => {
    for (const cacheKey of Object.keys(hydrationStatusByKeyRef.current)) {
      clearHydrationRetryTimer(cacheKey);
    }
  }, [clearHydrationRetryTimer]);

  useEffect(() => {
    return () => {
      clearAllHydrationRetryTimers();
    };
  }, [clearAllHydrationRetryTimers]);

  useEffect(() => {
    setHydrationBlockedErrorCode(null);
  }, [chatId, hydrationMetadataRevision, hydrationRunType, projectConfigId]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (hydrationAuthority.status !== "ready") {
      return;
    }
    if (hydrationRunType === null) {
      return;
    }
    const cacheKey = buildProjectChatHydrationCacheKey({
      projectConfigId,
      chatId,
      hydrationRunType,
      hydrationMetadataRevision,
    });
    if (!cacheKey) {
      return;
    }
    const staleCacheKeys = clearProjectChatHydrationCacheEntriesForChat({
      cache: hydrationStatusByKeyRef.current,
      projectConfigId,
      chatId,
      keepCacheKey: cacheKey,
    });
    for (const staleCacheKey of staleCacheKeys) {
      clearHydrationRetryTimer(staleCacheKey);
      delete hydrationStatusByKeyRef.current[staleCacheKey];
    }
    const retryState = hydrationStatusByKeyRef.current[cacheKey];
    if (retryState) {
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
    }
    if (
      shouldSkipProjectChatHydration(
        retryState
          ? {
              status: retryState.status,
              hasLiveRetryTimer: retryState.timerId !== null,
            }
          : null,
      )
    ) {
      return;
    }
    if (retryState && retryState.status === "retry_scheduled") {
      retryState.status = "failed";
    }
    let cancelled = false;

    const hydrateChat = async () => {
      const state =
        hydrationStatusByKeyRef.current[cacheKey] ??
        (hydrationStatusByKeyRef.current[cacheKey] = {
          status: "failed",
          timerId: null,
          attempt: 0,
          lastTouchedAt: Date.now(),
        });
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
      state.status = "in_flight";
      const hydrationOutcome = await hydrateProjectChatFromRuntime({
        chatId,
        projectConfigId,
        hydrationRunType,
      });
      if (cancelled) {
        return;
      }
      const retryDecision = resolveProjectChatHydrationRetryDecision({
        outcomeType: hydrationOutcome.outcome,
        attempt: state.attempt,
      });
      if (retryDecision.type === "success") {
        setHydrationBlockedErrorCode(null);
        state.status = "succeeded";
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
        clearHydrationRetryTimer(cacheKey);
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      if (retryDecision.type === "terminal_failure") {
        setHydrationBlockedErrorCode(hydrationOutcome.errorCode);
        clearHydrationRetryTimer(cacheKey);
        state.status = "terminal_failure";
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      setHydrationBlockedErrorCode(null);
      clearHydrationRetryTimer(cacheKey);
      state.attempt = retryDecision.nextAttempt;
      if (retryDecision.type === "transient_exhausted") {
        state.status = "failed";
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      state.status = "retry_scheduled";
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
      state.timerId = globalThis.setTimeout(() => {
        if (cancelled) {
          return;
        }
        const retryStateForKey = hydrationStatusByKeyRef.current[cacheKey];
        if (!retryStateForKey) {
          return;
        }
        retryStateForKey.timerId = null;
        retryStateForKey.status = "failed";
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
        void hydrateChat();
      }, retryDecision.delayMs);
    };

    void hydrateChat();
    return () => {
      cancelled = true;
      clearHydrationRetryTimer(cacheKey);
      const state = hydrationStatusByKeyRef.current[cacheKey];
      if (state?.status === "in_flight") {
        state.status = "failed";
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
      }
    };
  }, [
    chatId,
    clearHydrationRetryTimer,
    hydrationAuthority.status,
    hydrationMetadataRevision,
    hydrationRunType,
    projectConfigId,
    waitingForResponse,
  ]);

  return {
    blockedErrorCode:
      hydrationBlockedErrorCode ?? hydrationAuthority.blockedErrorCode,
  };
}
