import {
  normalizeProjectConfigId,
  type StoredThreadGroup,
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

export type ProjectChatThreadStorageUndoInverse =
  | ProjectChatThreadDeleteUndoInverse
  | ProjectChatThreadGroupDeleteUndoInverse;

export type ProjectChatThreadStorageUndoEntry = {
  projectConfigId: string;
  inverse: ProjectChatThreadStorageUndoInverse;
};

const PROJECT_CHAT_THREAD_STORAGE_UNDO_LIMIT = 100;
const projectChatThreadStorageUndoStack: Array<ProjectChatThreadStorageUndoEntry> =
  [];

function getLastProjectChatThreadStorageUndoIndex(
  projectConfigId: string,
): number {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return -1;
  }
  for (
    let index = projectChatThreadStorageUndoStack.length - 1;
    index >= 0;
    index -= 1
  ) {
    const entry = projectChatThreadStorageUndoStack[index];
    if (entry?.projectConfigId === resolvedProjectConfigId) {
      return index;
    }
  }
  return -1;
}

export function pushProjectChatThreadStorageUndoEntry(
  projectConfigId: string,
  inverse: ProjectChatThreadStorageUndoInverse,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return;
  }
  projectChatThreadStorageUndoStack.push({
    projectConfigId: resolvedProjectConfigId,
    inverse,
  });
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

export function takeLastProjectChatThreadStorageUndoEntry(
  projectConfigId: string,
): ProjectChatThreadStorageUndoEntry | null {
  const targetIndex = getLastProjectChatThreadStorageUndoIndex(projectConfigId);
  if (targetIndex < 0) {
    return null;
  }
  const [entry] = projectChatThreadStorageUndoStack.splice(targetIndex, 1);
  return entry ?? null;
}

export function canUndoLastProjectChatThreadStorageMutation(
  projectConfigId: string,
): boolean {
  return getLastProjectChatThreadStorageUndoIndex(projectConfigId) >= 0;
}

export function clearProjectChatThreadStorageUndoStackForTests() {
  projectChatThreadStorageUndoStack.length = 0;
}
