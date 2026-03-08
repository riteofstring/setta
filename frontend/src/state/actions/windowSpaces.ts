import {
  denormalizeFloatingBounds,
  normalizeFloatingBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { resolveProjectChatFloatingViewport } from "components/ChatWindowing/projectChatViewport";
import { replaceProjectChatWindowingState } from "state/actions/projectChatWindowing";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_create_window_space,
  route_set_window_space_sort_order,
} from "utils/generatedEndpoints";
import {
  ChatWindowPlacementEnum,
  SettaNotificationTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createWindowSpaceConfig,
  createWindowSpaceState,
  createWindowSpaceWindow,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
  type WindowSpaceState,
} from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";
import { sanitizeNameForSlug } from "utils/nameValidation";
import { addTemporaryNotification } from "./notifications";

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
  return projectConfig.windowSpaces ?? {};
}

function ensureProjectWindowSpaces(
  projectConfig: ZustandProjectState["projectConfig"],
): Record<string, WindowSpaceConfig> {
  const existingWindowSpaces = projectConfig.windowSpaces;
  if (existingWindowSpaces) {
    return existingWindowSpaces;
  }
  const nextWindowSpaces: Record<string, WindowSpaceConfig> = {};
  projectConfig.windowSpaces = nextWindowSpaces;
  return nextWindowSpaces;
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
  const windowSpaces = ensureProjectWindowSpaces(state.projectConfig);
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
    windowSpaces[windowSpaceId].sortIndex = index;
  });
}

export function persistWindowSpaceSortOrder(
  projectConfigId: string,
  orderedWindowSpaceIds: Array<string>,
): void {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyWindowSpaceSortOrder(state, orderedWindowSpaceIds);
    },
    send: (frontendOpId) =>
      route_set_window_space_sort_order({
        projectConfigId,
        orderedWindowSpaceIds,
        frontendOpId,
      }),
  });
}

export function snapshotFloatingWindowsForWindowSpace(
  state: Pick<
    ZustandProjectState,
    "projectChatWindowing" | "projectConfig" | "sections"
  >,
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
      title: instance.title,
      chatId: instance.chatId,
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

  return createWindowSpaceState({
    windowsById: snapshotWindowsById,
    order: snapshotOrder,
  });
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
      title: window.title,
      chatId: window.chatId,
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

  return createProjectChatWindowingState({
    instancesById,
    order,
    nextInstanceNumber: resolveNextProjectChatWindowInstanceNumber(order),
  });
}

export function restoreWindowSpaceInWorkspace(windowSpaceId: string): void {
  const state = useProjectState.getState();
  const windowSpaces = getProjectWindowSpaces(state.projectConfig);
  if (!(windowSpaceId in windowSpaces)) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  const restoredFloatingWindowing =
    createProjectChatWindowingStateFromWindowSpace(
      windowSpaces[windowSpaceId],
      state,
    );
  const currentWindowing =
    state.projectChatWindowing ?? createProjectChatWindowingState();
  const preservedInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const preservedOrder: Array<string> = [];

  for (const instanceId of currentWindowing.order) {
    const instance = currentWindowing.instancesById[instanceId];
    if (
      !instance ||
      instance.placement === ChatWindowPlacementEnum.floating ||
      restoredFloatingWindowing.instancesById[instanceId]
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
      instance.placement === ChatWindowPlacementEnum.floating ||
      restoredFloatingWindowing.instancesById[instanceId] ||
      preservedInstancesById[instanceId]
    ) {
      continue;
    }
    preservedInstancesById[instanceId] = instance;
  }

  const instancesById = {
    ...preservedInstancesById,
    ...restoredFloatingWindowing.instancesById,
  };
  const nextWindowing = createProjectChatWindowingState({
    instancesById,
    order: mergeProjectChatWindowSpaceOrder(
      preservedOrder,
      restoredFloatingWindowing.order,
      instancesById,
    ),
    nextInstanceNumber: Math.max(
      currentWindowing.nextInstanceNumber,
      restoredFloatingWindowing.nextInstanceNumber,
    ),
  });
  replaceProjectChatWindowingState(nextWindowing);
}

export async function createWindowSpaceFromCurrentFloatingWindows(): Promise<
  string | null
> {
  const state = useProjectState.getState();
  const snapshot = snapshotFloatingWindowsForWindowSpace(state);
  if (Object.keys(snapshot.windowsById).length === 0) {
    return null;
  }
  const projectConfigId = getCurrProjectConfigId();
  const nextWindowSpaceName = resolveNextWindowSpaceName(
    getProjectWindowSpaces(state.projectConfig),
  );
  const response = await route_create_window_space({
    projectConfigId,
    state: snapshot,
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
    const windowSpaces = ensureProjectWindowSpaces(currentState.projectConfig);
    if (windowSpaces[response.data]) {
      return;
    }
    let nextSortIndex = 0;
    for (const windowSpace of Object.values(windowSpaces)) {
      nextSortIndex = Math.max(nextSortIndex, windowSpace.sortIndex + 1);
    }
    windowSpaces[response.data] = createWindowSpaceConfig({
      id: response.data,
      name: nextWindowSpaceName,
      sortIndex: nextSortIndex,
      windowsById: snapshot.windowsById,
      order: snapshot.order,
    });
  });
  return response.data;
}
