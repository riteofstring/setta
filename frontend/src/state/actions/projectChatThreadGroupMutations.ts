import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { createNewId } from "utils/idNameCreation";

import {
  areGroupsInSameOrder,
  findGroupByNormalizedName,
  normalizeGroupIds,
  normalizeGroupName,
  normalizeProjectConfigId,
  normalizeThreadId,
} from "./projectChatThreadStorageShared";
import {
  ProjectChatThreadGroupDeleteUndoInverse,
  pushProjectChatThreadStorageUndoEntry,
} from "./projectChatThreadStorageUndo";

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

export function deleteProjectChatThreadGroup(
  projectConfigId: string,
  groupId: string,
): boolean {
  const resolvedProjectConfigId = normalizeProjectConfigId(projectConfigId);
  const resolvedGroupId = normalizeThreadId(groupId);
  if (!resolvedProjectConfigId || !resolvedGroupId) {
    return false;
  }
  const localState = useLocalStorage.getState();
  const existingGroups =
    localState.projectChatThreadGroupsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? [];
  const deletedGroupIndex = existingGroups.findIndex(
    (group) => group.id === resolvedGroupId,
  );
  const deletedGroup = existingGroups[deletedGroupIndex];
  if (!deletedGroup) {
    return false;
  }
  const existingAssignments =
    localState.projectChatThreadAssignmentsByProjectConfigId[
      resolvedProjectConfigId
    ] ?? {};
  const removedAssignments: Record<string, string> = {};
  for (const [threadId, assignedGroupId] of Object.entries(
    existingAssignments,
  )) {
    if (assignedGroupId !== resolvedGroupId) {
      continue;
    }
    removedAssignments[threadId] = assignedGroupId;
  }
  const inverse: ProjectChatThreadGroupDeleteUndoInverse = {
    type: "group_delete",
    group: { ...deletedGroup },
    groupIndex: deletedGroupIndex,
    removedAssignments,
  };
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
  pushProjectChatThreadStorageUndoEntry(resolvedProjectConfigId, inverse);
  return true;
}
