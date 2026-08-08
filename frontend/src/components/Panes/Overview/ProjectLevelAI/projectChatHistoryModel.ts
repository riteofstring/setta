import { PointerSensor } from "@dnd-kit/dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRunInputString } from "state/actions/agentRunUtils";
import {
  buildChatHistoryEntries,
  type ChatRunType,
} from "state/actions/chatHistory";
import {
  buildSearchableTextForMessages,
  countConversationSearchTextMatches,
  extractRunMessagesForConversationSearch,
  matchesConversationSearchText,
  tokenizeConversationSearchQuery,
} from "utils/conversationSearch";
import {
  EngineTypeEnum,
  ToolTypeEnum,
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { buildGroupedThreadSections } from "./projectChatHistoryDerived";
import {
  DRAFT_THREAD_ENTRY_ID,
  DRAFT_THREAD_LABEL,
  normalizeUniqueThreadIds,
  type ProjectChatHistoryEntry,
} from "./projectChatHistoryShared";

const THREAD_AGENT_BADGE_LABEL_BY_TOOL_TYPE: Partial<
  Record<ToolTypeEnum, string>
> = {
  [ToolTypeEnum.codex]: "codex",
  [ToolTypeEnum.claude_code]: "claude",
};

export function useProjectChatHistoryModel({
  agentRuns,
  agentRunsInitialLoadComplete,
  agentRunsLoadError,
  chatId,
  draftThread,
  engineConfigId,
  engineConfigs,
  externalAgentConfigs,
  groupsSortableEnabledOverride,
  masterSearchInput,
  projectConfigId,
  runType,
  threadAssignments,
  threadGroups,
  threadListScrollRef,
  threadOrderIds,
  pinnedThreadIds,
  trashedThreadIds,
  viewedThreadIds,
}: {
  agentRuns: ReturnType<typeof buildChatHistoryEntries>;
  agentRunsInitialLoadComplete: boolean;
  agentRunsLoadError: string | null;
  chatId: string | null | undefined;
  draftThread: { chatId: string | null; groupId: string | null } | null;
  engineConfigId: string | null;
  engineConfigs: Array<EngineConfig>;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  groupsSortableEnabledOverride?: boolean;
  masterSearchInput: string;
  projectConfigId: string;
  runType: ChatRunType | null;
  threadAssignments: Record<string, string | null | undefined>;
  threadGroups: Array<{
    id: string;
    name: string;
    collapsed: boolean;
    pinned?: boolean;
  }>;
  threadListScrollRef: React.RefObject<HTMLDivElement | null>;
  threadOrderIds: Array<string>;
  pinnedThreadIds: Array<string>;
  trashedThreadIds: Array<string>;
  viewedThreadIds: Array<string>;
}) {
  const [activeMasterSearchMatchIndex, setActiveMasterSearchMatchIndex] =
    useState<number | null>(null);

  const historyEntries = useMemo(() => {
    return buildChatHistoryEntries(agentRuns, {
      projectConfigId,
      unscopedOnly: true,
    });
  }, [agentRuns, projectConfigId]);
  const displayEntries = useMemo(() => {
    if (!draftThread?.chatId) {
      return historyEntries;
    }
    return historyEntries.map((entry) =>
      entry.chatId === draftThread.chatId && entry.nameSource === null
        ? { ...entry, label: DRAFT_THREAD_LABEL }
        : entry,
    );
  }, [draftThread, historyEntries]);
  const syntheticDraftThreadEntry = useSyntheticDraftThreadEntry({
    chatId,
    displayEntries,
    draftThread,
    engineConfigId,
    runType,
  });
  const normalizedMasterSearchTerms = useMemo(
    () => tokenizeConversationSearchQuery(masterSearchInput),
    [masterSearchInput],
  );
  const hasMasterSearch = normalizedMasterSearchTerms.length > 0;
  const searchableTextByChatId = useMemo(() => {
    if (!hasMasterSearch) {
      return new Map<string, string>();
    }
    return buildSearchableConversationTextMap({
      agentRuns,
      displayEntries,
    });
  }, [agentRuns, displayEntries, hasMasterSearch]);
  const masterSearchMatchCountByChatId = useMemo(() => {
    const countsByChatId = new Map<string, number>();
    if (!hasMasterSearch) {
      return countsByChatId;
    }
    for (const entry of displayEntries) {
      const searchableText =
        searchableTextByChatId.get(entry.chatId) ?? entry.label;
      const matchCount = countConversationSearchTextMatches(
        searchableText,
        normalizedMasterSearchTerms,
      );
      if (matchCount > 0) {
        countsByChatId.set(entry.chatId, matchCount);
      }
    }
    if (syntheticDraftThreadEntry) {
      const draftMatchCount = countConversationSearchTextMatches(
        syntheticDraftThreadEntry.label,
        normalizedMasterSearchTerms,
      );
      if (draftMatchCount > 0) {
        countsByChatId.set(syntheticDraftThreadEntry.chatId, draftMatchCount);
      }
    }
    return countsByChatId;
  }, [
    displayEntries,
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableTextByChatId,
    syntheticDraftThreadEntry,
  ]);
  const searchableDisplayEntries = useMemo(() => {
    if (!hasMasterSearch) {
      return displayEntries;
    }
    return displayEntries.filter((entry) => {
      const searchableText =
        searchableTextByChatId.get(entry.chatId) ?? entry.label;
      return matchesConversationSearchText(
        searchableText,
        normalizedMasterSearchTerms,
      );
    });
  }, [
    displayEntries,
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableTextByChatId,
  ]);
  const sortedEntries = useMemo(() => {
    const nextEntries = [...searchableDisplayEntries];
    if (
      syntheticDraftThreadEntry &&
      (!hasMasterSearch ||
        matchesConversationSearchText(
          syntheticDraftThreadEntry.label,
          normalizedMasterSearchTerms,
        ))
    ) {
      nextEntries.push(syntheticDraftThreadEntry);
    }
    return nextEntries.sort(
      (left, right) => right.lastUpdatedMs - left.lastUpdatedMs,
    );
  }, [
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableDisplayEntries,
    syntheticDraftThreadEntry,
  ]);
  const viewedThreadIdsSet = useMemo(
    () => new Set(viewedThreadIds),
    [viewedThreadIds],
  );
  const pinnedThreadIdsSet = useMemo(
    () => new Set(pinnedThreadIds),
    [pinnedThreadIds],
  );
  const trashedThreadIdsSet = useMemo(
    () => new Set(trashedThreadIds),
    [trashedThreadIds],
  );
  const visibleSortedEntries = useMemo(() => {
    return sortedEntries.filter(
      (entry) =>
        entry.chatId === DRAFT_THREAD_ENTRY_ID ||
        !trashedThreadIdsSet.has(entry.chatId),
    );
  }, [sortedEntries, trashedThreadIdsSet]);
  const threadAgentBadgeLabelByChatId = useMemo(() => {
    const engineConfigById = new Map(
      engineConfigs.map((config) => [config.id, config]),
    );
    const externalAgentConfigById = new Map(
      externalAgentConfigs.map((config) => [config.id, config]),
    );
    const labelByChatId = new Map<string, string>();
    for (const entry of visibleSortedEntries) {
      const label = resolveThreadAgentBadgeLabel({
        entry,
        engineConfigById,
        externalAgentConfigById,
      });
      if (label) {
        labelByChatId.set(entry.chatId, label);
      }
    }
    return labelByChatId;
  }, [engineConfigs, externalAgentConfigs, visibleSortedEntries]);
  const { groupSections, ungroupedEntries } = useMemo(() => {
    return buildGroupedThreadSections({
      draftGroupId: draftThread?.groupId ?? null,
      pinnedThreadIds,
      visibleSortedEntries,
      threadAssignments,
      threadGroups,
      threadOrderIds,
    });
  }, [
    draftThread,
    pinnedThreadIds,
    threadAssignments,
    threadGroups,
    threadOrderIds,
    visibleSortedEntries,
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
  const pinnedSortableGroupIds = useMemo(
    () => pinnedSearchableGroupSections.map((section) => section.id),
    [pinnedSearchableGroupSections],
  );
  const unpinnedSortableGroupIds = useMemo(
    () => unpinnedSearchableGroupSections.map((section) => section.id),
    [unpinnedSearchableGroupSections],
  );
  const pinnedSortableGroupDndIds = useMemo(
    () =>
      pinnedSortableGroupIds.map(
        (groupId) => `project-chat-thread-group::${groupId}`,
      ),
    [pinnedSortableGroupIds],
  );
  const unpinnedSortableGroupDndIds = useMemo(
    () =>
      unpinnedSortableGroupIds.map(
        (groupId) => `project-chat-thread-group::${groupId}`,
      ),
    [unpinnedSortableGroupIds],
  );
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
  const groupsSortableEnabled = resolveGroupsSortableEnabled({
    groupsSortableEnabledOverride,
    hasMasterSearch,
    pinnedGroupCount: pinnedSortableGroupIds.length,
    unpinnedGroupCount: unpinnedSortableGroupIds.length,
  });
  const groupIdSet = useMemo(
    () => new Set(groupSections.map((section) => section.id)),
    [groupSections],
  );
  const orderedVisibleThreadIds = useMemo(() => {
    const nextIds: Array<string> = [];
    for (const section of searchableGroupSections) {
      for (const entry of section.entries) {
        if (entry.chatId !== DRAFT_THREAD_ENTRY_ID) {
          nextIds.push(entry.chatId);
        }
      }
    }
    for (const entry of ungroupedEntries) {
      if (entry.chatId !== DRAFT_THREAD_ENTRY_ID) {
        nextIds.push(entry.chatId);
      }
    }
    return normalizeUniqueThreadIds(nextIds);
  }, [searchableGroupSections, ungroupedEntries]);
  const masterSearchMatchCount = hasMasterSearch
    ? orderedVisibleThreadIds.length
    : 0;
  const masterSearchQueryKey = useMemo(
    () => normalizedMasterSearchTerms.join("\u0000"),
    [normalizedMasterSearchTerms],
  );

  useEffect(() => {
    if (!hasMasterSearch || masterSearchMatchCount === 0) {
      setActiveMasterSearchMatchIndex(null);
      return;
    }
    setActiveMasterSearchMatchIndex(0);
  }, [hasMasterSearch, masterSearchMatchCount, masterSearchQueryKey]);

  useEffect(() => {
    if (masterSearchMatchCount === 0) {
      setActiveMasterSearchMatchIndex(null);
      return;
    }
    setActiveMasterSearchMatchIndex((current) => {
      if (current === null) {
        return 0;
      }
      return current >= masterSearchMatchCount
        ? masterSearchMatchCount - 1
        : current;
    });
  }, [masterSearchMatchCount]);

  const activeMasterSearchMatchThreadId = useMemo(() => {
    if (activeMasterSearchMatchIndex === null) {
      return null;
    }
    return orderedVisibleThreadIds[activeMasterSearchMatchIndex] ?? null;
  }, [activeMasterSearchMatchIndex, orderedVisibleThreadIds]);
  const masterSearchCounterText =
    masterSearchMatchCount > 0 && activeMasterSearchMatchIndex !== null
      ? `${activeMasterSearchMatchIndex + 1}/${masterSearchMatchCount}`
      : `0/${masterSearchMatchCount}`;
  const handleStepMasterSearch = useCallback(
    (direction: "previous" | "next") => {
      if (masterSearchMatchCount === 0) {
        return;
      }
      setActiveMasterSearchMatchIndex((current) => {
        const baseIndex = current ?? 0;
        return direction === "next"
          ? (baseIndex + 1) % masterSearchMatchCount
          : (baseIndex - 1 + masterSearchMatchCount) % masterSearchMatchCount;
      });
    },
    [masterSearchMatchCount],
  );

  useEffect(() => {
    if (!activeMasterSearchMatchThreadId) {
      return;
    }
    const target = threadListScrollRef.current?.querySelector<HTMLElement>(
      `[data-thread-id="${activeMasterSearchMatchThreadId}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMasterSearchMatchThreadId, threadListScrollRef]);

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
  const threadDndSensors = useMemo(() => {
    if (!threadsSortableEnabled && !groupsSortableEnabled) {
      return [];
    }
    return [
      PointerSensor.configure({
        activatorElements: (source: { handle?: Element | null }) => {
          return source.handle ? [source.handle] : [];
        },
        preventActivation: () => false,
      }),
    ];
  }, [groupsSortableEnabled, threadsSortableEnabled]);
  const threadDndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );
  const placeholderText = useMemo(() => {
    return getPlaceholderText(
      agentRunsInitialLoadComplete,
      agentRunsLoadError,
      sortedEntries.length,
    );
  }, [agentRunsInitialLoadComplete, agentRunsLoadError, sortedEntries.length]);
  const panelState = buildThreadPanelState({
    hasMasterSearch,
    placeholderText,
    searchableGroupSectionsLength: searchableGroupSections.length,
    ungroupedEntriesLength: ungroupedEntries.length,
  });

  return {
    activeMasterSearchMatchThreadId,
    emptyStateText: panelState.emptyStateText,
    groupIdSet,
    groupSections,
    groupSortableEnabledById,
    groupsSortableEnabled,
    handleStepMasterSearch,
    hasAnyContent: panelState.hasAnyContent,
    hasMasterSearch,
    masterSearchCounterText,
    masterSearchMatchCount,
    masterSearchMatchCountByChatId,
    orderedVisibleThreadIds,
    pinnedSearchableGroupSections,
    pinnedSortableGroupIds,
    pinnedSortableGroupDndIds,
    pinnedThreadIdsSet,
    placeholderText,
    searchableGroupSections,
    showNoThreadsPlaceholder: panelState.showNoThreadsPlaceholder,
    sortedEntries,
    threadAgentBadgeLabelByChatId,
    threadDndContext,
    threadDndSensors,
    threadGroupById,
    threadPinnedById,
    threadsSortableEnabled,
    ungroupedEntries,
    unpinnedSearchableGroupSections,
    unpinnedSortableGroupIds,
    unpinnedSortableGroupDndIds,
    viewedThreadIdsSet,
  };
}

function useSyntheticDraftThreadEntry({
  chatId,
  displayEntries,
  draftThread,
  engineConfigId,
  runType,
}: {
  chatId: string | null | undefined;
  displayEntries: Array<ProjectChatHistoryEntry>;
  draftThread: { chatId: string | null; groupId: string | null } | null;
  engineConfigId: string | null;
  runType: ChatRunType | null;
}) {
  const hasDraftThreadEntry = useMemo(() => {
    if (!draftThread?.chatId) {
      return false;
    }
    return displayEntries.some((entry) => entry.chatId === draftThread.chatId);
  }, [displayEntries, draftThread]);

  return useMemo<ProjectChatHistoryEntry | null>(() => {
    if (!draftThread || (draftThread.chatId !== null && hasDraftThreadEntry)) {
      return null;
    }
    return {
      chatId: DRAFT_THREAD_ENTRY_ID,
      label: DRAFT_THREAD_LABEL,
      nameSource: null,
      lastUpdatedMs: Number.MAX_SAFE_INTEGER,
      waitingForResponse: chatId === null,
      runType,
      engineConfigId,
    };
  }, [chatId, draftThread, engineConfigId, hasDraftThreadEntry, runType]);
}

function buildSearchableConversationTextMap({
  agentRuns,
  displayEntries,
}: {
  agentRuns: ReturnType<typeof buildChatHistoryEntries>;
  displayEntries: Array<ProjectChatHistoryEntry>;
}): Map<string, string> {
  const byChatId = new Map<string, string>();
  const candidateChatIds = new Set(displayEntries.map((entry) => entry.chatId));
  if (candidateChatIds.size === 0) {
    return byChatId;
  }
  const segmentsByChatId = new Map<string, Array<string>>();
  for (const entry of displayEntries) {
    segmentsByChatId.set(entry.chatId, [entry.label]);
  }
  for (const run of agentRuns) {
    const runChatId = getRunInputString(run, "chatId");
    if (!runChatId || !candidateChatIds.has(runChatId)) {
      continue;
    }
    const runSearchText = buildSearchableTextForMessages(
      extractRunMessagesForConversationSearch(run),
    );
    if (!runSearchText.length) {
      continue;
    }
    segmentsByChatId.get(runChatId)?.push(runSearchText);
  }
  for (const [nextChatId, segments] of segmentsByChatId.entries()) {
    byChatId.set(nextChatId, segments.join("\n"));
  }
  return byChatId;
}

function resolveExternalAgentBadgeLabel(
  engineConfig: EngineConfig,
  externalAgentConfigById: Map<string, ExternalAgentConfig>,
): string | null {
  const externalAgentConfigId = engineConfig.externalAgentConfigId;
  if (!externalAgentConfigId) {
    return null;
  }
  const externalAgentConfig = externalAgentConfigById.get(
    externalAgentConfigId,
  );
  if (!externalAgentConfig) {
    return null;
  }
  return (
    THREAD_AGENT_BADGE_LABEL_BY_TOOL_TYPE[externalAgentConfig.toolType] ?? null
  );
}

function resolveThreadAgentBadgeLabel({
  entry,
  engineConfigById,
  externalAgentConfigById,
}: {
  entry: ProjectChatHistoryEntry;
  engineConfigById: Map<string, EngineConfig>;
  externalAgentConfigById: Map<string, ExternalAgentConfig>;
}): string | null {
  const llmFallbackBadge = entry.runType === "llm_chat" ? "setta" : null;
  const engineConfig = entry.engineConfigId
    ? engineConfigById.get(entry.engineConfigId)
    : undefined;
  if (!engineConfig) {
    return llmFallbackBadge;
  }
  switch (engineConfig.engineType) {
    case EngineTypeEnum.setta_llm:
      return "setta";
    case EngineTypeEnum.external_agent:
      return resolveExternalAgentBadgeLabel(
        engineConfig,
        externalAgentConfigById,
      );
    default:
      return null;
  }
}

function getPlaceholderText(
  initialLoadComplete: boolean,
  loadError: string | null,
  entryCount: number,
): string {
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

function resolveGroupsSortableEnabled({
  groupsSortableEnabledOverride,
  hasMasterSearch,
  pinnedGroupCount,
  unpinnedGroupCount,
}: {
  groupsSortableEnabledOverride?: boolean;
  hasMasterSearch: boolean;
  pinnedGroupCount: number;
  unpinnedGroupCount: number;
}) {
  if (groupsSortableEnabledOverride !== undefined) {
    return groupsSortableEnabledOverride;
  }
  if (hasMasterSearch) {
    return false;
  }
  return pinnedGroupCount > 1 || unpinnedGroupCount > 1;
}

function buildThreadPanelState({
  hasMasterSearch,
  placeholderText,
  searchableGroupSectionsLength,
  ungroupedEntriesLength,
}: {
  hasMasterSearch: boolean;
  placeholderText: string;
  searchableGroupSectionsLength: number;
  ungroupedEntriesLength: number;
}) {
  const hasAnyContent =
    searchableGroupSectionsLength > 0 || ungroupedEntriesLength > 0;
  const emptyStateText = hasMasterSearch
    ? "No conversations match this filter."
    : placeholderText;
  return {
    emptyStateText,
    hasAnyContent,
    showNoThreadsPlaceholder:
      !hasAnyContent && emptyStateText === "No threads yet",
  };
}
