import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  insertGroupAtIndex,
  insertThreadIdAtIndex,
} from "./projectChatThreadStorageShared";
import {
  type ProjectChatThreadDeleteUndoInverse,
  type ProjectChatThreadGroupDeleteUndoInverse,
  type ProjectChatThreadStorageUndoInverse,
  takeLastProjectChatThreadStorageUndoEntry,
} from "./projectChatThreadStorageUndoStack";

function applyProjectChatThreadDeleteUndoInverse(
  projectConfigId: string,
  inverse: ProjectChatThreadDeleteUndoInverse,
) {
  const resolvedThreadId = inverse.threadId;
  if (!resolvedThreadId) {
    return;
  }
  useLocalStorage.setState((state) => {
    const viewedByProject = state.viewedProjectChatThreadIdsByProjectConfigId;
    const pinnedByProject = state.pinnedProjectChatThreadIdsByProjectConfigId;
    const trashedByProject = state.trashedProjectChatThreadIdsByProjectConfigId;
    const orderByProject = state.projectChatThreadOrderByProjectConfigId;
    const assignmentsByProject =
      state.projectChatThreadAssignmentsByProjectConfigId;
    const groups =
      state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [];
    const availableGroupIds = new Set(groups.map((group) => group.id));

    const nextTrashed = (trashedByProject[projectConfigId] ?? []).filter(
      (id) => id !== resolvedThreadId,
    );
    const currentViewed = viewedByProject[projectConfigId] ?? [];
    const nextViewed =
      inverse.viewedIndex >= 0
        ? insertThreadIdAtIndex(
            currentViewed,
            resolvedThreadId,
            inverse.viewedIndex,
          )
        : currentViewed.filter((id) => id !== resolvedThreadId);
    const currentPinned = pinnedByProject[projectConfigId] ?? [];
    const nextPinned =
      inverse.pinnedIndex >= 0
        ? insertThreadIdAtIndex(
            currentPinned,
            resolvedThreadId,
            inverse.pinnedIndex,
          )
        : currentPinned.filter((id) => id !== resolvedThreadId);
    const currentOrder = orderByProject[projectConfigId] ?? [];
    const nextOrder =
      inverse.orderIndex >= 0
        ? insertThreadIdAtIndex(
            currentOrder,
            resolvedThreadId,
            inverse.orderIndex,
          )
        : currentOrder;
    const currentAssignments = assignmentsByProject[projectConfigId] ?? {};
    const nextAssignments = { ...currentAssignments };
    if (
      inverse.assignmentGroupId &&
      availableGroupIds.has(inverse.assignmentGroupId)
    ) {
      nextAssignments[resolvedThreadId] = inverse.assignmentGroupId;
    } else {
      delete nextAssignments[resolvedThreadId];
    }

    return {
      viewedProjectChatThreadIdsByProjectConfigId: {
        ...viewedByProject,
        [projectConfigId]: nextViewed,
      },
      projectChatThreadAssignmentsByProjectConfigId: {
        ...assignmentsByProject,
        [projectConfigId]: nextAssignments,
      },
      projectChatThreadOrderByProjectConfigId: {
        ...orderByProject,
        [projectConfigId]: nextOrder,
      },
      pinnedProjectChatThreadIdsByProjectConfigId: {
        ...pinnedByProject,
        [projectConfigId]: nextPinned,
      },
      trashedProjectChatThreadIdsByProjectConfigId: {
        ...trashedByProject,
        [projectConfigId]: nextTrashed,
      },
    };
  });
}

function applyProjectChatThreadGroupDeleteUndoInverse(
  projectConfigId: string,
  inverse: ProjectChatThreadGroupDeleteUndoInverse,
) {
  useLocalStorage.setState((state) => ({
    projectChatThreadGroupsByProjectConfigId: {
      ...state.projectChatThreadGroupsByProjectConfigId,
      [projectConfigId]: insertGroupAtIndex(
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
        inverse.group,
        inverse.groupIndex,
      ),
    },
    projectChatThreadAssignmentsByProjectConfigId: {
      ...state.projectChatThreadAssignmentsByProjectConfigId,
      [projectConfigId]: (() => {
        const nextAssignments = {
          ...(state.projectChatThreadAssignmentsByProjectConfigId[
            projectConfigId
          ] ?? {}),
        };
        const trashedThreadIds = new Set(
          state.trashedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
            [],
        );
        for (const [threadId, groupId] of Object.entries(
          inverse.removedAssignments,
        )) {
          if (threadId in nextAssignments) {
            continue;
          }
          if (trashedThreadIds.has(threadId)) {
            continue;
          }
          nextAssignments[threadId] = groupId;
        }
        return nextAssignments;
      })(),
    },
  }));
}

function applyProjectChatThreadStorageUndoInverse(
  projectConfigId: string,
  inverse: ProjectChatThreadStorageUndoInverse,
) {
  if (inverse.type === "thread_delete") {
    applyProjectChatThreadDeleteUndoInverse(projectConfigId, inverse);
    return;
  }
  applyProjectChatThreadGroupDeleteUndoInverse(projectConfigId, inverse);
}

export function undoLastProjectChatThreadStorageMutation(
  projectConfigId: string,
): boolean {
  const entry = takeLastProjectChatThreadStorageUndoEntry(projectConfigId);
  if (!entry) {
    return false;
  }
  applyProjectChatThreadStorageUndoInverse(
    entry.projectConfigId,
    entry.inverse,
  );
  return true;
}
