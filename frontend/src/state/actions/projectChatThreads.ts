import { useLocalStorage } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

type StoredThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

type ProjectChatThreadStorageSnapshot = {
  viewedThreadIds: Array<string>;
  threadGroups: Array<StoredThreadGroup>;
  threadAssignments: Record<string, string>;
  threadOrder: Array<string>;
  pinnedThreadIds: Array<string>;
  trashedThreadIds: Array<string>;
};

type ProjectChatThreadStorageUndoEntry = {
  projectConfigId: string;
  snapshot: ProjectChatThreadStorageSnapshot;
};

const PROJECT_CHAT_THREAD_STORAGE_UNDO_LIMIT = 100;
const projectChatThreadStorageUndoStack: Array<ProjectChatThreadStorageUndoEntry> =
  [];

function normalizeProjectConfigId(projectConfigId: string): string | null {
  const trimmed = projectConfigId.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeThreadId(threadId: string): string | null {
  const trimmed = threadId.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeGroupName(groupName: string): string | null {
  const compact = groupName.trim().replace(/\s+/g, " ");
  if (!compact) {
    return null;
  }
  return compact;
}

function findGroupByNormalizedName(
  groups: Array<StoredThreadGroup>,
  normalizedGroupName: string,
): StoredThreadGroup | null {
  const normalizedLowerName = normalizedGroupName.toLowerCase();
  for (const group of groups) {
    if (group.name.toLowerCase() === normalizedLowerName) {
      return group;
    }
  }
  return null;
}

function normalizeGroupIds(groupIds: Array<string>): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];
  for (const groupId of groupIds) {
    const resolvedGroupId = normalizeThreadId(groupId);
    if (!resolvedGroupId || seen.has(resolvedGroupId)) {
      continue;
    }
    seen.add(resolvedGroupId);
    normalized.push(resolvedGroupId);
  }
  return normalized;
}

function normalizeThreadIds(threadIds: Array<string>): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];
  for (const threadId of threadIds) {
    const resolvedThreadId = normalizeThreadId(threadId);
    if (!resolvedThreadId || seen.has(resolvedThreadId)) {
      continue;
    }
    seen.add(resolvedThreadId);
    normalized.push(resolvedThreadId);
  }
  return normalized;
}

function captureProjectChatThreadStorageSnapshot(
  projectConfigId: string,
): ProjectChatThreadStorageSnapshot {
  const localState = useLocalStorage.getState();
  const viewedThreadIds =
    localState.viewedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
    [];
  const threadGroups =
    localState.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [];
  const threadAssignments =
    localState.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
    {};
  const threadOrder =
    localState.projectChatThreadOrderByProjectConfigId[projectConfigId] ?? [];
  const pinnedThreadIds =
    localState.pinnedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
    [];
  const trashedThreadIds =
    localState.trashedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
    [];
  return {
    viewedThreadIds: [...viewedThreadIds],
    threadGroups: threadGroups.map((group) => ({ ...group })),
    threadAssignments: { ...threadAssignments },
    threadOrder: [...threadOrder],
    pinnedThreadIds: [...pinnedThreadIds],
    trashedThreadIds: [...trashedThreadIds],
  };
}

function pushProjectChatThreadStorageUndoEntry(
  projectConfigId: string,
  snapshot: ProjectChatThreadStorageSnapshot,
) {
  projectChatThreadStorageUndoStack.push({ projectConfigId, snapshot });
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

function restoreProjectChatThreadStorageSnapshot(
  projectConfigId: string,
  snapshot: ProjectChatThreadStorageSnapshot,
) {
  useLocalStorage.setState((state) => ({
    viewedProjectChatThreadIdsByProjectConfigId: {
      ...state.viewedProjectChatThreadIdsByProjectConfigId,
      [projectConfigId]: [...snapshot.viewedThreadIds],
    },
    projectChatThreadGroupsByProjectConfigId: {
      ...state.projectChatThreadGroupsByProjectConfigId,
      [projectConfigId]: snapshot.threadGroups.map((group) => ({ ...group })),
    },
    projectChatThreadAssignmentsByProjectConfigId: {
      ...state.projectChatThreadAssignmentsByProjectConfigId,
      [projectConfigId]: { ...snapshot.threadAssignments },
    },
    projectChatThreadOrderByProjectConfigId: {
      ...state.projectChatThreadOrderByProjectConfigId,
      [projectConfigId]: [...snapshot.threadOrder],
    },
    pinnedProjectChatThreadIdsByProjectConfigId: {
      ...state.pinnedProjectChatThreadIdsByProjectConfigId,
      [projectConfigId]: [...snapshot.pinnedThreadIds],
    },
    trashedProjectChatThreadIdsByProjectConfigId: {
      ...state.trashedProjectChatThreadIdsByProjectConfigId,
      [projectConfigId]: [...snapshot.trashedThreadIds],
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
  restoreProjectChatThreadStorageSnapshot(
    resolvedProjectConfigId,
    entry.snapshot,
  );
  return true;
}

export function clearProjectChatThreadStorageUndoStackForTests() {
  projectChatThreadStorageUndoStack.length = 0;
}

function areGroupsInSameOrder(
  left: Array<{ id: string }>,
  right: Array<{ id: string }>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) {
      return false;
    }
  }
  return true;
}

function areThreadIdsInSameOrder(
  left: Array<string>,
  right: Array<string>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

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

export function createProjectChatThreadGroup(
  projectConfigId: string,
  groupName: string,
): string | null {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupName = normalizeGroupName(groupName);
  if (!resolvedProjectConfigId || !resolvedGroupName) {
    return null;
  }

  const existingGroups =
    useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const existing = findGroupByNormalizedName(existingGroups, resolvedGroupName);
  if (existing) {
    return existing.id;
  }

  const groupId = createNewId();
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const groups = groupsByProject[resolvedProjectConfigId] ?? [];
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: [
          ...groups,
          {
            id: groupId,
            name: resolvedGroupName,
            collapsed: false,
            pinned: false,
          },
        ],
      },
    };
  });
  return groupId;
}

export function renameProjectChatThreadGroup(
  projectConfigId: string,
  groupId: string,
  groupName: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupId = normalizeThreadId(groupId);
  const resolvedGroupName = normalizeGroupName(groupName);
  if (!resolvedProjectConfigId || !resolvedGroupId || !resolvedGroupName) {
    return false;
  }

  let didRename = false;
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const groups = groupsByProject[resolvedProjectConfigId] ?? [];
    const target = groups.find((group) => group.id === resolvedGroupId);
    if (!target) {
      return state;
    }
    if (target.name === resolvedGroupName) {
      didRename = true;
      return state;
    }
    const conflictingGroup = findGroupByNormalizedName(
      groups,
      resolvedGroupName,
    );
    if (conflictingGroup && conflictingGroup.id !== resolvedGroupId) {
      return state;
    }
    didRename = true;
    const nextGroups = groups.map((group) => {
      if (group.id !== resolvedGroupId) {
        return group;
      }
      return {
        ...group,
        name: resolvedGroupName,
      };
    });
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: nextGroups,
      },
    };
  });
  return didRename;
}

export function toggleProjectChatThreadGroupCollapsed(
  projectConfigId: string,
  groupId: string,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupId = normalizeThreadId(groupId);
  if (!resolvedProjectConfigId || !resolvedGroupId) {
    return;
  }
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const groups = groupsByProject[resolvedProjectConfigId] ?? [];
    let didToggle = false;
    const nextGroups = groups.map((group) => {
      if (group.id !== resolvedGroupId) {
        return group;
      }
      didToggle = true;
      return {
        ...group,
        collapsed: !group.collapsed,
      };
    });
    if (!didToggle) {
      return state;
    }
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: nextGroups,
      },
    };
  });
}

export function toggleProjectChatThreadGroupPinned(
  projectConfigId: string,
  groupId: string,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupId = normalizeThreadId(groupId);
  if (!resolvedProjectConfigId || !resolvedGroupId) {
    return;
  }
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const groups = groupsByProject[resolvedProjectConfigId] ?? [];
    const targetIndex = groups.findIndex(
      (group) => group.id === resolvedGroupId,
    );
    if (targetIndex < 0) {
      return state;
    }
    const target = groups[targetIndex];
    if (!target) {
      return state;
    }
    const wasPinned = target.pinned ?? false;
    const toggled = { ...target, pinned: !wasPinned };
    const nextGroups = groups.filter((group) => group.id !== resolvedGroupId);
    if (toggled.pinned) {
      nextGroups.unshift(toggled);
    } else {
      const firstUnpinnedIndex = nextGroups.findIndex(
        (group) => !(group.pinned ?? false),
      );
      const insertIndex =
        firstUnpinnedIndex === -1 ? nextGroups.length : firstUnpinnedIndex;
      nextGroups.splice(insertIndex, 0, toggled);
    }
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: nextGroups,
      },
    };
  });
}

export function setProjectChatThreadGroupAssignment(
  projectConfigId: string,
  threadId: string,
  groupId: string | null,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedThreadId = normalizeThreadId(threadId);
  if (!resolvedProjectConfigId || !resolvedThreadId) {
    return;
  }
  const resolvedGroupId =
    groupId === null ? null : normalizeThreadId(groupId ?? "");
  useLocalStorage.setState((state) => {
    const groups =
      state.projectChatThreadGroupsByProjectConfigId[resolvedProjectConfigId] ??
      [];
    const groupsById: Record<string, true> = {};
    for (const group of groups) {
      groupsById[group.id] = true;
    }
    const assignmentsByProject =
      state.projectChatThreadAssignmentsByProjectConfigId;
    const assignments = assignmentsByProject[resolvedProjectConfigId] ?? {};

    const nextAssignments = { ...assignments };
    if (!resolvedGroupId) {
      if (!(resolvedThreadId in nextAssignments)) {
        return state;
      }
      delete nextAssignments[resolvedThreadId];
    } else {
      if (!groupsById[resolvedGroupId]) {
        if (!(resolvedThreadId in nextAssignments)) {
          return state;
        }
        delete nextAssignments[resolvedThreadId];
      } else if (nextAssignments[resolvedThreadId] === resolvedGroupId) {
        return state;
      } else {
        nextAssignments[resolvedThreadId] = resolvedGroupId;
      }
    }

    return {
      projectChatThreadAssignmentsByProjectConfigId: {
        ...assignmentsByProject,
        [resolvedProjectConfigId]: nextAssignments,
      },
    };
  });
}

export function reorderProjectChatThreadGroups(
  projectConfigId: string,
  orderedGroupIds: Array<string>,
) {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  if (!resolvedProjectConfigId) {
    return;
  }
  const normalizedOrderedGroupIds = normalizeGroupIds(orderedGroupIds);
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const existingGroups = groupsByProject[resolvedProjectConfigId] ?? [];
    if (existingGroups.length <= 1) {
      return state;
    }
    const groupsById = new Map(
      existingGroups.map((group) => [group.id, group]),
    );
    const nextGroups: Array<(typeof existingGroups)[number]> = [];
    const addedIds = new Set<string>();
    for (const groupId of normalizedOrderedGroupIds) {
      const group = groupsById.get(groupId);
      if (!group || addedIds.has(groupId)) {
        continue;
      }
      nextGroups.push(group);
      addedIds.add(groupId);
    }
    for (const group of existingGroups) {
      if (addedIds.has(group.id)) {
        continue;
      }
      nextGroups.push(group);
      addedIds.add(group.id);
    }
    if (areGroupsInSameOrder(existingGroups, nextGroups)) {
      return state;
    }
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: nextGroups,
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

export function deleteProjectChatThreadGroup(
  projectConfigId: string,
  groupId: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupId = normalizeThreadId(groupId);
  if (!resolvedProjectConfigId || !resolvedGroupId) {
    return false;
  }
  const existingGroups =
    useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const groupExists = existingGroups.some(
    (group) => group.id === resolvedGroupId,
  );
  if (!groupExists) {
    return false;
  }
  const snapshot = captureProjectChatThreadStorageSnapshot(
    resolvedProjectConfigId,
  );
  let didDelete = false;
  useLocalStorage.setState((state) => {
    const groupsByProject = state.projectChatThreadGroupsByProjectConfigId;
    const groups = groupsByProject[resolvedProjectConfigId] ?? [];
    const nextGroups = groups.filter((group) => group.id !== resolvedGroupId);
    if (nextGroups.length === groups.length) {
      return state;
    }
    const assignmentsByProject =
      state.projectChatThreadAssignmentsByProjectConfigId;
    const assignments = assignmentsByProject[resolvedProjectConfigId] ?? {};
    const nextAssignments: Record<string, string> = {};
    for (const [threadId, assignedGroupId] of Object.entries(assignments)) {
      if (assignedGroupId === resolvedGroupId) {
        continue;
      }
      nextAssignments[threadId] = assignedGroupId;
    }
    didDelete = true;
    return {
      projectChatThreadGroupsByProjectConfigId: {
        ...groupsByProject,
        [resolvedProjectConfigId]: nextGroups,
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
  pushProjectChatThreadStorageUndoEntry(resolvedProjectConfigId, snapshot);
  return true;
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
  const snapshot = captureProjectChatThreadStorageSnapshot(
    resolvedProjectConfigId,
  );
  let didDelete = false;
  useLocalStorage.setState((state) => {
    const trashedByProject = state.trashedProjectChatThreadIdsByProjectConfigId;
    const currentTrashed = normalizeThreadIds(
      trashedByProject[resolvedProjectConfigId] ?? [],
    );
    if (currentTrashed.includes(resolvedThreadId)) {
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
        [resolvedProjectConfigId]: [...currentTrashed, resolvedThreadId],
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
  pushProjectChatThreadStorageUndoEntry(resolvedProjectConfigId, snapshot);
  return true;
}
