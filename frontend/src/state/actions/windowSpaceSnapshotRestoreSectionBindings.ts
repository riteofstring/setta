import {
  createProjectChatWindowingState,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

import { buildOrderedProjectChatWindowInstanceIds } from "./windowSpaceSnapshotRestoreInstanceIds";

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
