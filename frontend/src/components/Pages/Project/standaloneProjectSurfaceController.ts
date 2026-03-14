import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import {
  buildStandaloneProjectChatPath,
  normalizeStandaloneChatId,
  normalizeStandaloneSurfaceErrorCode,
} from "./standaloneProjectSurfaceRouting";
import { type StandaloneSurfaceErrorState } from "./standaloneProjectSurfaceViewModel";

export function applyStandaloneSurfaceErrorCode({
  current,
  ownerKey,
  errorCode,
}: {
  current: StandaloneSurfaceErrorState;
  ownerKey: string | null;
  errorCode: string | null;
}): StandaloneSurfaceErrorState {
  const normalizedErrorCode = normalizeStandaloneSurfaceErrorCode(errorCode);
  if (
    current.ownerKey === ownerKey &&
    current.errorCode === normalizedErrorCode
  ) {
    return current;
  }
  return {
    ownerKey,
    errorCode: normalizedErrorCode,
  };
}

export function syncStandaloneSurfaceErrorOwner({
  current,
  ownerKey,
}: {
  current: StandaloneSurfaceErrorState;
  ownerKey: string | null;
}): StandaloneSurfaceErrorState {
  if (current.ownerKey === ownerKey) {
    return current;
  }
  return {
    ownerKey,
    errorCode: null,
  };
}

export function clearStandaloneLlmDeniedSurfaceError({
  current,
  ownerKey,
}: {
  current: StandaloneSurfaceErrorState;
  ownerKey: string | null;
}): StandaloneSurfaceErrorState {
  if (current.errorCode !== "llm_disallowed") {
    return current;
  }
  return {
    ownerKey,
    errorCode: null,
  };
}

export function resolveStandaloneProjectChatNavigationPath({
  projectConfigName,
  standaloneProjectChatId,
  next,
}: {
  projectConfigName: string | undefined;
  standaloneProjectChatId: string | null;
  next: SetStateAction<string | null | undefined>;
}): string | null {
  if (!projectConfigName) {
    return null;
  }
  const resolvedChatId =
    typeof next === "function"
      ? next(standaloneProjectChatId ?? undefined)
      : next;
  return buildStandaloneProjectChatPath(
    projectConfigName,
    normalizeStandaloneChatId(resolvedChatId),
  );
}

export function useStandaloneProjectSurfaceController({
  projectConfigName,
  doneLoading,
  is404,
  canUseManagedChat,
  standaloneSurfaceOwnerKey,
  standaloneProjectChatId,
  navigate,
}: {
  projectConfigName: string | undefined;
  doneLoading: boolean;
  is404: boolean;
  canUseManagedChat: boolean;
  standaloneSurfaceOwnerKey: string | null;
  standaloneProjectChatId: string | null;
  navigate: NavigateFunction;
}) {
  const [standaloneSurfaceErrorState, setStandaloneSurfaceErrorState] =
    useState<StandaloneSurfaceErrorState>({
      ownerKey: null,
      errorCode: null,
    });
  const previousCanUseManagedChat = useRef(canUseManagedChat);

  const setStandaloneSurfaceErrorCode = (errorCode: string | null) => {
    setStandaloneSurfaceErrorState((current) =>
      applyStandaloneSurfaceErrorCode({
        current,
        ownerKey: standaloneSurfaceOwnerKey,
        errorCode,
      }),
    );
  };

  useEffect(() => {
    setStandaloneSurfaceErrorState((current) =>
      syncStandaloneSurfaceErrorOwner({
        current,
        ownerKey: standaloneSurfaceOwnerKey,
      }),
    );
  }, [standaloneSurfaceOwnerKey]);

  useEffect(() => {
    if (!previousCanUseManagedChat.current && canUseManagedChat) {
      setStandaloneSurfaceErrorState((current) =>
        clearStandaloneLlmDeniedSurfaceError({
          current,
          ownerKey: standaloneSurfaceOwnerKey,
        }),
      );
    }
    previousCanUseManagedChat.current = canUseManagedChat;
  }, [canUseManagedChat, standaloneSurfaceOwnerKey]);

  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(doneLoading && !is404);

  const setStandaloneProjectChatId = (
    next: SetStateAction<string | null | undefined>,
  ) => {
    const nextPath = resolveStandaloneProjectChatNavigationPath({
      projectConfigName,
      standaloneProjectChatId,
      next,
    });
    if (!nextPath) {
      return;
    }
    navigate(nextPath);
  };

  return {
    standaloneSurfaceErrorState,
    setStandaloneSurfaceErrorCode,
    setStandaloneProjectChatId,
  };
}
