import { useLocalStorage } from "state/stores/uiPreferenceStores";

import {
  insertGroupAtIndex,
  insertThreadIdAtIndex,
  normalizeProjectConfigId,
  StoredThreadGroup,
} from "./projectChatThreadStorageShared";

export type ProjectChatThreadDeleteUndoInverse = {
  type: "thread_delete";
  threadId: string;
  assignmentGroupId: string | null;
  viewedIndex: number;
  pinnedIndex: number;
  orderIndex: number;
};

export type ProjectChatThreadGroupDeleteUndoInverse = {
  type: "group_delete";
  group: StoredThreadGroup;
  groupIndex: number;
  removedAssignments: Record<string, string>;
};

type ProjectChatThreadStorageUndoInverse =
  | ProjectChatThreadDeleteUndoInverse
  | ProjectChatThreadGroupDeleteUndoInverse;

type ProjectChatThreadStorageUndoEntry = {
  projectConfigId: string;
  inverse: ProjectChatThreadStorageUndoInverse;
};

const PROJECT_CHAT_THREAD_STORAGE_UNDO_LIMIT = 100;
const projectChatThreadStorageUndoStack: Array<ProjectChatThreadStorageUndoEntry> =
  [];

export function pushProjectChatThreadStorageUndoEntry(
  projectConfigId: string,
  inverse: ProjectChatThreadStorageUndoInverse,
) {
  projectChatThreadStorageUndoStack.push({ projectConfigId, inverse });
  if (
    projectChatThreadStorageUndoStack.length >
    PROJECT_CHAT_THREAD_STORAGE_UNDO_LIMIT
  ) {
    projectChatThreadStorageUndoStack.splice(
      0,
      projectChatThreadStorageUndoStack.length -
        PROJECT_CHAT_THREAD_STORAGE_UNDO_LIMIT,
    );
  }
}

function applyProjectChatThreadStorageUndoInverse(
  projectConfigId: string,
  inverse: ProjectChatThreadStorageUndoInverse,
) {
  if (inverse.type === "thread_delete") {
    const resolvedThreadId = inverse.threadId;
    if (!resolvedThreadId) {
      return;
    }
    useLocalStorage.setState((state) => {
      const viewedByProject = state.viewedProjectChatThreadIdsByProjectConfigId;
      const pinnedByProject = state.pinnedProjectChatThreadIdsByProjectConfigId;
      const trashedByProject =
        state.trashedProjectChatThreadIdsByProjectConfigId;
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
    return;
  }

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

export function undoLastProjectChatThreadStorageMutation(
  projectConfigId: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return false;
  }
  let targetIndex = -1;
  for (
    let index = projectChatThreadStorageUndoStack.length - 1;
    index >= 0;
    index -= 1
  ) {
    const entry = projectChatThreadStorageUndoStack[index];
    if (entry?.projectConfigId !== resolvedProjectConfigId) {
      continue;
    }
    targetIndex = index;
    break;
  }
  if (targetIndex < 0) {
    return false;
  }
  const [entry] = projectChatThreadStorageUndoStack.splice(targetIndex, 1);
  if (!entry) {
    return false;
  }
  applyProjectChatThreadStorageUndoInverse(
    resolvedProjectConfigId,
    entry.inverse,
  );
  return true;
}

export function canUndoLastProjectChatThreadStorageMutation(
  projectConfigId: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return false;
  }
  for (
    let index = projectChatThreadStorageUndoStack.length - 1;
    index >= 0;
    index -= 1
  ) {
    const entry = projectChatThreadStorageUndoStack[index];
    if (entry?.projectConfigId === resolvedProjectConfigId) {
      return true;
    }
  }
  return false;
}

export function clearProjectChatThreadStorageUndoStackForTests() {
  projectChatThreadStorageUndoStack.length = 0;
}
