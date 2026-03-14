import {
  standaloneSectionRequiresManagedChat,
  standaloneWindowSpaceHasAllowedWindows,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import { type WindowSpaceConfig } from "utils/generatedTypes";
import {
  type StandaloneSurfaceErrorCode,
  type StandaloneSurfaceTarget,
} from "./standaloneProjectSurfaceRouting";

type StandaloneProjectChatHistoryEntry = {
  chatId: string;
  label: string;
};

export type StandaloneSurfaceErrorState = {
  ownerKey: string | null;
  errorCode: StandaloneSurfaceErrorCode | null;
};

export function buildStandaloneManagedChatAuthorityState({
  sections,
  sectionVariants,
  sectionImpls,
  sectionVariantMap,
}: {
  sections: ManagedChatSurfaceAuthorityState["sections"];
  sectionVariants: ManagedChatSurfaceAuthorityState["sectionVariants"];
  sectionImpls: ManagedChatSurfaceAuthorityState["sectionImpls"];
  sectionVariantMap: ManagedChatSurfaceAuthorityState["projectConfig"]["sectionVariantMap"];
}): ManagedChatSurfaceAuthorityState {
  return {
    projectConfig: {
      sectionVariantMap,
    },
    sections,
    sectionVariants,
    sectionImpls,
  };
}

export function resolveStandaloneProjectChatThreadTitle({
  target,
  projectChatHistoryEntries,
}: {
  target: StandaloneSurfaceTarget;
  projectChatHistoryEntries: Array<StandaloneProjectChatHistoryEntry>;
}): string | null {
  if (target.kind !== "project_chat_thread") {
    return null;
  }
  const standaloneProjectChatThreadEntry =
    projectChatHistoryEntries.find((entry) => entry.chatId === target.chatId) ??
    null;
  return (
    standaloneProjectChatThreadEntry?.label ??
    `Chat ${target.chatId.slice(0, 8)}`
  );
}

export function resolveStandaloneManagedChatGuardState({
  target,
  standaloneSurfaceErrorState,
  standaloneSurfaceOwnerKey,
  managedChatAuthorityState,
  standaloneWindowSpace,
  canUseManagedChat,
}: {
  target: StandaloneSurfaceTarget;
  standaloneSurfaceErrorState: StandaloneSurfaceErrorState;
  standaloneSurfaceOwnerKey: string | null;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  standaloneWindowSpace: WindowSpaceConfig | null;
  canUseManagedChat: boolean;
}) {
  const standaloneProjectChatId =
    target.kind === "project_chat_thread" ? target.chatId : null;
  const standaloneProjectChatThreadRouteInvalid =
    target.kind === "project_chat_thread_not_found";
  const standaloneProjectChatThreadMissing =
    target.kind === "project_chat_thread" &&
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "chat_not_found";
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
  const standaloneManagedChatDenied =
    standaloneSurfaceErrorState.ownerKey === standaloneSurfaceOwnerKey &&
    standaloneSurfaceErrorState.errorCode === "llm_disallowed";
  const shouldBlockStandaloneManagedChat =
    target.kind === "window_space"
      ? !canUseManagedChat &&
        Object.keys(standaloneWindowSpace?.windowsById ?? {}).length > 0 &&
        !standaloneWindowSpaceHasVisibleWindows
      : (!canUseManagedChat && standaloneTargetRequiresManagedChat) ||
        standaloneManagedChatDenied;

  return {
    standaloneProjectChatId,
    standaloneProjectChatThreadRouteInvalid,
    standaloneProjectChatThreadMissing,
    standaloneTargetRequiresManagedChat,
    standaloneWindowSpaceHasVisibleWindows,
    standaloneManagedChatDenied,
    shouldBlockStandaloneManagedChat,
  };
}
