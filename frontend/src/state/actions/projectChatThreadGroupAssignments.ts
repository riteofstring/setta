import { useLocalStorage } from "state/stores/uiPreferenceStores";

import {
  normalizeProjectConfigId,
  normalizeThreadId,
} from "./projectChatThreadStorageShared";
import {
  ProjectChatThreadGroupDeleteUndoInverse,
  pushProjectChatThreadStorageUndoEntry,
} from "./projectChatThreadStorageUndoStack";

export function setProjectChatThreadGroupAssignment(
  projectConfigId: string,
  threadId: string,
  groupId: string | null,
): void {
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
