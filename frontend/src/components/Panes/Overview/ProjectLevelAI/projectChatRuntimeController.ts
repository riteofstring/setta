import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import { useAIStore } from "state/definitions";
import { type ProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import {
  buildProjectChatHydrationCacheKey,
  clearProjectChatHydrationCacheEntriesForChat,
  getProjectChatBlockedReasonMessage,
  hydrateProjectChatFromRuntime,
  resolveProjectChatHydrationRetryDecision,
  shouldSkipProjectChatHydration,
  touchProjectChatHydrationRetryEntry,
  trimProjectChatHydrationCache,
  type ProjectChatBlockedErrorCode,
  type ProjectChatHydrationRetryEntry,
} from "./projectChatRuntimeUtils";

export function resolveProjectChatHydrationControllerCacheKey({
  projectConfigId,
  chatId,
  hydrationAuthority,
  hydrationMetadataRevision,
}: {
  projectConfigId: string;
  chatId: string;
  hydrationAuthority: Pick<
    ProjectChatHydrationAuthority,
    "blockedErrorCode" | "hydrationRunType"
  >;
  hydrationMetadataRevision: string;
}): string | null {
  const shouldProbeMissingProvenance =
    hydrationAuthority.blockedErrorCode === "chat_provenance_missing";
  if (
    hydrationAuthority.hydrationRunType === null &&
    !shouldProbeMissingProvenance
  ) {
    return null;
  }
  if (shouldProbeMissingProvenance) {
    return `${projectConfigId}:${chatId}:chat_provenance_probe:${hydrationMetadataRevision}`;
  }
  return buildProjectChatHydrationCacheKey({
    projectConfigId,
    chatId,
    hydrationRunType: hydrationAuthority.hydrationRunType,
    hydrationMetadataRevision,
  });
}

export function clearProjectChatHydrationRetryTimer({
  cache,
  cacheKey,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  cacheKey: string;
}) {
  const state = cache[cacheKey];
  if (!state || state.timerId === null) {
    return;
  }
  globalThis.clearTimeout(state.timerId);
  state.timerId = null;
  if (state.status === "retry_scheduled") {
    state.status = "failed";
  }
  touchProjectChatHydrationRetryEntry(state);
}

export function useProjectChatRuntimeController({
  chatId,
  projectConfigId,
  hydrationAuthority,
  hydrationMetadataRevision,
  waitingForResponse,
  pendingPrompt,
  setDraftMessage,
  agentRunsInitialLoadComplete,
  onBlockedErrorCodeChange,
}: {
  chatId: string | null | undefined;
  projectConfigId: string;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  waitingForResponse: boolean;
  pendingPrompt: string | null;
  setDraftMessage: (
    nextDraft: string | ((currentDraft: string) => string),
  ) => void;
  agentRunsInitialLoadComplete: boolean;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
}) {
  const [hydrationBlockedErrorCode, setHydrationBlockedErrorCode] =
    useState<ProjectChatBlockedErrorCode | null>(null);
  const lastChatIdRef = useRef<string | null>(null);
  const hydrationStatusByKeyRef = useRef<
    Record<string, ProjectChatHydrationRetryEntry>
  >({});
  const blockedErrorCode =
    hydrationBlockedErrorCode ?? hydrationAuthority.blockedErrorCode;
  const blockedReason = useMemo(
    () =>
      blockedErrorCode
        ? getProjectChatBlockedReasonMessage(blockedErrorCode)
        : null,
    [blockedErrorCode],
  );

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  useEffect(() => {
    if (typeof chatId === "string") {
      lastChatIdRef.current = chatId;
    }
  }, [chatId]);

  useEffect(() => {
    setHydrationBlockedErrorCode(null);
  }, [
    chatId,
    hydrationAuthority.hydrationRunType,
    hydrationMetadataRevision,
    projectConfigId,
  ]);

  useEffect(() => {
    onBlockedErrorCodeChange?.(blockedErrorCode);
  }, [blockedErrorCode, onBlockedErrorCodeChange]);

  const clearHydrationRetryTimer = useCallback((cacheKey: string) => {
    clearProjectChatHydrationRetryTimer({
      cache: hydrationStatusByKeyRef.current,
      cacheKey,
    });
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
    if (!pendingPrompt) {
      return;
    }
    setDraftMessage((currentDraft) =>
      currentDraft.trim() ? currentDraft : pendingPrompt,
    );
    useAIStore.setState({ pendingProjectChatPrompt: null });
  }, [pendingPrompt, setDraftMessage]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (hydrationAuthority.status !== "ready") {
      return;
    }
    if (waitingForResponse) {
      return;
    }
    const cacheKey = resolveProjectChatHydrationControllerCacheKey({
      projectConfigId,
      chatId,
      hydrationAuthority,
      hydrationMetadataRevision,
    });
    if (!cacheKey) {
      return;
    }
    const shouldProbeMissingProvenance =
      hydrationAuthority.blockedErrorCode === "chat_provenance_missing";
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
      touchProjectChatHydrationRetryEntry(retryState);
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
      touchProjectChatHydrationRetryEntry(state);
      state.status = "in_flight";
      const hydrationOutcome = await hydrateProjectChatFromRuntime({
        chatId,
        projectConfigId,
        hydrationRunType: hydrationAuthority.hydrationRunType,
        shouldProbeMissingProvenance,
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
        touchProjectChatHydrationRetryEntry(state);
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
        touchProjectChatHydrationRetryEntry(state);
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
        touchProjectChatHydrationRetryEntry(state);
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      state.status = "retry_scheduled";
      touchProjectChatHydrationRetryEntry(state);
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
        touchProjectChatHydrationRetryEntry(retryStateForKey);
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
        touchProjectChatHydrationRetryEntry(state);
      }
    };
  }, [
    chatId,
    clearHydrationRetryTimer,
    hydrationAuthority,
    hydrationMetadataRevision,
    projectConfigId,
    waitingForResponse,
  ]);

  return {
    blockedReason,
    lastChatIdRef,
  };
}
