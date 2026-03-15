import { useLocalStorage } from "state/stores/uiPreferenceStores";

import {
  areGroupsInSameOrder,
  normalizeGroupIds,
  normalizeProjectConfigId,
  normalizeThreadId,
} from "./projectChatThreadStorageShared";

export function toggleProjectChatThreadGroupCollapsed(
  projectConfigId: string,
  groupId: string,
): void {
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
): void {
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

export function reorderProjectChatThreadGroups(
  projectConfigId: string,
  orderedGroupIds: Array<string>,
): void {
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
