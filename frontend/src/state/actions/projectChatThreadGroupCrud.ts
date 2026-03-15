import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { createNewId } from "utils/idNameCreation";

import {
  findGroupByNormalizedName,
  normalizeGroupName,
  normalizeProjectConfigId,
  normalizeThreadId,
} from "./projectChatThreadStorageShared";

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
