import { setProjectChatWindowChatId } from "state/actions/projectChatWindowing";
import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import { flushPendingProjectChatWindowingWrites } from "state/actions/projectChatWindowingWrites";
import { useProjectState, useShareSession } from "state/definitions";
import {
  ChatWindowModeEnum,
  SettaNotificationTypeEnum,
  createProjectChatWindowingState,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";

export type RestoredProjectChatThreadBinding = {
  instanceId: string;
  chatId: string | null;
  sectionIdOrNull: string | null;
};

export function getBlockedWindowSpaceRestoreMessage(
  threadBindings: Array<RestoredProjectChatThreadBinding>,
): string | null {
  if (threadBindings.length === 0) {
    return null;
  }
  const shareSession = useShareSession.getState();
  if (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLLM !== false
  ) {
    return null;
  }
  return "Cannot restore this window space because deployment policy disallows restoring saved chat threads.";
}

function resolveProjectChatThreadBindingChatId(
  instance: ProjectChatWindowInstance | undefined,
): string | null {
  if (!instance || instance.mode !== ChatWindowModeEnum.project_ai_mode) {
    return null;
  }
  return instance.chatId ?? null;
}

export function buildWorkspaceRestoreThreadState(
  currentWindowing: ProjectChatWindowingState,
  restoredWindowing: ProjectChatWindowingState,
): {
  layoutWindowing: ProjectChatWindowingState;
  threadBindings: Array<RestoredProjectChatThreadBinding>;
} {
  const threadBindings: Array<RestoredProjectChatThreadBinding> = [];
  const layoutInstancesById: ProjectChatWindowingState["instancesById"] = {};

  for (const [instanceId, instance] of Object.entries(
    restoredWindowing.instancesById,
  )) {
    if (instance.mode !== ChatWindowModeEnum.project_ai_mode) {
      layoutInstancesById[instanceId] =
        instance.chatId === null ? instance : { ...instance, chatId: null };
      continue;
    }

    const desiredChatId = instance.chatId ?? null;
    const currentChatId = resolveProjectChatThreadBindingChatId(
      currentWindowing.instancesById[instanceId],
    );
    if (desiredChatId !== currentChatId) {
      threadBindings.push({
        instanceId,
        chatId: desiredChatId,
        sectionIdOrNull: instance.sectionIdOrNull ?? null,
      });
    }
    layoutInstancesById[instanceId] =
      desiredChatId === currentChatId
        ? instance
        : {
            ...instance,
            chatId: currentChatId,
          };
  }

  return {
    layoutWindowing: createProjectChatWindowingState({
      ...restoredWindowing,
      instancesById: layoutInstancesById,
    }),
    threadBindings,
  };
}

async function settleWorkspaceRestoreLayoutWrites(): Promise<void> {
  await flushPendingProjectChatWindowingWrites();
  // Let optimistic rollback handlers update the store before phase 2 inspects it.
  await Promise.resolve();
}

function isRestoredProjectChatThreadBindingTarget(
  instance: ProjectChatWindowInstance | undefined,
  threadBinding: RestoredProjectChatThreadBinding,
): boolean {
  return (
    instance?.mode === ChatWindowModeEnum.project_ai_mode &&
    (instance.sectionIdOrNull ?? null) === threadBinding.sectionIdOrNull
  );
}

function hasRestoredProjectChatThreadBinding(
  instance: ProjectChatWindowInstance | undefined,
  threadBinding: RestoredProjectChatThreadBinding,
): boolean {
  return (
    isRestoredProjectChatThreadBindingTarget(instance, threadBinding) &&
    (instance.chatId ?? null) === threadBinding.chatId
  );
}

export async function restoreWorkspaceProjectChatThreadBindings(
  projectConfigId: string,
  threadBindings: Array<RestoredProjectChatThreadBinding>,
): Promise<void> {
  await settleWorkspaceRestoreLayoutWrites();
  if (threadBindings.length === 0) {
    return;
  }
  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }

  const layoutWindowing =
    getAuthoritativeProjectChatWindowingState(projectConfigId) ??
    useProjectState.getState().projectChatWindowing;
  if (
    threadBindings.some(
      (threadBinding) =>
        !isRestoredProjectChatThreadBindingTarget(
          layoutWindowing.instancesById[threadBinding.instanceId],
          threadBinding,
        ),
    )
  ) {
    addTemporaryNotification(
      "Failed to restore saved chat threads.",
      SettaNotificationTypeEnum.error,
    );
    return;
  }

  let encounteredFailure = false;
  for (const threadBinding of threadBindings) {
    if (useProjectState.getState().projectConfig.id !== projectConfigId) {
      return;
    }

    const authoritativeWindowing =
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing;
    const currentInstance =
      authoritativeWindowing.instancesById[threadBinding.instanceId];
    if (
      !currentInstance ||
      currentInstance.mode !== ChatWindowModeEnum.project_ai_mode ||
      (currentInstance.sectionIdOrNull ?? null) !==
        threadBinding.sectionIdOrNull ||
      (currentInstance.chatId ?? null) === threadBinding.chatId
    ) {
      continue;
    }

    setProjectChatWindowChatId(threadBinding.instanceId, threadBinding.chatId);
    await flushPendingProjectChatWindowingWrites();
    if (useProjectState.getState().projectConfig.id !== projectConfigId) {
      return;
    }

    const reboundWindowing =
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing;
    if (
      hasRestoredProjectChatThreadBinding(
        reboundWindowing.instancesById[threadBinding.instanceId],
        threadBinding,
      )
    ) {
      continue;
    }

    if (!encounteredFailure) {
      encounteredFailure = true;
    }
    console.error("Failed to restore saved project chat thread binding.", {
      projectConfigId,
      instanceId: threadBinding.instanceId,
      chatId: threadBinding.chatId,
    });
  }

  if (encounteredFailure) {
    addTemporaryNotification(
      "Failed to restore one or more saved chat threads.",
      SettaNotificationTypeEnum.error,
    );
  }
}
