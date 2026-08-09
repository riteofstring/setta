import {
  type ProjectChatHistoryEntry,
  type ThreadGroup,
  type ThreadGroupSection,
  normalizeUniqueThreadIds,
} from "./projectChatHistoryShared";

export function buildGroupedThreadSections({
  draftGroupId,
  pinnedThreadIds,
  visibleSortedEntries,
  threadAssignments,
  threadGroups,
  threadOrderIds,
}: {
  draftGroupId: string | null;
  pinnedThreadIds: Array<string>;
  visibleSortedEntries: Array<ProjectChatHistoryEntry>;
  threadAssignments: Record<string, string | null | undefined>;
  threadGroups: Array<ThreadGroup>;
  threadOrderIds: Array<string>;
}): {
  groupSections: Array<ThreadGroupSection>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
} {
  const groupsById = buildThreadGroupMap(threadGroups);
  const pinnedThreadIdsSet = new Set(pinnedThreadIds);
  const threadOrderIndexById = buildThreadOrderIndexById(threadOrderIds);
  const entriesByGroupId = new Map<string, Array<ProjectChatHistoryEntry>>();
  const ungroupedEntries: Array<ProjectChatHistoryEntry> = [];

  for (const entry of visibleSortedEntries) {
    const groupId = resolveEntryGroupId({
      draftGroupId,
      entry,
      threadAssignments,
    });
    if (!groupId || !groupsById.has(groupId)) {
      ungroupedEntries.push(entry);
      continue;
    }
    const groupEntries = entriesByGroupId.get(groupId);
    if (groupEntries) {
      groupEntries.push(entry);
      continue;
    }
    entriesByGroupId.set(groupId, [entry]);
  }

  return {
    groupSections: threadGroups.map((group) => ({
      ...group,
      pinned: group.pinned ?? false,
      entries: sortThreadEntries({
        entries: entriesByGroupId.get(group.id) ?? [],
        pinnedThreadIdsSet,
        threadOrderIndexById,
      }),
    })),
    ungroupedEntries: sortThreadEntries({
      entries: ungroupedEntries,
      pinnedThreadIdsSet,
      threadOrderIndexById,
    }),
  };
}

export function partitionEntriesByPinned({
  entries,
  pinnedThreadIdsSet,
}: {
  entries: Array<ProjectChatHistoryEntry>;
  pinnedThreadIdsSet: Set<string>;
}): {
  pinnedEntries: Array<ProjectChatHistoryEntry>;
  unpinnedEntries: Array<ProjectChatHistoryEntry>;
} {
  const pinnedEntries: Array<ProjectChatHistoryEntry> = [];
  const unpinnedEntries: Array<ProjectChatHistoryEntry> = [];
  for (const entry of entries) {
    if (pinnedThreadIdsSet.has(entry.chatId)) {
      pinnedEntries.push(entry);
      continue;
    }
    unpinnedEntries.push(entry);
  }
  return { pinnedEntries, unpinnedEntries };
}

function buildThreadGroupMap(
  threadGroups: Array<ThreadGroup>,
): Map<string, ThreadGroup> {
  const groupsById = new Map<string, ThreadGroup>();
  for (const group of threadGroups) {
    groupsById.set(group.id, group);
  }
  return groupsById;
}

function buildThreadOrderIndexById(
  threadOrderIds: Array<string>,
): Map<string, number> {
  const orderIndexById = new Map<string, number>();
  const normalizedThreadOrder = normalizeUniqueThreadIds(threadOrderIds);
  for (const [index, threadId] of normalizedThreadOrder.entries()) {
    orderIndexById.set(threadId, index);
  }
  return orderIndexById;
}

function resolveEntryGroupId({
  draftGroupId,
  entry,
  threadAssignments,
}: {
  draftGroupId: string | null;
  entry: ProjectChatHistoryEntry;
  threadAssignments: Record<string, string | null | undefined>;
}): string | null {
  if (entry.chatId === "__setta_project_chat_draft_thread__" && draftGroupId) {
    return draftGroupId;
  }
  return threadAssignments[entry.chatId] ?? null;
}

function sortThreadEntries({
  entries,
  pinnedThreadIdsSet,
  threadOrderIndexById,
}: {
  entries: Array<ProjectChatHistoryEntry>;
  pinnedThreadIdsSet: Set<string>;
  threadOrderIndexById: Map<string, number>;
}): Array<ProjectChatHistoryEntry> {
  return [...entries].sort((left, right) =>
    compareThreadEntries({
      left,
      right,
      pinnedThreadIdsSet,
      threadOrderIndexById,
    }),
  );
}

function compareThreadEntries({
  left,
  right,
  pinnedThreadIdsSet,
  threadOrderIndexById,
}: {
  left: ProjectChatHistoryEntry;
  right: ProjectChatHistoryEntry;
  pinnedThreadIdsSet: Set<string>;
  threadOrderIndexById: Map<string, number>;
}): number {
  const leftPinned = pinnedThreadIdsSet.has(left.chatId);
  const rightPinned = pinnedThreadIdsSet.has(right.chatId);
  if (leftPinned !== rightPinned) {
    return leftPinned ? -1 : 1;
  }

  const leftOrderIndex = threadOrderIndexById.get(left.chatId);
  const rightOrderIndex = threadOrderIndexById.get(right.chatId);
  if (leftOrderIndex === undefined && rightOrderIndex === undefined) {
    return right.lastUpdatedMs - left.lastUpdatedMs;
  }
  if (leftOrderIndex === undefined) {
    return 1;
  }
  if (rightOrderIndex === undefined) {
    return -1;
  }
  if (leftOrderIndex !== rightOrderIndex) {
    return leftOrderIndex - rightOrderIndex;
  }
  return right.lastUpdatedMs - left.lastUpdatedMs;
}
