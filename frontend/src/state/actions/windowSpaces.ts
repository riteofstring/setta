import {
  denormalizeFloatingBounds,
  normalizeFloatingBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { resolveProjectChatFloatingViewport } from "components/ChatWindowing/projectChatViewport";
import {
  flushPendingProjectChatWindowingWrites,
  normalizeProjectChatWindowingState,
  replaceProjectChatWindowingState,
  setProjectChatWindowChatId,
  syncProjectChatWindowingState,
} from "state/actions/projectChatWindowing";
import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_create_window_space,
  route_delete_window_space,
  route_set_window_space_name,
  route_set_window_space_sort_order,
} from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SettaNotificationTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createWindowSpaceState,
  createWindowSpaceWindow,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
  type WindowSpaceState,
} from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";
import { sanitizeNameForSlug } from "utils/nameValidation";
import { addTemporaryNotification } from "./notifications";
import { isProjectChatGitGraphEmbeddedPaneVisible } from "./projectChatWindowingEphemeral";

type AuthoringFloatingViewport = {
  viewportWidthPx: number;
  viewportHeightPx: number;
  insets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

type WindowSpaceSnapshotState = Pick<
  ZustandProjectState,
  | "projectChatWindowing"
  | "projectConfig"
  | "sections"
  | "sectionImpls"
  | "sectionVariants"
>;

function resolveAuthoringFloatingViewport(): AuthoringFloatingViewport {
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

function cloneWindowSpaces(
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

function canMutateWindowSpaceLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

function dispatchOptimisticWindowSpaceMutation({
  apply,
  projectConfigId,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  projectConfigId: string;
  send: (args: {
    frontendOpId: string;
    projectConfigId: string;
  }) => void | Promise<unknown>;
}) {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const previousWindowSpaces = cloneWindowSpaces(
    getProjectWindowSpaces(useProjectState.getState().projectConfig),
  );
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply,
    rollback: (state) => {
      state.projectConfig.windowSpaces =
        cloneWindowSpaces(previousWindowSpaces);
    },
    send: (frontendOpId) =>
      send({
        frontendOpId,
        projectConfigId,
      }),
  });
}

function resolveNextWindowSpaceName(
  windowSpaces: Record<string, WindowSpaceConfig>,
): string {
  const existingSlugs = new Set(
    Object.values(windowSpaces).map((windowSpace) =>
      sanitizeNameForSlug(windowSpace.name),
    ),
  );
  let nextName = createRandomName();
  while (existingSlugs.has(sanitizeNameForSlug(nextName))) {
    nextName = createRandomName();
  }
  return nextName;
}

export function applyWindowSpaceSortOrder(
  state: ZustandProjectState,
  orderedWindowSpaceIds: Array<string>,
): void {
  const windowSpaces = state.projectConfig.windowSpaces;
  if (orderedWindowSpaceIds.length !== Object.keys(windowSpaces).length) {
    throw new Error(
      "orderedWindowSpaceIds must include every window space exactly once.",
    );
  }

  const seen = new Set<string>();
  for (const windowSpaceId of orderedWindowSpaceIds) {
    if (!(windowSpaceId in windowSpaces)) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    if (seen.has(windowSpaceId)) {
      throw new Error("orderedWindowSpaceIds contains duplicates.");
    }
    seen.add(windowSpaceId);
  }

  orderedWindowSpaceIds.forEach((windowSpaceId, index) => {
    const windowSpace = windowSpaces[windowSpaceId];
    if (!windowSpace) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    windowSpace.sortIndex = index;
  });
}

function compactWindowSpaceSortIndices(
  windowSpaces: Record<string, WindowSpaceConfig>,
): void {
  const sortedWindowSpaces = sortWindowSpaces(Object.values(windowSpaces));
  for (let index = 0; index < sortedWindowSpaces.length; index += 1) {
    const sortedWindowSpace = sortedWindowSpaces[index];
    if (!sortedWindowSpace) {
      continue;
    }
    sortedWindowSpace.sortIndex = index;
  }
}

export function persistWindowSpaceSortOrder(
  projectConfigId: string,
  orderedWindowSpaceIds: Array<string>,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      applyWindowSpaceSortOrder(state, orderedWindowSpaceIds);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_sort_order({
        projectConfigId: nextProjectConfigId,
        orderedWindowSpaceIds,
        frontendOpId,
      }),
  });
}

export function setWindowSpaceName(
  projectConfigId: string,
  windowSpaceId: string,
  name: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      windowSpaces[windowSpaceId].name = name;
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_name({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        name,
        frontendOpId,
      }),
  });
}

export function deleteWindowSpace(
  projectConfigId: string,
  windowSpaceId: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      delete windowSpaces[windowSpaceId];
      compactWindowSpaceSortIndices(windowSpaces);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_delete_window_space({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        frontendOpId,
      }),
  });
}

export function snapshotFloatingWindowsForWindowSpace(
  state: WindowSpaceSnapshotState,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): WindowSpaceState {
  const snapshotWindowsById: WindowSpaceState["windowsById"] = {};
  const snapshotOrder: string[] = [];
  const seen = new Set<string>();
  const orderedInstanceIds = [
    ...state.projectChatWindowing.order,
    ...Object.keys(state.projectChatWindowing.instancesById),
  ];

  for (const instanceId of orderedInstanceIds) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    const instance = state.projectChatWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    if (instance.placement !== ChatWindowPlacementEnum.floating) {
      continue;
    }
    if (instance.isClosed || instance.isMinimized || instance.isMaximized) {
      continue;
    }
    if (
      instance.sectionIdOrNull &&
      !Object.hasOwn(state.sections, instance.sectionIdOrNull)
    ) {
      continue;
    }
    snapshotWindowsById[instanceId] = createWindowSpaceWindow({
      surfaceKind: instance.sectionIdOrNull
        ? WindowSpaceSurfaceKindEnum.section
        : WindowSpaceSurfaceKindEnum.project_chat,
      sectionIdOrNull: instance.sectionIdOrNull,
      mode: instance.mode,
      title: instance.sectionIdOrNull ? null : instance.title,
      chatId: resolveWindowSpaceSnapshotChatId(instance),
      embeddedGitPaneVisible:
        instance.mode === ChatWindowModeEnum.git_graph_mode &&
        instance.sectionIdOrNull === null
          ? isProjectChatGitGraphEmbeddedPaneVisible(
              state.projectConfig.id,
              instanceId,
            )
          : false,
      zIndex: instance.zIndex,
      normalizedBounds: normalizeFloatingBounds(
        instance.bounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    });
    snapshotOrder.push(instanceId);
  }

  return dedupeWindowSpaceSectionBindings(
    createWindowSpaceState({
      windowsById: snapshotWindowsById,
      order: snapshotOrder,
    }),
  );
}

function buildOrderedWindowSpaceInstanceIds(
  state: WindowSpaceState,
): Array<string> {
  const seen = new Set<string>();
  const orderedInstanceIds: Array<string> = [];
  for (const instanceId of state.order) {
    if (!state.windowsById[instanceId] || seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  for (const instanceId of Object.keys(state.windowsById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  return orderedInstanceIds;
}

function shouldPreferWindowSpaceSectionBinding(
  candidateInstanceId: string,
  candidate: NonNullable<WindowSpaceState["windowsById"][string]>,
  currentBestInstanceId: string | null,
  currentBest: NonNullable<WindowSpaceState["windowsById"][string]> | null,
): boolean {
  if (!currentBest || currentBestInstanceId === null) {
    return true;
  }
  if (candidate.zIndex !== currentBest.zIndex) {
    return candidate.zIndex > currentBest.zIndex;
  }
  return candidateInstanceId.localeCompare(currentBestInstanceId) > 0;
}

function dedupeWindowSpaceSectionBindings(
  state: WindowSpaceState,
): WindowSpaceState {
  const orderedInstanceIds = buildOrderedWindowSpaceInstanceIds(state);
  const winningInstanceIdBySectionId = new Map<string, string>();

  for (const instanceId of orderedInstanceIds) {
    const window = state.windowsById[instanceId];
    const sectionId = window?.sectionIdOrNull ?? null;
    if (!window || !sectionId) {
      continue;
    }
    const currentBestInstanceId = winningInstanceIdBySectionId.get(sectionId);
    const currentBest =
      currentBestInstanceId === undefined
        ? null
        : state.windowsById[currentBestInstanceId] ?? null;
    if (
      !shouldPreferWindowSpaceSectionBinding(
        instanceId,
        window,
        currentBestInstanceId ?? null,
        currentBest,
      )
    ) {
      continue;
    }
    winningInstanceIdBySectionId.set(sectionId, instanceId);
  }

  let changed = false;
  const nextWindowsById: WindowSpaceState["windowsById"] = {};
  for (const [instanceId, window] of Object.entries(state.windowsById)) {
    const sectionId = window.sectionIdOrNull ?? null;
    if (
      sectionId &&
      winningInstanceIdBySectionId.get(sectionId) !== instanceId
    ) {
      changed = true;
      continue;
    }
    nextWindowsById[instanceId] = window;
  }
  if (!changed) {
    return state;
  }
  return createWindowSpaceState({
    windowsById: nextWindowsById,
    order: orderedInstanceIds.filter(
      (instanceId) => nextWindowsById[instanceId],
    ),
  });
}

function normalizeWindowSpaceForPersistence(
  state: WindowSpaceSnapshotState,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): WindowSpaceState {
  return snapshotFloatingWindowsForWindowSpace(state, viewport);
}

function resolveWindowSpaceSnapshotChatId(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.mode !== ChatWindowModeEnum.project_ai_mode) {
    return null;
  }
  return instance.chatId ?? null;
}

function resolveRestoredWorkspaceWindowChatId(
  window: NonNullable<WindowSpaceState["windowsById"][string]>,
): string | null | undefined {
  return window.mode === ChatWindowModeEnum.project_ai_mode
    ? window.chatId
    : null;
}

function resolveNextProjectChatWindowInstanceNumber(
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

function allocateFreshProjectChatWindowInstanceId(
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

function buildOrderedProjectChatWindowInstanceIds(
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

function shouldPreferRestoredSectionWindow(
  candidateInstanceId: string,
  candidate: NonNullable<ProjectChatWindowingState["instancesById"][string]>,
  currentBestInstanceId: string | null,
  currentBest: NonNullable<
    ProjectChatWindowingState["instancesById"][string]
  > | null,
): boolean {
  if (!currentBest || currentBestInstanceId === null) {
    return true;
  }
  if (candidate.zIndex !== currentBest.zIndex) {
    return candidate.zIndex > currentBest.zIndex;
  }
  if (candidate.lastFocusedAt !== currentBest.lastFocusedAt) {
    return candidate.lastFocusedAt > currentBest.lastFocusedAt;
  }
  return candidateInstanceId.localeCompare(currentBestInstanceId) > 0;
}

function dedupeRestoredSectionBindings(
  state: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const orderedInstanceIds = buildOrderedProjectChatWindowInstanceIds(state);
  const winningInstanceIdBySectionId = new Map<string, string>();

  for (const instanceId of orderedInstanceIds) {
    const instance = state.instancesById[instanceId];
    const sectionId = instance?.sectionIdOrNull ?? null;
    if (!instance || !sectionId) {
      continue;
    }
    const currentBestInstanceId = winningInstanceIdBySectionId.get(sectionId);
    const currentBest =
      currentBestInstanceId === undefined
        ? null
        : state.instancesById[currentBestInstanceId] ?? null;
    if (
      !shouldPreferRestoredSectionWindow(
        instanceId,
        instance,
        currentBestInstanceId ?? null,
        currentBest,
      )
    ) {
      continue;
    }
    winningInstanceIdBySectionId.set(sectionId, instanceId);
  }

  let changed = false;
  const nextInstancesById: ProjectChatWindowingState["instancesById"] = {};
  for (const [instanceId, instance] of Object.entries(state.instancesById)) {
    const sectionId = instance.sectionIdOrNull ?? null;
    if (
      sectionId &&
      winningInstanceIdBySectionId.get(sectionId) !== instanceId
    ) {
      changed = true;
      continue;
    }
    nextInstancesById[instanceId] = instance;
  }
  if (!changed) {
    return state;
  }
  return createProjectChatWindowingState({
    ...state,
    instancesById: nextInstancesById,
    order: orderedInstanceIds.filter(
      (instanceId) => nextInstancesById[instanceId],
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
  const seen = new Set<string>();
  const orderedInstanceIds = [
    ...windowSpace.order,
    ...Object.keys(windowSpace.windowsById),
  ];

  for (const instanceId of orderedInstanceIds) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    const window = windowSpace.windowsById[instanceId];
    if (!window) {
      continue;
    }
    if (
      window.surfaceKind === WindowSpaceSurfaceKindEnum.section &&
      (!window.sectionIdOrNull ||
        !Object.hasOwn(sections, window.sectionIdOrNull))
    ) {
      continue;
    }
    instancesById[instanceId] = createProjectChatWindowInstance({
      instanceId,
      placement: ChatWindowPlacementEnum.floating,
      mode: window.mode,
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
    order.push(instanceId);
  }

  return dedupeRestoredSectionBindings(
    normalizeProjectChatWindowingState(
      createProjectChatWindowingState({
        instancesById,
        order,
        nextInstanceNumber: resolveNextProjectChatWindowInstanceNumber(order),
      }),
    ),
  );
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
  const snapshot = normalizeWindowSpaceForPersistence(state);
  if (Object.keys(snapshot.windowsById).length === 0) {
    return null;
  }
  const projectConfigSnapshot = state.projectConfig;
  const sectionSnapshot = state.sections;
  const sectionImplSnapshot = state.sectionImpls;
  const sectionVariantSnapshot = state.sectionVariants;
  const syncResponse = await syncProjectChatWindowingState();
  if (!syncResponse || !res200(syncResponse)) {
    const detail = syncResponse ? getErrorDetail(syncResponse.data) : null;
    const statusSuffix =
      syncResponse && typeof syncResponse.status === "number"
        ? ` (${syncResponse.status})`
        : "";
    const detailSuffix = detail ? `: ${detail}` : ".";
    console.error("Failed to sync project chat windowing before saving.", {
      status: syncResponse?.status ?? null,
      detail,
      projectConfigId,
    });
    addTemporaryNotification(
      `Failed to sync window layout before saving${statusSuffix}${detailSuffix}`,
      SettaNotificationTypeEnum.error,
    );
    return null;
  }
  await flushPendingProjectChatWindowingWrites();
  const latestState = useProjectState.getState();
  const syncedWindowing =
    latestState.projectConfig.id === projectConfigId
      ? getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        latestState.projectChatWindowing
      : getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        syncResponse.data;
  const authoritativeSnapshot = snapshotFloatingWindowsForWindowSpace({
    projectChatWindowing: syncedWindowing,
    projectConfig: projectConfigSnapshot,
    sections: sectionSnapshot,
    sectionImpls: sectionImplSnapshot,
    sectionVariants: sectionVariantSnapshot,
  });
  if (Object.keys(authoritativeSnapshot.windowsById).length === 0) {
    return null;
  }
  const nextWindowSpaceName = resolveNextWindowSpaceName(
    getProjectWindowSpaces(projectConfigSnapshot),
  );
  const response = await route_create_window_space({
    projectConfigId,
    state: authoritativeSnapshot,
    name: nextWindowSpaceName,
  });
  if (!res200(response)) {
    const detail = getErrorDetail(response.data);
    const statusSuffix =
      typeof response.status === "number" ? ` (${response.status})` : "";
    const detailSuffix = detail ? `: ${detail}` : ".";
    console.error("Failed to save window space.", {
      status: response.status,
      detail,
      name: nextWindowSpaceName,
      projectConfigId,
    });
    addTemporaryNotification(
      `Failed to save window space${statusSuffix}${detailSuffix}`,
      SettaNotificationTypeEnum.error,
    );
    return null;
  }
  useProjectState.setState((currentState) => {
    if (currentState.projectConfig.id !== projectConfigId) {
      return;
    }
    const windowSpaces = currentState.projectConfig.windowSpaces;
    if (windowSpaces[response.data.id]) {
      return;
    }
    windowSpaces[response.data.id] = response.data;
  });
  return response.data.id;
}
