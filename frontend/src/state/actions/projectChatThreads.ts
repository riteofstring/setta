import { useLocalStorage } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

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
  const existing = existingGroups.find(
    (group) => group.name.toLowerCase() === resolvedGroupName.toLowerCase(),
  );
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
          },
        ],
      },
    };
  });
  return groupId;
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
    const groupsById = new Map(existingGroups.map((group) => [group.id, group]));
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
