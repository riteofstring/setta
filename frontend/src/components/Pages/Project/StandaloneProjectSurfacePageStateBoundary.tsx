import {
  standaloneSectionRequiresManagedChat,
  standaloneWindowSpaceHasAllowedWindows,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import {
  memo,
  type ComponentProps,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { WindowSpaceConfig } from "utils/generatedTypes";
import { StandaloneProjectSurfacePageBoundary } from "./StandaloneProjectSurfacePageBoundary";
import {
  type StandaloneSurfaceErrorCode,
  type StandaloneSurfaceTarget,
} from "./StandaloneProjectSurfaceRouteBoundary";

function normalizeStandaloneChatId(
  chatId: string | null | undefined,
): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
}

function buildStandaloneProjectChatPath(
  projectConfigName: string,
  chatId: string | null,
): string {
  const basePath = `/${encodeURIComponent(projectConfigName)}/chat`;
  if (chatId === null) {
    return basePath;
  }
  return `${basePath}/${encodeURIComponent(chatId)}`;
}

function resolveStandaloneDocumentTitle(
  projectConfigName: string | undefined,
  target: StandaloneSurfaceTarget,
  is404: boolean,
  projectChatThreadTitle: string | null,
): string {
  if (is404) {
    return "Not Found";
  }
  if (!projectConfigName) {
    return "setta.dev";
  }
  if (target.kind === "project_chat") {
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "project_chat_thread") {
    if (projectChatThreadTitle) {
      return `${projectConfigName} · ${projectChatThreadTitle}`;
    }
    return `${projectConfigName} Chat`;
  }
  if (target.kind === "project_chat_thread_not_found") {
    return `${projectConfigName} · Thread Not Found`;
  }
  if (target.kind === "section") {
    return `${projectConfigName} · ${target.sectionName}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigName} · ${target.windowSpaceName}`;
  }
  if (target.kind === "window_space_not_found") {
    return `${projectConfigName} · Window Space Not Found`;
  }
  return `${projectConfigName} · Section Not Found`;
}

function normalizeStandaloneSurfaceErrorCode(
  errorCode: string | null,
): StandaloneSurfaceErrorCode | null {
  if (errorCode === "chat_not_found" || errorCode === "llm_disallowed") {
    return errorCode;
  }
  return null;
}

function buildStandaloneSurfaceOwnerKey(
  projectConfigId: string,
  target: StandaloneSurfaceTarget,
): string | null {
  if (target.kind === "project_chat") {
    return `${projectConfigId}:project-chat`;
  }
  if (target.kind === "project_chat_thread") {
    return `${projectConfigId}:project-chat:${target.chatId}`;
  }
  if (target.kind === "section") {
    return `${projectConfigId}:section:${target.sectionId}`;
  }
  if (target.kind === "window_space") {
    return `${projectConfigId}:window-space:${target.windowSpaceId}`;
  }
  return null;
}

type StandaloneProjectSurfacePageStateBoundaryProps = Omit<
  ComponentProps<typeof StandaloneProjectSurfacePageBoundary>,
  | "projectChatThreadTitle"
  | "shouldBlockStandaloneManagedChat"
  | "standaloneProjectChatId"
  | "standaloneProjectChatThreadRouteInvalid"
  | "standaloneProjectChatThreadMissing"
  | "setStandaloneProjectChatId"
  | "onProjectChatBlockedErrorCodeChange"
> & {
  projectConfigName: string | undefined;
  projectChatHistoryEntries: Array<{
    chatId: string;
    label: string;
  }>;
  navigate: (path: string) => void;
};

type StandaloneSurfaceErrorState = {
  ownerKey: string | null;
  errorCode: StandaloneSurfaceErrorCode | null;
};

function resolveStandaloneProjectChatThreadTitle({
  target,
  projectChatHistoryEntries,
}: {
  target: StandaloneSurfaceTarget;
  projectChatHistoryEntries: Array<{
    chatId: string;
    label: string;
  }>;
}): string | null {
  if (target.kind !== "project_chat_thread") {
    return null;
  }

  const matchingHistoryEntry =
    projectChatHistoryEntries.find((entry) => entry.chatId === target.chatId) ??
    null;
  if (matchingHistoryEntry) {
    return matchingHistoryEntry.label;
  }
  return `Chat ${target.chatId.slice(0, 8)}`;
}

function resolveShouldBlockStandaloneManagedChat({
  target,
  standaloneWindowSpace,
  managedChatAuthorityState,
  canUseManagedChat,
  standaloneManagedChatDenied,
}: {
  target: StandaloneSurfaceTarget;
  standaloneWindowSpace: WindowSpaceConfig | null;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  canUseManagedChat: boolean;
  standaloneManagedChatDenied: boolean;
}): boolean {
  const standaloneTargetRequiresManagedChat =
    target.kind === "project_chat" || target.kind === "project_chat_thread"
      ? true
      : target.kind === "section"
        ? standaloneSectionRequiresManagedChat(
            managedChatAuthorityState,
            target.sectionId,
          )
        : false;

  const standaloneWindowSpaceHasVisibleWindows =
    target.kind === "window_space" && standaloneWindowSpace
      ? standaloneWindowSpaceHasAllowedWindows(
          standaloneWindowSpace,
          managedChatAuthorityState,
          canUseManagedChat,
        )
      : false;

  return target.kind === "window_space"
    ? !canUseManagedChat &&
        Object.keys(standaloneWindowSpace?.windowsById ?? {}).length > 0 &&
        !standaloneWindowSpaceHasVisibleWindows
    : (!canUseManagedChat && standaloneTargetRequiresManagedChat) ||
        standaloneManagedChatDenied;
}

function _StandaloneProjectSurfacePageStateBoundary({
  doneLoading,
  is404,
  projectConfigName,
  projectConfigId,
  target,
  standaloneWindowSpace,
  managedChatAuthorityState,
  canUseManagedChat,
  projectChatHistoryEntries,
  navigate,
  renderDictArea,
}: StandaloneProjectSurfacePageStateBoundaryProps) {
  const projectChatThreadTitle = resolveStandaloneProjectChatThreadTitle({
    target,
    projectChatHistoryEntries,
  });
  const standaloneSurfaceOwnerKey = buildStandaloneSurfaceOwnerKey(
    projectConfigId,
    target,
  );
  const [standaloneSurfaceErrorState, setStandaloneSurfaceErrorState] =
    useState<StandaloneSurfaceErrorState>({
      ownerKey: null,
      errorCode: null,
    });
  const previousCanUseManagedChat = useRef(canUseManagedChat);
  const standaloneProjectChatId =
    target.kind === "project_chat_thread" ? target.chatId : null;
  const standaloneProjectChatThreadRouteInvalid =
    target.kind === "project_chat_thread_not_found";
  const standaloneProjectChatThreadMissing =
    target.kind === "project_chat_thread" &&
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "chat_not_found";
  const standaloneManagedChatDenied =
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "llm_disallowed";
  const shouldBlockStandaloneManagedChat =
    resolveShouldBlockStandaloneManagedChat({
      target,
      standaloneWindowSpace,
      managedChatAuthorityState,
      canUseManagedChat,
      standaloneManagedChatDenied,
    });

  const setStandaloneSurfaceErrorCode = (errorCode: string | null) => {
    const normalizedErrorCode = normalizeStandaloneSurfaceErrorCode(errorCode);
    setStandaloneSurfaceErrorState((current) => {
      if (
        current.ownerKey === standaloneSurfaceOwnerKey &&
        current.errorCode === normalizedErrorCode
      ) {
        return current;
      }
      return {
        ownerKey: standaloneSurfaceOwnerKey,
        errorCode: normalizedErrorCode,
      };
    });
  };

  useEffect(() => {
    setStandaloneSurfaceErrorState((current) => {
      if (current.ownerKey === standaloneSurfaceOwnerKey) {
        return current;
      }
      return {
        ownerKey: standaloneSurfaceOwnerKey,
        errorCode: null,
      };
    });
  }, [standaloneSurfaceOwnerKey]);

  useEffect(() => {
    if (!previousCanUseManagedChat.current && canUseManagedChat) {
      setStandaloneSurfaceErrorState((current) => {
        if (current.errorCode !== "llm_disallowed") {
          return current;
        }
        return {
          ownerKey: standaloneSurfaceOwnerKey,
          errorCode: null,
        };
      });
    }
    previousCanUseManagedChat.current = canUseManagedChat;
  }, [canUseManagedChat, standaloneSurfaceOwnerKey]);

  useEffect(() => {
    document.title = resolveStandaloneDocumentTitle(
      projectConfigName,
      target,
      is404,
      standaloneProjectChatThreadMissing
        ? "Thread Not Found"
        : projectChatThreadTitle,
    );
  }, [
    is404,
    projectConfigName,
    projectChatThreadTitle,
    standaloneProjectChatThreadMissing,
    target,
  ]);

  const setStandaloneProjectChatId = (
    next: SetStateAction<string | null | undefined>,
  ) => {
    if (!projectConfigName) {
      return;
    }
    const resolvedChatId =
      typeof next === "function"
        ? next(standaloneProjectChatId ?? undefined)
        : next;
    navigate(
      buildStandaloneProjectChatPath(
        projectConfigName,
        normalizeStandaloneChatId(resolvedChatId),
      ),
    );
  };

  return (
    <StandaloneProjectSurfacePageBoundary
      doneLoading={doneLoading}
      is404={is404}
      shouldBlockStandaloneManagedChat={shouldBlockStandaloneManagedChat}
      projectConfigId={projectConfigId}
      target={target}
      standaloneWindowSpace={standaloneWindowSpace}
      managedChatAuthorityState={managedChatAuthorityState}
      canUseManagedChat={canUseManagedChat}
      projectChatThreadTitle={projectChatThreadTitle}
      standaloneProjectChatId={standaloneProjectChatId}
      standaloneProjectChatThreadRouteInvalid={
        standaloneProjectChatThreadRouteInvalid
      }
      standaloneProjectChatThreadMissing={standaloneProjectChatThreadMissing}
      renderDictArea={renderDictArea}
      setStandaloneProjectChatId={setStandaloneProjectChatId}
      onProjectChatBlockedErrorCodeChange={setStandaloneSurfaceErrorCode}
    />
  );
}

export const StandaloneProjectSurfacePageStateBoundary = memo(
  _StandaloneProjectSurfacePageStateBoundary,
);
