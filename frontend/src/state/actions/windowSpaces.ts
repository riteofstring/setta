import { setProjectChatWindowChatId } from "state/actions/projectChatWindowing";
import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingState";
import {
  flushPendingProjectChatWindowingWrites,
  replaceProjectChatWindowingState,
} from "state/actions/projectChatWindowingWrites";
import { useProjectState, useShareSession } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SettaNotificationTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowingState,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { isProjectChatGitGraphEmbeddedPaneVisible } from "./projectChatWindowingEphemeral";
import {
  canMutateWindowSpaceLayout,
  getProjectWindowSpaces,
} from "./windowSpacePersistence";
import {
  allocateFreshProjectChatWindowInstanceId,
  buildOrderedProjectChatWindowInstanceIds,
  createProjectChatWindowingStateFromWindowSpace,
  dedupeRestoredSectionBindings,
} from "./windowSpaceSnapshots";

function mergeProjectChatWindowSpaceOrder(
  preservedOrder: Array<string>,
  restoredOrder: Array<string>,
  mergedInstancesById: ProjectChatWindowingState["instancesById"],
): Array<string> {
  const nextOrder: Array<string> = [];
  const seen = new Set<string>();
  const appendIfPresent = (instanceId: string) => {
    if (!mergedInstancesById[instanceId] || seen.has(instanceId)) {
      return;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  };
  for (const instanceId of preservedOrder) {
    appendIfPresent(instanceId);
  }
  for (const instanceId of restoredOrder) {
    appendIfPresent(instanceId);
  }
  for (const instanceId of Object.keys(mergedInstancesById)) {
    appendIfPresent(instanceId);
  }
  return nextOrder;
}

function remapRestoredWindowSpaceInstanceIdsForWorkspace(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
  supersededFloatingInstanceIds: Set<string>,
  preferredInstanceIdByOriginalId: Record<string, string>,
): {
  windowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
} {
  const usedInstanceIds = new Set(
    Object.keys(currentWindowing.instancesById).filter(
      (instanceId) => !supersededFloatingInstanceIds.has(instanceId),
    ),
  );
  const processedRestoredInstanceIds = new Set<string>();
  const remappedInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const remappedOrder: Array<string> = [];
  const remappedInstanceIdByOriginalId: Record<string, string> = {};
  let nextInstanceNumber = Math.max(
    currentWindowing.nextInstanceNumber,
    restoredFloatingWindowing.nextInstanceNumber,
  );

  for (const instanceId of restoredFloatingWindowing.order) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    processedRestoredInstanceIds.add(instanceId);
    let nextInstanceId =
      preferredInstanceIdByOriginalId[instanceId] ?? instanceId;
    if (usedInstanceIds.has(nextInstanceId)) {
      const allocated = allocateFreshProjectChatWindowInstanceId(
        usedInstanceIds,
        nextInstanceNumber,
      );
      nextInstanceId = allocated.instanceId;
      nextInstanceNumber = allocated.nextInstanceNumber;
    } else {
      usedInstanceIds.add(nextInstanceId);
    }
    remappedInstanceIdByOriginalId[instanceId] = nextInstanceId;
    remappedInstancesById[nextInstanceId] =
      nextInstanceId === instanceId
        ? instance
        : {
            ...instance,
            instanceId: nextInstanceId,
          };
    remappedOrder.push(nextInstanceId);
  }

  for (const [instanceId, instance] of Object.entries(
    restoredFloatingWindowing.instancesById,
  )) {
    if (processedRestoredInstanceIds.has(instanceId)) {
      continue;
    }
    if (usedInstanceIds.has(instanceId)) {
      const allocated = allocateFreshProjectChatWindowInstanceId(
        usedInstanceIds,
        nextInstanceNumber,
      );
      remappedInstanceIdByOriginalId[instanceId] = allocated.instanceId;
      remappedInstancesById[allocated.instanceId] = {
        ...instance,
        instanceId: allocated.instanceId,
      };
      remappedOrder.push(allocated.instanceId);
      nextInstanceNumber = allocated.nextInstanceNumber;
      continue;
    }
    usedInstanceIds.add(instanceId);
    remappedInstanceIdByOriginalId[instanceId] = instanceId;
    remappedInstancesById[instanceId] = instance;
    remappedOrder.push(instanceId);
  }

  return {
    windowing: normalizeProjectChatWindowingState(
      createProjectChatWindowingState({
        ...restoredFloatingWindowing,
        instancesById: remappedInstancesById,
        order: remappedOrder,
        nextInstanceNumber,
      }),
    ),
    remappedInstanceIdByOriginalId,
  };
}

function dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const authoritativeSectionIds = new Set(
    Object.values(currentWindowing.instancesById)
      .map((instance) => {
        if (
          instance.placement === ChatWindowPlacementEnum.floating ||
          instance.sectionIdOrNull === null
        ) {
          return null;
        }
        return instance.sectionIdOrNull;
      })
      .filter((sectionId): sectionId is string => sectionId !== null),
  );
  if (authoritativeSectionIds.size === 0) {
    return restoredFloatingWindowing;
  }

  const nextInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const nextOrder: string[] = [];
  for (const instanceId of restoredFloatingWindowing.order) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (
      !instance ||
      (instance.sectionIdOrNull !== null &&
        authoritativeSectionIds.has(instance.sectionIdOrNull))
    ) {
      continue;
    }
    nextInstancesById[instanceId] = instance;
    nextOrder.push(instanceId);
  }
  for (const [instanceId, instance] of Object.entries(
    restoredFloatingWindowing.instancesById,
  )) {
    if (
      instanceId in nextInstancesById ||
      (instance.sectionIdOrNull !== null &&
        authoritativeSectionIds.has(instance.sectionIdOrNull))
    ) {
      continue;
    }
    nextInstancesById[instanceId] = instance;
  }
  return normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      ...restoredFloatingWindowing,
      instancesById: nextInstancesById,
      order: nextOrder,
    }),
  );
}

function resolveFloatingWindowRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.sectionIdOrNull !== null) {
    return `section:${instance.sectionIdOrNull}`;
  }
  if (instance.mode === ChatWindowModeEnum.git_graph_mode) {
    return "git-graph";
  }
  if (
    instance.mode === ChatWindowModeEnum.project_ai_mode &&
    instance.chatId !== null
  ) {
    return `project-chat:${instance.chatId}`;
  }
  return null;
}

function resolveBoundWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.mode !== ChatWindowModeEnum.project_ai_mode) {
    return null;
  }
  if (instance.sectionIdOrNull !== null) {
    return `section:${instance.sectionIdOrNull}`;
  }
  if (instance.chatId !== null) {
    return `project-chat:${instance.chatId}`;
  }
  return null;
}

function resolveReusableWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.placement !== ChatWindowPlacementEnum.floating) {
    return null;
  }
  return resolveBoundWorkspaceRestoreOwnerKey(instance);
}

function buildPreferredRestoredInstanceIdByOriginalId(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): Record<string, string> {
  const reusableInstanceIdByOwnerKey = new Map<string, string>();
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    currentWindowing,
  )) {
    const instance = currentWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    const ownerKey = resolveReusableWorkspaceRestoreOwnerKey(instance);
    if (ownerKey === null || reusableInstanceIdByOwnerKey.has(ownerKey)) {
      continue;
    }
    reusableInstanceIdByOwnerKey.set(ownerKey, instanceId);
  }

  if (reusableInstanceIdByOwnerKey.size === 0) {
    return {};
  }

  const preferredInstanceIdByOriginalId: Record<string, string> = {};
  const claimedLiveInstanceIds = new Set<string>();
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    restoredFloatingWindowing,
  )) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    const ownerKey = resolveBoundWorkspaceRestoreOwnerKey(instance);
    if (ownerKey === null) {
      continue;
    }
    const preferredInstanceId = reusableInstanceIdByOwnerKey.get(ownerKey);
    if (
      preferredInstanceId === undefined ||
      claimedLiveInstanceIds.has(preferredInstanceId)
    ) {
      continue;
    }
    preferredInstanceIdByOriginalId[instanceId] = preferredInstanceId;
    claimedLiveInstanceIds.add(preferredInstanceId);
  }

  return preferredInstanceIdByOriginalId;
}

function resolveWorkspaceFloatingWindowsSupersededByRestore(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): Set<string> {
  const restoredOwnerKeys = new Set(
    Object.values(restoredFloatingWindowing.instancesById)
      .map((instance) => resolveFloatingWindowRestoreOwnerKey(instance))
      .filter((ownerKey): ownerKey is string => ownerKey !== null),
  );
  const supersededFloatingInstanceIds = new Set<string>();

  for (const [instanceId, instance] of Object.entries(
    currentWindowing.instancesById,
  )) {
    if (instance.placement !== ChatWindowPlacementEnum.floating) {
      continue;
    }
    const ownerKey = resolveFloatingWindowRestoreOwnerKey(instance);
    if (ownerKey !== null && restoredOwnerKeys.has(ownerKey)) {
      supersededFloatingInstanceIds.add(instanceId);
    }
  }

  return supersededFloatingInstanceIds;
}

function buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
  windowSpace: WindowSpaceConfig,
  remappedInstanceIdByOriginalId: Record<string, string>,
  restoredWindowing: ProjectChatWindowingState,
): Set<string> {
  const visibleInstanceIds = new Set<string>();
  for (const [instanceId, window] of Object.entries(windowSpace.windowsById)) {
    if (
      window.surfaceKind !== WindowSpaceSurfaceKindEnum.project_chat ||
      window.mode !== ChatWindowModeEnum.git_graph_mode ||
      !window.embeddedGitPaneVisible
    ) {
      continue;
    }
    const remappedInstanceId = remappedInstanceIdByOriginalId[instanceId];
    if (
      remappedInstanceId &&
      restoredWindowing.instancesById[remappedInstanceId]
    ) {
      visibleInstanceIds.add(remappedInstanceId);
    }
  }
  return visibleInstanceIds;
}

type RestoredProjectChatThreadBinding = {
  instanceId: string;
  chatId: string | null;
  sectionIdOrNull: string | null;
};

function getBlockedWindowSpaceRestoreMessage(
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

function buildWorkspaceRestoreLayoutState(
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

async function restoreWorkspaceProjectChatThreadBindings(
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

export async function restoreWindowSpaceInWorkspace(
  windowSpaceId: string,
): Promise<void> {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const windowSpaces = getProjectWindowSpaces(state.projectConfig);
  if (!(windowSpaceId in windowSpaces)) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  const windowSpace = windowSpaces[windowSpaceId];
  if (!windowSpace) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  const restoredFloatingWindowing =
    createProjectChatWindowingStateFromWindowSpace(windowSpace, state);
  const currentWindowing = state.projectChatWindowing;
  const restoredFloatingWindowingWithoutNonFloatingSectionCollisions =
    dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
      restoredFloatingWindowing,
      currentWindowing,
    );
  const preferredRestoredInstanceIdByOriginalId =
    buildPreferredRestoredInstanceIdByOriginalId(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
    );
  const supersededFloatingInstanceIds =
    resolveWorkspaceFloatingWindowsSupersededByRestore(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
    );
  const remappedRestoredFloatingWindowingResult =
    remapRestoredWindowSpaceInstanceIdsForWorkspace(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
      supersededFloatingInstanceIds,
      preferredRestoredInstanceIdByOriginalId,
    );
  const remappedRestoredFloatingWindowing = dedupeRestoredSectionBindings(
    remappedRestoredFloatingWindowingResult.windowing,
  );
  const preservedInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const preservedOrder: Array<string> = [];

  for (const instanceId of currentWindowing.order) {
    const instance = currentWindowing.instancesById[instanceId];
    if (
      !instance ||
      supersededFloatingInstanceIds.has(instanceId) ||
      remappedRestoredFloatingWindowing.instancesById[instanceId]
    ) {
      continue;
    }
    preservedInstancesById[instanceId] = instance;
    preservedOrder.push(instanceId);
  }

  for (const [instanceId, instance] of Object.entries(
    currentWindowing.instancesById,
  )) {
    if (
      supersededFloatingInstanceIds.has(instanceId) ||
      remappedRestoredFloatingWindowing.instancesById[instanceId] ||
      preservedInstancesById[instanceId]
    ) {
      continue;
    }
    preservedInstancesById[instanceId] = instance;
  }

  const instancesById = {
    ...preservedInstancesById,
    ...remappedRestoredFloatingWindowing.instancesById,
  };
  const nextWindowing = normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      instancesById,
      order: mergeProjectChatWindowSpaceOrder(
        preservedOrder,
        remappedRestoredFloatingWindowing.order,
        instancesById,
      ),
      nextInstanceNumber: Math.max(
        currentWindowing.nextInstanceNumber,
        remappedRestoredFloatingWindowing.nextInstanceNumber,
      ),
    }),
  );
  const restoredGitPaneVisibleInstanceIds =
    buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
      windowSpace,
      remappedRestoredFloatingWindowingResult.remappedInstanceIdByOriginalId,
      remappedRestoredFloatingWindowing,
    );
  const restoredInstanceIds = new Set(
    Object.keys(remappedRestoredFloatingWindowing.instancesById),
  );
  const nextGitPaneVisibleInstanceIds: Array<string> = [];
  for (const instance of Object.values(nextWindowing.instancesById)) {
    if (
      instance.mode !== ChatWindowModeEnum.git_graph_mode ||
      instance.isClosed
    ) {
      continue;
    }
    if (restoredInstanceIds.has(instance.instanceId)) {
      if (restoredGitPaneVisibleInstanceIds.has(instance.instanceId)) {
        nextGitPaneVisibleInstanceIds.push(instance.instanceId);
      }
      continue;
    }
    if (
      isProjectChatGitGraphEmbeddedPaneVisible(
        state.projectConfig.id,
        instance.instanceId,
      )
    ) {
      nextGitPaneVisibleInstanceIds.push(instance.instanceId);
    }
  }
  const { layoutWindowing, threadBindings } = buildWorkspaceRestoreLayoutState(
    currentWindowing,
    nextWindowing,
  );
  const blockedRestoreMessage =
    getBlockedWindowSpaceRestoreMessage(threadBindings);
  if (blockedRestoreMessage) {
    addTemporaryNotification(
      blockedRestoreMessage,
      SettaNotificationTypeEnum.error,
    );
    return;
  }
  replaceProjectChatWindowingState(layoutWindowing, {
    nextGitPaneVisibleInstanceIds,
  });
  try {
    await restoreWorkspaceProjectChatThreadBindings(
      state.projectConfig.id,
      threadBindings,
    );
  } catch (error) {
    console.error("Failed to restore saved project chat threads.", {
      projectConfigId: state.projectConfig.id,
      windowSpaceId,
      error,
    });
    addTemporaryNotification(
      "Failed to restore saved chat threads.",
      SettaNotificationTypeEnum.error,
    );
  }
}
