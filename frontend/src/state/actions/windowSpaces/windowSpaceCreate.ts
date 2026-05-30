import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { createWindowSpace } from "openapi/http";

import {
  flushPendingProjectChatWindowingWrites,
  normalizeProjectChatWindowingState,
  replaceProjectChatWindowingState,
  setProjectChatWindowChatId,
  syncProjectChatWindowingState,
} from "state/actions/projectChatWindowing";

import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";

import { publishProjectConfigSnapshot } from "state/actions/projectConfigSnapshots";

import { getCurrProjectConfigId } from "state/actions/sectionInfos";

import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";

import {
  ChatWindowModeEnum,
  NotificationTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowingState,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
  type WindowSpaceState,
} from "utils/generatedTypes";

import { addTemporaryNotification } from "../notifications";

import { isProjectChatGitGraphEmbeddedPaneVisible } from "../projectChatWindowingEphemeral";

import {
  CreateWindowSpaceRouteResponse,
  WindowSpaceSnapshotState,
  buildPreferredRestoredInstanceIdByOriginalId,
  canMutateWindowSpaceLayout,
  collectProjectChatWindowInstances,
  createProjectChatWindowingStateFromWindowSpace,
  dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts,
  getProjectWindowSpaces,
  mergeProjectChatWindowSpaceOrder,
  normalizeWindowSpaceForPersistence,
  remapRestoredWindowSpaceInstanceIdsForWorkspace,
  resolveProjectChatWindowChatId,
  resolveProjectChatWindowMode,
  resolveWorkspaceFloatingWindowsSupersededByRestore,
  snapshotFloatingWindowsForWindowSpace,
} from "./windowSpaceRestore";

export function buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
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

export function resolveProjectChatThreadBindingChatId(
  instance: ProjectChatWindowInstance | undefined,
): string | null {
  if (
    !instance ||
    resolveProjectChatWindowMode(instance) !==
      ChatWindowModeEnum.project_ai_mode
  ) {
    return null;
  }
  return resolveProjectChatWindowChatId(instance);
}

export function buildWorkspaceRestoreLayoutState(
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
    if (
      resolveProjectChatWindowMode(instance) !==
      ChatWindowModeEnum.project_ai_mode
    ) {
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

export async function settleWorkspaceRestoreLayoutWrites(): Promise<void> {
  await flushPendingProjectChatWindowingWrites();
  // Let optimistic rollback handlers update the store before phase 2 inspects it.
  await Promise.resolve();
}

export function isRestoredProjectChatThreadBindingTarget(
  instance: ProjectChatWindowInstance | undefined,
  threadBinding: RestoredProjectChatThreadBinding,
): boolean {
  return (
    !!instance &&
    resolveProjectChatWindowMode(instance) ===
      ChatWindowModeEnum.project_ai_mode &&
    (instance.sectionIdOrNull ?? null) === threadBinding.sectionIdOrNull
  );
}

export function hasRestoredProjectChatThreadBinding(
  instance: ProjectChatWindowInstance | undefined,
  threadBinding: RestoredProjectChatThreadBinding,
): boolean {
  return (
    isRestoredProjectChatThreadBindingTarget(instance, threadBinding) &&
    (instance.chatId ?? null) === threadBinding.chatId
  );
}

export function isActiveWindowSpaceProjectConfig(
  projectConfigId: string,
): boolean {
  return useProjectState.getState().projectConfig.id === projectConfigId;
}

export function getCurrentProjectChatWindowingForProjectConfig(
  projectConfigId: string,
): ProjectChatWindowingState {
  return (
    getAuthoritativeProjectChatWindowingState(projectConfigId) ??
    useProjectState.getState().projectChatWindowing
  );
}

export function shouldRestoreProjectChatThreadBinding(
  instance: ProjectChatWindowInstance | undefined,
  threadBinding: RestoredProjectChatThreadBinding,
): boolean {
  return (
    !!instance &&
    resolveProjectChatWindowMode(instance) ===
      ChatWindowModeEnum.project_ai_mode &&
    (instance.sectionIdOrNull ?? null) === threadBinding.sectionIdOrNull &&
    (instance.chatId ?? null) !== threadBinding.chatId
  );
}

export type RestoreProjectChatThreadBindingResult =
  | "restored"
  | "skipped"
  | "aborted"
  | "failed";

export async function restoreSingleWorkspaceProjectChatThreadBinding(
  projectConfigId: string,
  threadBinding: RestoredProjectChatThreadBinding,
): Promise<RestoreProjectChatThreadBindingResult> {
  if (!isActiveWindowSpaceProjectConfig(projectConfigId)) {
    return "aborted";
  }
  const currentInstance =
    getCurrentProjectChatWindowingForProjectConfig(projectConfigId)
      .instancesById[threadBinding.instanceId];
  if (!shouldRestoreProjectChatThreadBinding(currentInstance, threadBinding)) {
    return "skipped";
  }
  setProjectChatWindowChatId(threadBinding.instanceId, threadBinding.chatId);
  await flushPendingProjectChatWindowingWrites();
  if (!isActiveWindowSpaceProjectConfig(projectConfigId)) {
    return "aborted";
  }
  return hasRestoredProjectChatThreadBinding(
    getCurrentProjectChatWindowingForProjectConfig(projectConfigId)
      .instancesById[threadBinding.instanceId],
    threadBinding,
  )
    ? "restored"
    : "failed";
}

export async function restoreWorkspaceProjectChatThreadBindings(
  projectConfigId: string,
  threadBindings: Array<RestoredProjectChatThreadBinding>,
): Promise<void> {
  await settleWorkspaceRestoreLayoutWrites();
  if (threadBindings.length === 0) {
    return;
  }
  if (!isActiveWindowSpaceProjectConfig(projectConfigId)) {
    return;
  }
  const layoutWindowing =
    getCurrentProjectChatWindowingForProjectConfig(projectConfigId);
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
      NotificationTypeEnum.error,
    );
    return;
  }
  let encounteredFailure = false;
  for (const threadBinding of threadBindings) {
    const restoreResult = await restoreSingleWorkspaceProjectChatThreadBinding(
      projectConfigId,
      threadBinding,
    );
    if (restoreResult === "aborted") {
      return;
    }
    if (restoreResult !== "failed") {
      continue;
    }
    encounteredFailure = true;
    console.error("Failed to restore saved project chat thread binding.", {
      projectConfigId,
      instanceId: threadBinding.instanceId,
      chatId: threadBinding.chatId,
    });
  }
  if (encounteredFailure) {
    addTemporaryNotification(
      "Failed to restore one or more saved chat threads.",
      NotificationTypeEnum.error,
    );
  }
}

export function getWindowSpaceOrThrow(
  state: Pick<ZustandProjectState, "projectConfig">,
  windowSpaceId: string,
): WindowSpaceConfig {
  const windowSpace = getProjectWindowSpaces(state.projectConfig)[
    windowSpaceId
  ];
  if (!windowSpace) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  return windowSpace;
}

export type PreparedWorkspaceRestore = {
  remappedRestoredFloatingWindowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
  supersededFloatingInstanceIds: Set<string>;
};

export function prepareWorkspaceRestore(
  windowSpace: WindowSpaceConfig,
  state: WindowSpaceSnapshotState,
): PreparedWorkspaceRestore {
  const currentWindowing = state.projectChatWindowing;
  const restoredFloatingWindowing =
    createProjectChatWindowingStateFromWindowSpace(windowSpace, state);
  const collisionFreeRestoredFloatingWindowing =
    dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
      restoredFloatingWindowing,
      currentWindowing,
    );
  const preferredRestoredInstanceIdByOriginalId =
    buildPreferredRestoredInstanceIdByOriginalId(
      collisionFreeRestoredFloatingWindowing,
      currentWindowing,
    );
  const supersededFloatingInstanceIds =
    resolveWorkspaceFloatingWindowsSupersededByRestore(
      collisionFreeRestoredFloatingWindowing,
      currentWindowing,
    );
  const remappedRestoreResult = remapRestoredWindowSpaceInstanceIdsForWorkspace(
    collisionFreeRestoredFloatingWindowing,
    currentWindowing,
    supersededFloatingInstanceIds,
    preferredRestoredInstanceIdByOriginalId,
  );
  return {
    remappedRestoredFloatingWindowing: remappedRestoreResult.windowing,
    remappedInstanceIdByOriginalId:
      remappedRestoreResult.remappedInstanceIdByOriginalId,
    supersededFloatingInstanceIds,
  };
}

export function collectPreservedWorkspaceWindowing(
  currentWindowing: ProjectChatWindowingState,
  supersededFloatingInstanceIds: Set<string>,
  remappedRestoredFloatingWindowing: ProjectChatWindowingState,
): {
  instancesById: ProjectChatWindowingState["instancesById"];
  order: Array<string>;
} {
  return collectProjectChatWindowInstances(
    currentWindowing,
    (instanceId) =>
      !supersededFloatingInstanceIds.has(instanceId) &&
      !remappedRestoredFloatingWindowing.instancesById[instanceId],
  );
}

export function buildNextWorkspaceRestoreWindowing(
  currentWindowing: ProjectChatWindowingState,
  remappedRestoredFloatingWindowing: ProjectChatWindowingState,
  preservedWorkspaceWindowing: {
    instancesById: ProjectChatWindowingState["instancesById"];
    order: Array<string>;
  },
): ProjectChatWindowingState {
  const instancesById = {
    ...preservedWorkspaceWindowing.instancesById,
    ...remappedRestoredFloatingWindowing.instancesById,
  };
  return normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      instancesById,
      order: mergeProjectChatWindowSpaceOrder(
        preservedWorkspaceWindowing.order,
        remappedRestoredFloatingWindowing.order,
        instancesById,
      ),
      nextInstanceNumber: Math.max(
        currentWindowing.nextInstanceNumber,
        remappedRestoredFloatingWindowing.nextInstanceNumber,
      ),
    }),
  );
}

export function buildNextGitPaneVisibleInstanceIds(
  projectConfigId: string,
  nextWindowing: ProjectChatWindowingState,
  restoredInstanceIds: Set<string>,
  restoredGitPaneVisibleInstanceIds: Set<string>,
): Array<string> {
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
        projectConfigId,
        instance.instanceId,
      )
    ) {
      nextGitPaneVisibleInstanceIds.push(instance.instanceId);
    }
  }
  return nextGitPaneVisibleInstanceIds;
}

export async function restoreWindowSpaceInWorkspace(
  windowSpaceId: string,
): Promise<void> {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = state.projectChatWindowing;
  const windowSpace = getWindowSpaceOrThrow(state, windowSpaceId);
  const workspaceRestore = prepareWorkspaceRestore(windowSpace, state);
  const preservedWorkspaceWindowing = collectPreservedWorkspaceWindowing(
    currentWindowing,
    workspaceRestore.supersededFloatingInstanceIds,
    workspaceRestore.remappedRestoredFloatingWindowing,
  );
  const nextWindowing = buildNextWorkspaceRestoreWindowing(
    currentWindowing,
    workspaceRestore.remappedRestoredFloatingWindowing,
    preservedWorkspaceWindowing,
  );
  const restoredGitPaneVisibleInstanceIds =
    buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
      windowSpace,
      workspaceRestore.remappedInstanceIdByOriginalId,
      workspaceRestore.remappedRestoredFloatingWindowing,
    );
  const restoredInstanceIds = new Set(
    Object.keys(
      workspaceRestore.remappedRestoredFloatingWindowing.instancesById,
    ),
  );
  const nextGitPaneVisibleInstanceIds = buildNextGitPaneVisibleInstanceIds(
    state.projectConfig.id,
    nextWindowing,
    restoredInstanceIds,
    restoredGitPaneVisibleInstanceIds,
  );
  const { layoutWindowing, threadBindings } = buildWorkspaceRestoreLayoutState(
    currentWindowing,
    nextWindowing,
  );
  const blockedRestoreMessage =
    getBlockedWindowSpaceRestoreMessage(threadBindings);
  if (blockedRestoreMessage) {
    addTemporaryNotification(blockedRestoreMessage, NotificationTypeEnum.error);
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
      NotificationTypeEnum.error,
    );
  }
}

export type WindowSpaceSaveContext = {
  projectConfigId: string;
  projectConfigSnapshot: WindowSpaceSnapshotState["projectConfig"];
  sectionSnapshot: WindowSpaceSnapshotState["sections"];
  sectionImplSnapshot: WindowSpaceSnapshotState["sectionImpls"];
  sectionVariantSnapshot: WindowSpaceSnapshotState["sectionVariants"];
};

export type SyncProjectChatWindowingResponse = NonNullable<
  Awaited<ReturnType<typeof syncProjectChatWindowingState>>
>;

export function buildRouteErrorSuffix(
  status: number | null | undefined,
  detail: string | null,
): string {
  const statusSuffix = typeof status === "number" ? ` (${status})` : "";
  const detailSuffix = detail ? `: ${detail}` : ".";
  return `${statusSuffix}${detailSuffix}`;
}

export function buildWindowSpaceSaveContext(
  state: WindowSpaceSnapshotState,
  projectConfigId: string,
): WindowSpaceSaveContext | null {
  const snapshot = normalizeWindowSpaceForPersistence(state);
  if (Object.keys(snapshot.windowsById).length === 0) {
    return null;
  }
  return {
    projectConfigId,
    projectConfigSnapshot: state.projectConfig,
    sectionSnapshot: state.sections,
    sectionImplSnapshot: state.sectionImpls,
    sectionVariantSnapshot: state.sectionVariants,
  };
}

export function notifyWindowSpaceSyncFailure(
  projectConfigId: string,
  syncResponse: Awaited<ReturnType<typeof syncProjectChatWindowingState>>,
): void {
  const detail = syncResponse ? getErrorDetail(syncResponse.data) : null;
  console.error("Failed to sync project chat windowing before saving.", {
    status: syncResponse?.status ?? null,
    detail,
    projectConfigId,
  });
  addTemporaryNotification(
    `Failed to sync window layout before saving${buildRouteErrorSuffix(
      syncResponse?.status,
      detail,
    )}`,
    NotificationTypeEnum.error,
  );
}

export function resolveSyncedWindowingForWindowSpaceSave(
  projectConfigId: string,
  syncResponse: SyncProjectChatWindowingResponse,
): ProjectChatWindowingState {
  const latestState = useProjectState.getState();
  return latestState.projectConfig.id === projectConfigId
    ? getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        latestState.projectChatWindowing
    : getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        syncResponse.data;
}

export async function buildAuthoritativeWindowSpaceSnapshot(
  context: WindowSpaceSaveContext,
): Promise<WindowSpaceState | null> {
  const syncResponse = await syncProjectChatWindowingState();
  if (!syncResponse || !res200(syncResponse)) {
    notifyWindowSpaceSyncFailure(context.projectConfigId, syncResponse);
    return null;
  }
  await flushPendingProjectChatWindowingWrites();
  const authoritativeSnapshot = snapshotFloatingWindowsForWindowSpace({
    projectChatWindowing: resolveSyncedWindowingForWindowSpaceSave(
      context.projectConfigId,
      syncResponse,
    ),
    projectConfig: context.projectConfigSnapshot,
    sections: context.sectionSnapshot,
    sectionImpls: context.sectionImplSnapshot,
    sectionVariants: context.sectionVariantSnapshot,
  });
  return Object.keys(authoritativeSnapshot.windowsById).length === 0
    ? null
    : authoritativeSnapshot;
}

export function notifyWindowSpaceSaveFailure(
  projectConfigId: string,
  response: CreateWindowSpaceRouteResponse,
): void {
  const detail = getErrorDetail(response.data);
  console.error("Failed to save window space.", {
    status: response.status,
    detail,
    projectConfigId,
  });
  addTemporaryNotification(
    `Failed to save window space${buildRouteErrorSuffix(
      response.status,
      detail,
    )}`,
    NotificationTypeEnum.error,
  );
}

export async function saveWindowSpaceSnapshot(
  projectConfigId: string,
  authoritativeSnapshot: WindowSpaceState,
): Promise<string | null> {
  const response = (await callOpenAPI(
    createWindowSpace({
      body: {
        projectConfigId,
        state: authoritativeSnapshot,
      },
    } as Parameters<typeof createWindowSpace>[0]),
  )) as CreateWindowSpaceRouteResponse;
  if (!res200(response)) {
    notifyWindowSpaceSaveFailure(projectConfigId, response);
    return null;
  }
  publishProjectConfigSnapshot(projectConfigId, response.data.projectConfig);
  return response.data.windowSpaceId ?? null;
}

export async function createWindowSpaceFromCurrentFloatingWindows(): Promise<
  string | null
> {
  if (!canMutateWindowSpaceLayout()) {
    return null;
  }
  await flushPendingProjectChatWindowingWrites();
  const state = useProjectState.getState();
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId) {
    return null;
  }
  const saveContext = buildWindowSpaceSaveContext(state, projectConfigId);
  if (!saveContext) {
    return null;
  }
  const authoritativeSnapshot =
    await buildAuthoritativeWindowSpaceSnapshot(saveContext);
  if (!authoritativeSnapshot) {
    return null;
  }
  return saveWindowSpaceSnapshot(projectConfigId, authoritativeSnapshot);
}
