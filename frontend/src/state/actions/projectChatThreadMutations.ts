import { useLocalStorage } from "state/stores/uiPreferenceStores";

import {
  areThreadIdsInSameOrder,
  normalizeProjectConfigId,
  normalizeThreadId,
  normalizeThreadIds,
} from "./projectChatThreadStorageShared";
import {
  ProjectChatThreadDeleteUndoInverse,
  pushProjectChatThreadStorageUndoEntry,
} from "./projectChatThreadStorageUndo";

export function markProjectChatThreadViewed(
  projectConfigId: string,
  threadId: string,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedThreadId = normalizeThreadId(threadId);
  if (!resolvedProjectConfigId || !resolvedThreadId) {
    return;
  }
  useLocalStorage.setState((state) => {
    const viewedByProject = state.viewedProjectChatThreadIdsByProjectConfigId;
    const currentIds = viewedByProject[resolvedProjectConfigId] ?? [];
    if (currentIds.includes(resolvedThreadId)) {
      return state;
    }
    return {
      viewedProjectChatThreadIdsByProjectConfigId: {
        ...viewedByProject,
        [resolvedProjectConfigId]: [...currentIds, resolvedThreadId],
      },
    };
  });
}

export function reorderProjectChatThreads(
  projectConfigId: string,
  orderedThreadIds: Array<string>,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return;
  }
  const normalizedOrderedThreadIds = normalizeThreadIds(orderedThreadIds);
  useLocalStorage.setState((state) => {
    const threadOrderByProject = state.projectChatThreadOrderByProjectConfigId;
    const existingOrder = normalizeThreadIds(
      threadOrderByProject[resolvedProjectConfigId] ?? [],
    );
    const nextOrder: Array<string> = [];
    const added = new Set<string>();
    for (const threadId of normalizedOrderedThreadIds) {
      if (added.has(threadId)) {
        continue;
      }
      nextOrder.push(threadId);
      added.add(threadId);
    }
    for (const threadId of existingOrder) {
      if (added.has(threadId)) {
        continue;
      }
      nextOrder.push(threadId);
      added.add(threadId);
    }
    if (areThreadIdsInSameOrder(existingOrder, nextOrder)) {
      return state;
    }
    return {
      projectChatThreadOrderByProjectConfigId: {
        ...threadOrderByProject,
        [resolvedProjectConfigId]: nextOrder,
      },
    };
  });
}

export function toggleProjectChatThreadPinned(
  projectConfigId: string,
  threadId: string,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedThreadId = normalizeThreadId(threadId);
  if (!resolvedProjectConfigId || !resolvedThreadId) {
    return;
  }
  useLocalStorage.setState((state) => {
    const pinnedByProject = state.pinnedProjectChatThreadIdsByProjectConfigId;
    const currentPinned = normalizeThreadIds(
      pinnedByProject[resolvedProjectConfigId] ?? [],
    );
    const isPinned = currentPinned.includes(resolvedThreadId);
    const nextPinned = isPinned
      ? currentPinned.filter((id) => id !== resolvedThreadId)
      : [...currentPinned, resolvedThreadId];
    return {
      pinnedProjectChatThreadIdsByProjectConfigId: {
        ...pinnedByProject,
        [resolvedProjectConfigId]: nextPinned,
      },
    };
  });
}

export function deleteProjectChatThread(
  projectConfigId: string,
  threadId: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedThreadId = normalizeThreadId(threadId);
  if (!resolvedProjectConfigId || !resolvedThreadId) {
    return false;
  }
  const localState = useLocalStorage.getState();
  const currentTrashed = normalizeThreadIds(
    localState.trashedProjectChatThreadIdsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [],
  );
  if (currentTrashed.includes(resolvedThreadId)) {
    return false;
  }
  const currentAssignments =
    localState.projectChatThreadAssignmentsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? {};
  const currentViewed =
    localState.viewedProjectChatThreadIdsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const currentPinned =
    localState.pinnedProjectChatThreadIdsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const currentOrder =
    localState.projectChatThreadOrderByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const inverse: ProjectChatThreadDeleteUndoInverse = {
    type: "thread_delete",
    threadId: resolvedThreadId,
    assignmentGroupId: currentAssignments[resolvedThreadId] ?? null,
    viewedIndex: currentViewed.indexOf(resolvedThreadId),
    pinnedIndex: currentPinned.indexOf(resolvedThreadId),
    orderIndex: currentOrder.indexOf(resolvedThreadId),
  };
  let didDelete = false;
  useLocalStorage.setState((state) => {
    const trashedByProject = state.trashedProjectChatThreadIdsByProjectConfigId;
    const currentStateTrashed = normalizeThreadIds(
      trashedByProject[resolvedProjectConfigId] ?? [],
    );
    if (currentStateTrashed.includes(resolvedThreadId)) {
      return state;
    }
    const assignmentsByProject =
      state.projectChatThreadAssignmentsByProjectConfigId;
    const currentAssignments =
      assignmentsByProject[resolvedProjectConfigId] ?? {};
    const nextAssignments = { ...currentAssignments };
    if (resolvedThreadId in nextAssignments) {
      delete nextAssignments[resolvedThreadId];
    }
    const viewedByProject = state.viewedProjectChatThreadIdsByProjectConfigId;
    const pinnedByProject = state.pinnedProjectChatThreadIdsByProjectConfigId;
    const orderByProject = state.projectChatThreadOrderByProjectConfigId;
    didDelete = true;
    return {
      trashedProjectChatThreadIdsByProjectConfigId: {
        ...trashedByProject,
        [resolvedProjectConfigId]: [...currentStateTrashed, resolvedThreadId],
      },
      viewedProjectChatThreadIdsByProjectConfigId: {
        ...viewedByProject,
        [resolvedProjectConfigId]: (
          viewedByProject[resolvedProjectConfigId] ?? []
        ).filter((id) => id !== resolvedThreadId),
      },
      pinnedProjectChatThreadIdsByProjectConfigId: {
        ...pinnedByProject,
        [resolvedProjectConfigId]: (
          pinnedByProject[resolvedProjectConfigId] ?? []
        ).filter((id) => id !== resolvedThreadId),
      },
      projectChatThreadOrderByProjectConfigId: {
        ...orderByProject,
        [resolvedProjectConfigId]: (
          orderByProject[resolvedProjectConfigId] ?? []
        ).filter((id) => id !== resolvedThreadId),
      },
      projectChatThreadAssignmentsByProjectConfigId: {
        ...assignmentsByProject,
        [resolvedProjectConfigId]: nextAssignments,
      },
    };
  });
  if (!didDelete) {
    return false;
  }
  pushProjectChatThreadStorageUndoEntry(resolvedProjectConfigId, inverse);
  return true;
}
