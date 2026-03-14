import {
  denormalizeFloatingBounds,
  normalizeFloatingBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { resolveProjectChatFloatingViewport } from "components/ChatWindowing/projectChatViewport";
import { isProjectChatGitGraphEmbeddedPaneVisible } from "state/actions/projectChatWindowingEphemeral";
import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingState";
import type { ZustandProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
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

function resolveAuthoringFloatingViewport(): AuthoringFloatingViewport {
  return resolveProjectChatFloatingViewport();
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

export function dedupeRestoredSectionBindings(
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
