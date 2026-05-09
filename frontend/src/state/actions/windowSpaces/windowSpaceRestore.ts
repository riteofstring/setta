import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import {
  denormalizeFloatingBounds,
  normalizeFloatingBounds,
} from "components/ChatWindowing/projectChatSnapLayout";

import { resolveProjectChatFloatingViewport } from "components/ChatWindowing/projectChatViewport";

import {
  deleteWindowSpace as deleteWindowSpaceRequest,
  setWindowSpaceName as setWindowSpaceNameRequest,
  setWindowSpaceSortOrder,
} from "openapi/http";

import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowing";

import { publishProjectConfigSnapshot } from "state/actions/projectConfigSnapshots";

import { dispatchOptimisticProjectStateUpdateWithResult } from "state/actions/sectionInfos";

import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createWindowSpaceState,
  createWindowSpaceWindow,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
  type WindowSpaceState,
} from "utils/generatedTypes";

import { isProjectChatGitGraphEmbeddedPaneVisible } from "../projectChatWindowingEphemeral";

export type AuthoringFloatingViewport = {
  viewportWidthPx: number;
  viewportHeightPx: number;
  insets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

export type WindowSpaceSnapshotState = Pick<
  ZustandProjectState,
  | "projectChatWindowing"
  | "projectConfig"
  | "sections"
  | "sectionImpls"
  | "sectionVariants"
>;

export type ProjectConfigMutationPayload = {
  projectConfig: ZustandProjectState["projectConfig"];
};

export type WindowSpaceMutationPayload = ProjectConfigMutationPayload & {
  windowSpaceId?: string | null;
};

export type CreateWindowSpaceRouteResponse =
  ResponseDataAndStatus<WindowSpaceMutationPayload>;

export type ProjectConfigMutationRouteResponse =
  ResponseDataAndStatus<ProjectConfigMutationPayload>;

export function applyAcknowledgedWindowSpaceProjectConfig(
  state: ZustandProjectState,
  acknowledgedProjectConfig: ZustandProjectState["projectConfig"],
): void {
  const snapshot = createProjectConfig(acknowledgedProjectConfig);
  state.projectConfig.windowSpaces = snapshot.windowSpaces;
  state.projectConfig.windowSpaceSlugsById = snapshot.windowSpaceSlugsById;
  state.projectConfig.windowSpaceIdsBySlug = snapshot.windowSpaceIdsBySlug;
}

export function resolveAuthoringFloatingViewport(): AuthoringFloatingViewport {
  return resolveProjectChatFloatingViewport();
}

export function sortWindowSpaces(
  windowSpaces: Array<WindowSpaceConfig>,
): Array<WindowSpaceConfig> {
  return [...windowSpaces].sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }
    const nameComparison = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getProjectWindowSpaces(
  projectConfig: Pick<ZustandProjectState["projectConfig"], "windowSpaces">,
): Record<string, WindowSpaceConfig> {
  return projectConfig.windowSpaces;
}

export function cloneWindowSpaces(
  windowSpaces: Record<string, WindowSpaceConfig>,
): Record<string, WindowSpaceConfig> {
  return Object.fromEntries(
    Object.entries(windowSpaces).map(([windowSpaceId, windowSpace]) => [
      windowSpaceId,
      {
        ...windowSpace,
        windowsById: Object.fromEntries(
          Object.entries(windowSpace.windowsById).map(
            ([instanceId, window]) => [instanceId, { ...window }],
          ),
        ),
        order: [...windowSpace.order],
      },
    ]),
  );
}

export function canMutateWindowSpaceLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

export function dispatchOptimisticWindowSpaceMutation({
  apply,
  projectConfigId,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  projectConfigId: string;
  send: (args: {
    frontendOpId: string;
    projectConfigId: string;
  }) =>
    | ProjectConfigMutationRouteResponse
    | Promise<ProjectConfigMutationRouteResponse>;
}) {
  if (!canMutateWindowSpaceLayout()) {
    return Promise.resolve(undefined);
  }
  const previousWindowSpaces = cloneWindowSpaces(
    getProjectWindowSpaces(useProjectState.getState().projectConfig),
  );
  let acknowledgedProjectConfig: ZustandProjectState["projectConfig"] | null =
    null;
  const { result } = dispatchOptimisticProjectStateUpdateWithResult({
    projectConfigId,
    apply,
    reapply: (state) => {
      if (acknowledgedProjectConfig) {
        applyAcknowledgedWindowSpaceProjectConfig(
          state,
          acknowledgedProjectConfig,
        );
        return;
      }
      apply(state);
    },
    rollback: (state) => {
      state.projectConfig.windowSpaces =
        cloneWindowSpaces(previousWindowSpaces);
    },
    send: async (frontendOpId) => {
      const response = await send({
        frontendOpId,
        projectConfigId,
      });
      if (res200(response)) {
        acknowledgedProjectConfig = createProjectConfig(
          response.data.projectConfig,
        );
        publishProjectConfigSnapshot(
          projectConfigId,
          createProjectConfig(acknowledgedProjectConfig),
        );
      }
      return response;
    },
  });
  return result;
}

export function persistWindowSpaceSortOrder(
  projectConfigId: string,
  orderedWindowSpaceIds: Array<string>,
): Promise<ProjectConfigMutationRouteResponse | undefined> {
  return dispatchOptimisticWindowSpaceMutation({
    apply: () => {},
    projectConfigId,
    send: async ({ frontendOpId, projectConfigId: nextProjectConfigId }) => {
      const response = (await callOpenAPI(
        setWindowSpaceSortOrder({
          body: {
            projectConfigId: nextProjectConfigId,
            orderedWindowSpaceIds,
            frontendOpId,
          },
        } as Parameters<typeof setWindowSpaceSortOrder>[0]),
      )) as ProjectConfigMutationRouteResponse;
      return response;
    },
  });
}

export function setWindowSpaceName(
  projectConfigId: string,
  windowSpaceId: string,
  name: string,
): Promise<ProjectConfigMutationRouteResponse | undefined> {
  return dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      windowSpaces[windowSpaceId].name = name;
    },
    projectConfigId,
    send: async ({ frontendOpId, projectConfigId: nextProjectConfigId }) => {
      const response = (await callOpenAPI(
        setWindowSpaceNameRequest({
          body: {
            projectConfigId: nextProjectConfigId,
            windowSpaceId,
            name,
            frontendOpId,
          },
        } as Parameters<typeof setWindowSpaceNameRequest>[0]),
      )) as ProjectConfigMutationRouteResponse;
      return response;
    },
  });
}

export function deleteWindowSpace(
  projectConfigId: string,
  windowSpaceId: string,
): Promise<ProjectConfigMutationRouteResponse | undefined> {
  return dispatchOptimisticWindowSpaceMutation({
    apply: () => {},
    projectConfigId,
    send: async ({ frontendOpId, projectConfigId: nextProjectConfigId }) => {
      const response = (await callOpenAPI(
        deleteWindowSpaceRequest({
          body: {
            projectConfigId: nextProjectConfigId,
            windowSpaceId,
            frontendOpId,
          },
        } as Parameters<typeof deleteWindowSpaceRequest>[0]),
      )) as ProjectConfigMutationRouteResponse;
      return response;
    },
  });
}

export function snapshotFloatingWindowsForWindowSpace(
  state: WindowSpaceSnapshotState,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): WindowSpaceState {
  const snapshotWindowsById: WindowSpaceState["windowsById"] = {};
  const snapshotOrder: string[] = [];
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    state.projectChatWindowing,
  )) {
    const instance = state.projectChatWindowing.instancesById[instanceId];
    if (
      !instance ||
      !isSnapshotEligibleFloatingWindow(instance, state.sections)
    ) {
      continue;
    }
    snapshotWindowsById[instanceId] = buildWindowSpaceSnapshotWindow(
      instanceId,
      instance,
      state.projectConfig.id,
      viewport,
    );
    snapshotOrder.push(instanceId);
  }
  return createWindowSpaceState({
    windowsById: snapshotWindowsById,
    order: snapshotOrder,
  });
}

export function normalizeWindowSpaceForPersistence(
  state: WindowSpaceSnapshotState,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): WindowSpaceState {
  return snapshotFloatingWindowsForWindowSpace(state, viewport);
}

export function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  return value ?? null;
}

export function resolveProjectChatWindowSectionId(
  instance: Pick<ProjectChatWindowInstance, "sectionIdOrNull">,
): string | null {
  return normalizeNullableString(instance.sectionIdOrNull);
}

export function resolveProjectChatWindowChatId(
  instance: Pick<ProjectChatWindowInstance, "chatId">,
): string | null {
  return normalizeNullableString(instance.chatId);
}

export function resolveProjectChatWindowMode(
  instance: Pick<ProjectChatWindowInstance, "mode">,
): NonNullable<ProjectChatWindowInstance["mode"]> {
  return instance.mode ?? ChatWindowModeEnum.project_ai_mode;
}

export function resolveWindowSpaceWindowMode(
  window: Pick<NonNullable<WindowSpaceState["windowsById"][string]>, "mode">,
): NonNullable<NonNullable<WindowSpaceState["windowsById"][string]>["mode"]> {
  return window.mode ?? ChatWindowModeEnum.project_ai_mode;
}

export function resolveWindowSpaceSnapshotChatId(
  instance: ProjectChatWindowInstance,
): string | null {
  if (
    resolveProjectChatWindowMode(instance) !==
    ChatWindowModeEnum.project_ai_mode
  ) {
    return null;
  }
  return resolveProjectChatWindowChatId(instance);
}

export function resolveRestoredWorkspaceWindowChatId(
  window: NonNullable<WindowSpaceState["windowsById"][string]>,
): string | null | undefined {
  return resolveWindowSpaceWindowMode(window) ===
    ChatWindowModeEnum.project_ai_mode
    ? normalizeNullableString(window.chatId)
    : null;
}

export function resolveNextProjectChatWindowInstanceNumber(
  instanceIds: Array<string>,
): number {
  let nextInstanceNumber = 1;
  for (const instanceId of instanceIds) {
    const match = /^project-chat-window-(\d+)$/.exec(instanceId);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      continue;
    }
    nextInstanceNumber = Math.max(nextInstanceNumber, parsed + 1);
  }
  return nextInstanceNumber;
}

export function allocateFreshProjectChatWindowInstanceId(
  usedInstanceIds: Set<string>,
  nextInstanceNumber: number,
): {
  instanceId: string;
  nextInstanceNumber: number;
} {
  let candidateNumber = nextInstanceNumber;
  let candidateId = `project-chat-window-${candidateNumber}`;
  while (usedInstanceIds.has(candidateId)) {
    candidateNumber += 1;
    candidateId = `project-chat-window-${candidateNumber}`;
  }
  usedInstanceIds.add(candidateId);
  return {
    instanceId: candidateId,
    nextInstanceNumber: candidateNumber + 1,
  };
}

export function mergeProjectChatWindowSpaceOrder(
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

export function buildOrderedProjectChatWindowInstanceIds(
  state: ProjectChatWindowingState,
): Array<string> {
  const seen = new Set<string>();
  const orderedInstanceIds: Array<string> = [];
  for (const instanceId of state.order) {
    if (!state.instancesById[instanceId] || seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  for (const instanceId of Object.keys(state.instancesById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  return orderedInstanceIds;
}

export function buildOrderedWindowSpaceWindowIds(
  windowSpace: Pick<WindowSpaceConfig, "order" | "windowsById">,
): Array<string> {
  const seen = new Set<string>();
  const orderedInstanceIds: Array<string> = [];
  for (const instanceId of windowSpace.order) {
    if (!windowSpace.windowsById[instanceId] || seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  for (const instanceId of Object.keys(windowSpace.windowsById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  return orderedInstanceIds;
}

export function isSnapshotEligibleFloatingWindow(
  instance: ProjectChatWindowInstance,
  sections: ZustandProjectState["sections"],
): boolean {
  const sectionId = resolveProjectChatWindowSectionId(instance);
  if (instance.placement !== ChatWindowPlacementEnum.floating) {
    return false;
  }
  if (instance.isClosed || instance.isMinimized || instance.isMaximized) {
    return false;
  }
  return sectionId === null || Object.hasOwn(sections, sectionId);
}

export function buildWindowSpaceSnapshotWindow(
  instanceId: string,
  instance: ProjectChatWindowInstance,
  projectConfigId: string,
  viewport: AuthoringFloatingViewport,
): NonNullable<WindowSpaceState["windowsById"][string]> {
  const mode = resolveProjectChatWindowMode(instance);
  const sectionId = resolveProjectChatWindowSectionId(instance);
  return createWindowSpaceWindow({
    surfaceKind:
      sectionId === null
        ? WindowSpaceSurfaceKindEnum.project_chat
        : WindowSpaceSurfaceKindEnum.section,
    sectionIdOrNull: instance.sectionIdOrNull,
    mode,
    title: sectionId === null ? instance.title : null,
    chatId: resolveWindowSpaceSnapshotChatId(instance),
    embeddedGitPaneVisible:
      mode === ChatWindowModeEnum.git_graph_mode && sectionId === null
        ? isProjectChatGitGraphEmbeddedPaneVisible(projectConfigId, instanceId)
        : false,
    zIndex: instance.zIndex,
    normalizedBounds: normalizeFloatingBounds(
      instance.bounds,
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.insets,
    ),
  });
}

export function shouldRestoreWindowSpaceWindow(
  window: NonNullable<WindowSpaceState["windowsById"][string]>,
  sections: ZustandProjectState["sections"],
): boolean {
  return (
    window.surfaceKind !== WindowSpaceSurfaceKindEnum.section ||
    (window.sectionIdOrNull !== null &&
      Object.hasOwn(sections, window.sectionIdOrNull))
  );
}

export function buildProjectChatWindowInstanceFromWindowSpaceWindow(
  instanceId: string,
  window: NonNullable<WindowSpaceState["windowsById"][string]>,
  viewport: AuthoringFloatingViewport,
): ProjectChatWindowInstance {
  return createProjectChatWindowInstance({
    instanceId,
    placement: ChatWindowPlacementEnum.floating,
    mode: resolveWindowSpaceWindowMode(window),
    sectionIdOrNull: window.sectionIdOrNull,
    title:
      window.surfaceKind === WindowSpaceSurfaceKindEnum.section
        ? null
        : window.title,
    chatId: resolveRestoredWorkspaceWindowChatId(window),
    isClosed: false,
    isMinimized: false,
    isMaximized: false,
    lastPlacementBeforeMaximize: null,
    zIndex: window.zIndex,
    lastFocusedAt: window.zIndex,
    bounds: denormalizeFloatingBounds(
      window.normalizedBounds,
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.insets,
    ),
  });
}

export function createProjectChatWindowingStateFromWindowSpace(
  windowSpace: WindowSpaceConfig,
  { sections }: Pick<ZustandProjectState, "sections">,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): ProjectChatWindowingState {
  const instancesById: ProjectChatWindowingState["instancesById"] = {};
  const order: Array<string> = [];
  for (const instanceId of buildOrderedWindowSpaceWindowIds(windowSpace)) {
    const window = windowSpace.windowsById[instanceId];
    if (!window || !shouldRestoreWindowSpaceWindow(window, sections)) {
      continue;
    }
    instancesById[instanceId] =
      buildProjectChatWindowInstanceFromWindowSpaceWindow(
        instanceId,
        window,
        viewport,
      );
    order.push(instanceId);
  }
  return normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      instancesById,
      order,
      nextInstanceNumber: resolveNextProjectChatWindowInstanceNumber(order),
    }),
  );
}

export function remapRestoredWindowSpaceInstanceIdsForWorkspace(
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

export function collectProjectChatWindowInstances(
  windowing: ProjectChatWindowingState,
  shouldKeep: (
    instanceId: string,
    instance: ProjectChatWindowInstance,
  ) => boolean,
): {
  instancesById: ProjectChatWindowingState["instancesById"];
  order: Array<string>;
} {
  const instancesById: ProjectChatWindowingState["instancesById"] = {};
  const order: Array<string> = [];
  for (const instanceId of windowing.order) {
    const instance = windowing.instancesById[instanceId];
    if (!instance || !shouldKeep(instanceId, instance)) {
      continue;
    }
    instancesById[instanceId] = instance;
    order.push(instanceId);
  }
  for (const [instanceId, instance] of Object.entries(
    windowing.instancesById,
  )) {
    if (
      Object.hasOwn(instancesById, instanceId) ||
      !shouldKeep(instanceId, instance)
    ) {
      continue;
    }
    instancesById[instanceId] = instance;
  }
  return {
    instancesById,
    order,
  };
}

export function createCollectedProjectChatWindowingState(
  windowing: ProjectChatWindowingState,
  shouldKeep: (
    instanceId: string,
    instance: ProjectChatWindowInstance,
  ) => boolean,
): ProjectChatWindowingState {
  const { instancesById, order } = collectProjectChatWindowInstances(
    windowing,
    shouldKeep,
  );
  return normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      ...windowing,
      instancesById,
      order,
    }),
  );
}

export function buildNonFloatingWorkspaceHostSectionIds(
  currentWindowing: ProjectChatWindowingState,
): Set<string> {
  const authoritativeSectionIds = new Set<string>();
  for (const instance of Object.values(currentWindowing.instancesById)) {
    const sectionId = resolveProjectChatWindowSectionId(instance);
    if (
      instance.placement === ChatWindowPlacementEnum.floating ||
      sectionId === null
    ) {
      continue;
    }
    authoritativeSectionIds.add(sectionId);
  }
  return authoritativeSectionIds;
}

export function isRestoredSectionWindowOwnedByNonFloatingWorkspaceHost(
  instance: ProjectChatWindowInstance,
  authoritativeSectionIds: Set<string>,
): boolean {
  const sectionId = resolveProjectChatWindowSectionId(instance);
  return sectionId !== null && authoritativeSectionIds.has(sectionId);
}

export function dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const authoritativeSectionIds =
    buildNonFloatingWorkspaceHostSectionIds(currentWindowing);
  if (authoritativeSectionIds.size === 0) {
    return restoredFloatingWindowing;
  }
  return createCollectedProjectChatWindowingState(
    restoredFloatingWindowing,
    (_instanceId, instance) =>
      !isRestoredSectionWindowOwnedByNonFloatingWorkspaceHost(
        instance,
        authoritativeSectionIds,
      ),
  );
}

export function resolveFloatingWindowRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  const sectionId = resolveProjectChatWindowSectionId(instance);
  if (sectionId !== null) {
    return `section:${sectionId}`;
  }
  if (
    resolveProjectChatWindowMode(instance) === ChatWindowModeEnum.git_graph_mode
  ) {
    return "git-graph";
  }
  const chatId = resolveProjectChatWindowChatId(instance);
  if (
    resolveProjectChatWindowMode(instance) ===
      ChatWindowModeEnum.project_ai_mode &&
    chatId !== null
  ) {
    return `project-chat:${chatId}`;
  }
  return null;
}

export function resolveBoundWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (
    resolveProjectChatWindowMode(instance) !==
    ChatWindowModeEnum.project_ai_mode
  ) {
    return null;
  }
  const sectionId = resolveProjectChatWindowSectionId(instance);
  if (sectionId !== null) {
    return `section:${sectionId}`;
  }
  const chatId = resolveProjectChatWindowChatId(instance);
  if (chatId !== null) {
    return `project-chat:${chatId}`;
  }
  return null;
}

export function resolveReusableWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.placement !== ChatWindowPlacementEnum.floating) {
    return null;
  }
  return resolveBoundWorkspaceRestoreOwnerKey(instance);
}

export function buildOrderedRestoreOwnerKeyMap(
  windowing: ProjectChatWindowingState,
  resolveOwnerKey: (instance: ProjectChatWindowInstance) => string | null,
): Map<string, string> {
  const instanceIdByOwnerKey = new Map<string, string>();
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    windowing,
  )) {
    const instance = windowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    const ownerKey = resolveOwnerKey(instance);
    if (ownerKey === null || instanceIdByOwnerKey.has(ownerKey)) {
      continue;
    }
    instanceIdByOwnerKey.set(ownerKey, instanceId);
  }
  return instanceIdByOwnerKey;
}

export function claimPreferredRestoredInstanceIds(
  restoredFloatingWindowing: ProjectChatWindowingState,
  reusableInstanceIdByOwnerKey: Map<string, string>,
): Record<string, string> {
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

export function buildPreferredRestoredInstanceIdByOriginalId(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): Record<string, string> {
  const reusableInstanceIdByOwnerKey = buildOrderedRestoreOwnerKeyMap(
    currentWindowing,
    resolveReusableWorkspaceRestoreOwnerKey,
  );
  if (reusableInstanceIdByOwnerKey.size === 0) {
    return {};
  }
  return claimPreferredRestoredInstanceIds(
    restoredFloatingWindowing,
    reusableInstanceIdByOwnerKey,
  );
}

export function resolveWorkspaceFloatingWindowsSupersededByRestore(
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
