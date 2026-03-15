import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { normalizeProjectChatWindowingOrder } from "./projectChatWindowingStateNormalization";

export function shouldSyncActiveProjectChatId(
  window: ProjectChatWindowInstance | null | undefined,
): boolean {
  return (
    window?.mode === ChatWindowModeEnum.project_ai_mode &&
    window.sectionIdOrNull === null
  );
}

function getSectionBindingPlacementPriority(
  placement: ChatWindowPlacement,
): number {
  if (placement === ChatWindowPlacementEnum.canvas_section) {
    return 4;
  }
  if (placement === ChatWindowPlacementEnum.floating) {
    return 3;
  }
  if (placement === ChatWindowPlacementEnum.maximized) {
    return 2;
  }
  return 1;
}

function isProjectChatWindowVisible(
  instance: ProjectChatWindowInstance,
): boolean {
  return !instance.isClosed && !instance.isMinimized;
}

function isPreferredSectionBindingCandidate(
  candidate: ProjectChatWindowInstance,
  currentBest: ProjectChatWindowInstance | null,
): boolean {
  if (!currentBest) {
    return true;
  }
  const candidatePlacementPriority = getSectionBindingPlacementPriority(
    candidate.placement,
  );
  const bestPlacementPriority = getSectionBindingPlacementPriority(
    currentBest.placement,
  );
  if (candidatePlacementPriority !== bestPlacementPriority) {
    return candidatePlacementPriority > bestPlacementPriority;
  }

  const candidateVisible = isProjectChatWindowVisible(candidate);
  const bestVisible = isProjectChatWindowVisible(currentBest);
  if (candidateVisible !== bestVisible) {
    return candidateVisible;
  }

  if (candidate.zIndex !== currentBest.zIndex) {
    return candidate.zIndex > currentBest.zIndex;
  }
  if (candidate.lastFocusedAt !== currentBest.lastFocusedAt) {
    return candidate.lastFocusedAt > currentBest.lastFocusedAt;
  }
  return candidate.instanceId > currentBest.instanceId;
}

export function getProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  let bestMatch: ProjectChatWindowInstance | null = null;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.sectionIdOrNull !== sectionId) {
      continue;
    }
    if (!isPreferredSectionBindingCandidate(instance, bestMatch)) {
      continue;
    }
    bestMatch = instance;
  }
  return bestMatch;
}

export function getProjectChatWindowBindingForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getProjectChatWindowInstanceForSectionInState(state, sectionId);
}

export function getProjectChatWindowModeForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ChatWindowMode {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    return ChatWindowModeEnum.section_mode;
  }
  return boundInstance.mode;
}

export function getOpenExternalProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getExternalProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
    {
      visibleOnly: true,
    },
  );
}

export function getExternalProjectChatWindowBindingForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
): ProjectChatWindowInstance | null {
  return getExternalProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
    {
      visibleOnly: false,
    },
  );
}

function getExternalProjectChatWindowInstanceForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  { visibleOnly }: { visibleOnly: boolean },
): ProjectChatWindowInstance | null {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  let bestMatch: ProjectChatWindowInstance | null = null;
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.sectionIdOrNull !== sectionId) {
      continue;
    }
    if (instance.placement === ChatWindowPlacementEnum.canvas_section) {
      continue;
    }
    if (visibleOnly && (instance.isClosed || instance.isMinimized)) {
      continue;
    }
    if (!isPreferredSectionBindingCandidate(instance, bestMatch)) {
      continue;
    }
    bestMatch = instance;
  }
  return bestMatch;
}

export function getVisibleProjectChatWindowInstances(
  state: ProjectChatWindowingState,
): ProjectChatWindowInstance[] {
  const normalized = normalizeProjectChatWindowingOrder(state).state;
  const visible: ProjectChatWindowInstance[] = [];
  for (const instanceId of normalized.order) {
    const instance = normalized.instancesById[instanceId];
    if (!instance || instance.isClosed || instance.isMinimized) {
      continue;
    }
    visible.push(instance);
  }
  return visible;
}
