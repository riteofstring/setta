export type StoredThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

export function normalizeProjectConfigId(
  projectConfigId: string,
): string | null {
  const trimmed = projectConfigId.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function normalizeThreadId(threadId: string): string | null {
  const trimmed = threadId.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function normalizeGroupName(groupName: string): string | null {
  const compact = groupName.trim().replace(/\s+/g, " ");
  if (!compact) {
    return null;
  }
  return compact;
}

export function findGroupByNormalizedName(
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

export function normalizeGroupIds(groupIds: Array<string>): Array<string> {
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

export function normalizeThreadIds(threadIds: Array<string>): Array<string> {
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

export function insertThreadIdAtIndex(
  currentIds: Array<string>,
  threadId: string,
  index: number,
): Array<string> {
  const withoutThread = currentIds.filter((id) => id !== threadId);
  const clampedIndex = Math.max(0, Math.min(index, withoutThread.length));
  withoutThread.splice(clampedIndex, 0, threadId);
  return withoutThread;
}

export function insertGroupAtIndex(
  currentGroups: Array<StoredThreadGroup>,
  group: StoredThreadGroup,
  index: number,
): Array<StoredThreadGroup> {
  const withoutGroup = currentGroups.filter((entry) => entry.id !== group.id);
  const clampedIndex = Math.max(0, Math.min(index, withoutGroup.length));
  withoutGroup.splice(clampedIndex, 0, { ...group });
  return withoutGroup;
}

export function areGroupsInSameOrder(
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

export function areThreadIdsInSameOrder(
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
