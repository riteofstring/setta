import { normalizeFloatingBounds } from "components/ChatWindowing/projectChatSnapLayout";
import { resolveProjectChatFloatingViewport } from "components/ChatWindowing/projectChatViewport";
import { isProjectChatGitGraphEmbeddedPaneVisible } from "state/actions/projectChatWindowingEphemeral";
import type { ZustandProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceState,
  createWindowSpaceWindow,
  type ProjectChatWindowInstance,
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

export function resolveAuthoringFloatingViewport(): AuthoringFloatingViewport {
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
