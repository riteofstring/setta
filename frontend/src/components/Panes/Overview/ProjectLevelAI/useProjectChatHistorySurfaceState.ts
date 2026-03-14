import { useMemo } from "react";
import {
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { toThreadGroupDndId } from "./projectChatHistoryDragUtils";
import { isDraftProjectChatHistoryEntry } from "./projectChatHistoryThreadListShared";
import {
  buildOrderedVisibleThreadIds,
  buildProjectChatThreadSections,
  buildThreadAgentBadgeLabelByChatId,
  type ProjectChatHistoryEntry,
  type ThreadGroup,
} from "./projectChatHistoryViewModel";

export function getProjectChatHistoryPlaceholderText({
  initialLoadComplete,
  loadError,
  entryCount,
}: {
  initialLoadComplete: boolean;
  loadError: string | null;
  entryCount: number;
}): string {
  if (loadError) {
    return loadError;
  }
  if (!initialLoadComplete) {
    return "Loading threads...";
  }
  if (entryCount === 0) {
    return "No threads yet";
  }
  return "";
}

export function useProjectChatHistorySurfaceState({
  sortedEntries,
  draftThread,
  threadGroups,
  threadAssignments,
  threadOrderIds,
  viewedThreadIds,
  pinnedThreadIds,
  trashedThreadIds,
  engineConfigs,
  externalAgentConfigs,
  hasMasterSearch,
  initialLoadComplete,
  loadError,
}: {
  sortedEntries: Array<ProjectChatHistoryEntry>;
  draftThread?: { chatId: string | null; groupId: string | null } | null;
  threadGroups: Array<ThreadGroup>;
  threadAssignments: Record<string, string>;
  threadOrderIds: Array<string>;
  viewedThreadIds: Array<string>;
  pinnedThreadIds: Array<string>;
  trashedThreadIds: Array<string>;
  engineConfigs: Array<EngineConfig>;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  hasMasterSearch: boolean;
  initialLoadComplete: boolean;
  loadError: string | null;
}) {
  const viewedThreadIdsSet = useMemo(() => {
    return new Set(viewedThreadIds);
  }, [viewedThreadIds]);

  const pinnedThreadIdsSet = useMemo(() => {
    return new Set(pinnedThreadIds);
  }, [pinnedThreadIds]);

  const trashedThreadIdsSet = useMemo(() => {
    return new Set(trashedThreadIds);
  }, [trashedThreadIds]);

  const visibleSortedEntries = useMemo(() => {
    return sortedEntries.filter(
      (entry) =>
        isDraftProjectChatHistoryEntry(entry) ||
        !trashedThreadIdsSet.has(entry.chatId),
    );
  }, [sortedEntries, trashedThreadIdsSet]);

  const threadAgentBadgeLabelByChatId = useMemo(() => {
    return buildThreadAgentBadgeLabelByChatId({
      visibleSortedEntries,
      engineConfigs,
      externalAgentConfigs,
    });
  }, [engineConfigs, externalAgentConfigs, visibleSortedEntries]);

  const { groupSections, ungroupedEntries } = useMemo(() => {
    return buildProjectChatThreadSections({
      visibleSortedEntries,
      draftThread,
      threadGroups,
      threadAssignments,
      threadOrderIds,
      pinnedThreadIds,
    });
  }, [
    draftThread,
    pinnedThreadIds,
    visibleSortedEntries,
    threadAssignments,
    threadGroups,
    threadOrderIds,
  ]);

  const searchableGroupSections = useMemo(() => {
    if (!hasMasterSearch) {
      return groupSections;
    }
    return groupSections.filter((section) => section.entries.length > 0);
  }, [groupSections, hasMasterSearch]);

  const pinnedSearchableGroupSections = useMemo(() => {
    return searchableGroupSections.filter((section) => section.pinned ?? false);
  }, [searchableGroupSections]);

  const unpinnedSearchableGroupSections = useMemo(() => {
    return searchableGroupSections.filter(
      (section) => !(section.pinned ?? false),
    );
  }, [searchableGroupSections]);

  const pinnedSortableGroupIds = useMemo(() => {
    return pinnedSearchableGroupSections.map((section) => section.id);
  }, [pinnedSearchableGroupSections]);

  const unpinnedSortableGroupIds = useMemo(() => {
    return unpinnedSearchableGroupSections.map((section) => section.id);
  }, [unpinnedSearchableGroupSections]);

  const pinnedSortableGroupDndIds = useMemo(() => {
    return pinnedSortableGroupIds.map((groupId) => toThreadGroupDndId(groupId));
  }, [pinnedSortableGroupIds]);

  const unpinnedSortableGroupDndIds = useMemo(() => {
    return unpinnedSortableGroupIds.map((groupId) =>
      toThreadGroupDndId(groupId),
    );
  }, [unpinnedSortableGroupIds]);

  const groupSortableEnabledById = useMemo(() => {
    const sortableById = new Map<string, boolean>();
    const pinnedSortableEnabled = pinnedSortableGroupIds.length > 1;
    const unpinnedSortableEnabled = unpinnedSortableGroupIds.length > 1;
    for (const groupId of pinnedSortableGroupIds) {
      sortableById.set(groupId, pinnedSortableEnabled);
    }
    for (const groupId of unpinnedSortableGroupIds) {
      sortableById.set(groupId, unpinnedSortableEnabled);
    }
    return sortableById;
  }, [pinnedSortableGroupIds, unpinnedSortableGroupIds]);

  const groupsSortableEnabled =
    !hasMasterSearch &&
    (pinnedSortableGroupIds.length > 1 || unpinnedSortableGroupIds.length > 1);

  const orderedVisibleThreadIds = useMemo(() => {
    return buildOrderedVisibleThreadIds({
      searchableGroupSections,
      ungroupedEntries,
    });
  }, [searchableGroupSections, ungroupedEntries]);

  const threadGroupById = useMemo(() => {
    const next = new Map<string, string | null>();
    for (const threadId of orderedVisibleThreadIds) {
      next.set(threadId, threadAssignments[threadId] ?? null);
    }
    return next;
  }, [orderedVisibleThreadIds, threadAssignments]);

  const threadPinnedById = useMemo(() => {
    const next = new Map<string, boolean>();
    for (const threadId of orderedVisibleThreadIds) {
      next.set(threadId, pinnedThreadIdsSet.has(threadId));
    }
    return next;
  }, [orderedVisibleThreadIds, pinnedThreadIdsSet]);

  const threadsSortableEnabled =
    !hasMasterSearch && orderedVisibleThreadIds.length > 0;

  const placeholderText = useMemo(() => {
    return getProjectChatHistoryPlaceholderText({
      initialLoadComplete,
      loadError,
      entryCount: sortedEntries.length,
    });
  }, [initialLoadComplete, loadError, sortedEntries.length]);

  const hasAnyContent =
    searchableGroupSections.length > 0 || ungroupedEntries.length > 0;
  const emptyStateText = hasMasterSearch
    ? "No conversations match this filter."
    : placeholderText;
  const showNoThreadsPlaceholder =
    !hasAnyContent && emptyStateText === "No threads yet";

  return {
    viewedThreadIdsSet,
    pinnedThreadIdsSet,
    visibleSortedEntries,
    threadAgentBadgeLabelByChatId,
    groupSections,
    searchableGroupSections,
    pinnedSearchableGroupSections,
    unpinnedSearchableGroupSections,
    pinnedSortableGroupIds,
    unpinnedSortableGroupIds,
    pinnedSortableGroupDndIds,
    unpinnedSortableGroupDndIds,
    groupSortableEnabledById,
    groupsSortableEnabled,
    ungroupedEntries,
    orderedVisibleThreadIds,
    threadGroupById,
    threadPinnedById,
    threadsSortableEnabled,
    hasAnyContent,
    emptyStateText,
    showNoThreadsPlaceholder,
  };
}
