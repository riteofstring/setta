import { getRunInputString } from "state/actions/agentRunUtils";
import type {
  ChatHistoryEntry,
  ChatRunType,
} from "state/actions/chatHistoryTypes";
import {
  buildSearchableTextForMessages,
  countConversationSearchTextMatches,
  extractRunMessagesForConversationSearch,
  matchesConversationSearchText,
  tokenizeConversationSearchQuery,
} from "utils/conversationSearch";
import {
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
  type AgentRun,
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";

export type ProjectChatHistoryEntry = ChatHistoryEntry;

export const DRAFT_THREAD_ENTRY_ID = "__setta_project_chat_draft_thread__";
export const DRAFT_THREAD_LABEL = "New thread...";

export type ThreadPinDomain = "pinned" | "unpinned";
export const PINNED_THREAD_DOMAIN: ThreadPinDomain = "pinned";
export const UNPINNED_THREAD_DOMAIN: ThreadPinDomain = "unpinned";

export type ThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

export type ThreadGroupSection = ThreadGroup & {
  entries: Array<ProjectChatHistoryEntry>;
};

type ProjectChatHistoryDraftThread = {
  chatId: string | null;
  groupId: string | null;
} | null;

type ProjectChatHistoryViewModelArgs = {
  activeChatId: string | null | undefined;
  agentRuns: Array<AgentRun>;
  draftThread: ProjectChatHistoryDraftThread;
  engineConfigId: string | null;
  engineConfigs: Array<EngineConfig>;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  historyEntries: Array<ProjectChatHistoryEntry>;
  initialLoadComplete: boolean;
  loadError: string | null;
  masterSearchInput: string;
  pinnedThreadIds: Array<string>;
  runType: ChatRunType | null;
  threadAssignments: Record<string, string | null | undefined>;
  threadGroups: Array<ThreadGroup>;
  threadOrderIds: Array<string>;
  trashedThreadIds: Array<string>;
};

export type ProjectChatHistoryViewModel = {
  groupIdSet: Set<string>;
  groupSections: Array<ThreadGroupSection>;
  groupSortableEnabledById: Map<string, boolean>;
  groupsSortableEnabled: boolean;
  hasMasterSearch: boolean;
  masterSearchMatchCount: number;
  masterSearchMatchCountByChatId: Map<string, number>;
  masterSearchQueryKey: string;
  normalizedMasterSearchTerms: Array<string>;
  orderedVisibleThreadIds: Array<string>;
  pinnedSearchableGroupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupIds: Array<string>;
  placeholderText: string;
  searchableGroupSections: Array<ThreadGroupSection>;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
  unpinnedSearchableGroupSections: Array<ThreadGroupSection>;
  unpinnedSortableGroupIds: Array<string>;
};

export function buildProjectChatHistoryViewModel({
  activeChatId,
  agentRuns,
  draftThread,
  engineConfigId,
  engineConfigs,
  externalAgentConfigs,
  historyEntries,
  initialLoadComplete,
  loadError,
  masterSearchInput,
  pinnedThreadIds,
  runType,
  threadAssignments,
  threadGroups,
  threadOrderIds,
  trashedThreadIds,
}: ProjectChatHistoryViewModelArgs): ProjectChatHistoryViewModel {
  const displayEntries = buildDisplayEntries(historyEntries, draftThread);
  const syntheticDraftThreadEntry = buildSyntheticDraftThreadEntry({
    activeChatId,
    draftThread,
    displayEntries,
    engineConfigId,
    runType,
  });
  const normalizedMasterSearchTerms =
    tokenizeConversationSearchQuery(masterSearchInput);
  const hasMasterSearch = normalizedMasterSearchTerms.length > 0;
  const searchableTextByChatId = buildSearchableTextByChatId({
    agentRuns,
    displayEntries,
    hasMasterSearch,
  });
  const masterSearchMatchCountByChatId = buildMasterSearchMatchCountByChatId({
    displayEntries,
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableTextByChatId,
    syntheticDraftThreadEntry,
  });
  const searchableDisplayEntries = buildSearchableDisplayEntries({
    displayEntries,
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableTextByChatId,
  });
  const sortedEntries = buildSortedEntries({
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableDisplayEntries,
    syntheticDraftThreadEntry,
  });
  const pinnedThreadIdsSet = new Set(pinnedThreadIds);
  const trashedThreadIdsSet = new Set(trashedThreadIds);
  const visibleSortedEntries = sortedEntries.filter(
    (entry) =>
      isDraftThreadEntry(entry) || !trashedThreadIdsSet.has(entry.chatId),
  );
  const threadAgentBadgeLabelByChatId = buildThreadAgentBadgeLabelByChatId({
    engineConfigs,
    externalAgentConfigs,
    visibleSortedEntries,
  });
  const { groupSections, ungroupedEntries } = buildGroupedEntries({
    draftThread,
    pinnedThreadIdsSet,
    threadAssignments,
    threadGroups,
    threadOrderIds,
    visibleSortedEntries,
  });
  const searchableGroupSections = hasMasterSearch
    ? groupSections.filter((section) => section.entries.length > 0)
    : groupSections;
  const pinnedSearchableGroupSections = searchableGroupSections.filter(
    (section) => section.pinned ?? false,
  );
  const unpinnedSearchableGroupSections = searchableGroupSections.filter(
    (section) => !(section.pinned ?? false),
  );
  const pinnedSortableGroupIds = pinnedSearchableGroupSections.map(
    (section) => section.id,
  );
  const unpinnedSortableGroupIds = unpinnedSearchableGroupSections.map(
    (section) => section.id,
  );
  const groupSortableEnabledById = new Map<string, boolean>();
  const pinnedSortableEnabled = pinnedSortableGroupIds.length > 1;
  const unpinnedSortableEnabled = unpinnedSortableGroupIds.length > 1;
  for (const groupId of pinnedSortableGroupIds) {
    groupSortableEnabledById.set(groupId, pinnedSortableEnabled);
  }
  for (const groupId of unpinnedSortableGroupIds) {
    groupSortableEnabledById.set(groupId, unpinnedSortableEnabled);
  }
  const groupsSortableEnabled =
    !hasMasterSearch &&
    (pinnedSortableGroupIds.length > 1 || unpinnedSortableGroupIds.length > 1);
  const groupIdSet = new Set(groupSections.map((section) => section.id));
  const orderedVisibleThreadIds = normalizeUniqueThreadIds([
    ...searchableGroupSections.flatMap((section) =>
      section.entries
        .filter((entry) => !isDraftThreadEntry(entry))
        .map((entry) => entry.chatId),
    ),
    ...ungroupedEntries
      .filter((entry) => !isDraftThreadEntry(entry))
      .map((entry) => entry.chatId),
  ]);
  const masterSearchMatchCount = hasMasterSearch
    ? orderedVisibleThreadIds.length
    : 0;
  const threadGroupById = new Map<string, string | null>();
  const threadPinnedById = new Map<string, boolean>();
  for (const threadId of orderedVisibleThreadIds) {
    threadGroupById.set(threadId, threadAssignments[threadId] ?? null);
    threadPinnedById.set(threadId, pinnedThreadIdsSet.has(threadId));
  }

  return {
    groupIdSet,
    groupSections,
    groupSortableEnabledById,
    groupsSortableEnabled,
    hasMasterSearch,
    masterSearchMatchCount,
    masterSearchMatchCountByChatId,
    masterSearchQueryKey: normalizedMasterSearchTerms.join("\u0000"),
    normalizedMasterSearchTerms,
    orderedVisibleThreadIds,
    pinnedSearchableGroupSections,
    pinnedSortableGroupIds,
    placeholderText: getProjectChatHistoryPlaceholderText(
      initialLoadComplete,
      loadError,
      sortedEntries.length,
    ),
    searchableGroupSections,
    threadAgentBadgeLabelByChatId,
    threadGroupById,
    threadPinnedById,
    ungroupedEntries,
    unpinnedSearchableGroupSections,
    unpinnedSortableGroupIds,
  };
}

function buildDisplayEntries(
  historyEntries: Array<ProjectChatHistoryEntry>,
  draftThread: ProjectChatHistoryDraftThread,
): Array<ProjectChatHistoryEntry> {
  if (!draftThread || !draftThread.chatId) {
    return historyEntries;
  }
  return historyEntries.map((entry) => {
    if (entry.chatId !== draftThread.chatId || entry.nameSource !== null) {
      return entry;
    }
    return {
      ...entry,
      label: DRAFT_THREAD_LABEL,
    };
  });
}

function buildSyntheticDraftThreadEntry({
  activeChatId,
  draftThread,
  displayEntries,
  engineConfigId,
  runType,
}: {
  activeChatId: string | null | undefined;
  draftThread: ProjectChatHistoryDraftThread;
  displayEntries: Array<ProjectChatHistoryEntry>;
  engineConfigId: string | null;
  runType: ChatRunType | null;
}): ProjectChatHistoryEntry | null {
  if (!draftThread) {
    return null;
  }
  if (
    draftThread.chatId !== null &&
    displayEntries.some((entry) => entry.chatId === draftThread.chatId)
  ) {
    return null;
  }
  return {
    chatId: DRAFT_THREAD_ENTRY_ID,
    label: DRAFT_THREAD_LABEL,
    nameSource: null,
    lastUpdatedMs: Number.MAX_SAFE_INTEGER,
    waitingForResponse: activeChatId === null,
    runType,
    engineConfigId,
  };
}

function buildSearchableTextByChatId({
  agentRuns,
  displayEntries,
  hasMasterSearch,
}: {
  agentRuns: Array<AgentRun>;
  displayEntries: Array<ProjectChatHistoryEntry>;
  hasMasterSearch: boolean;
}): Map<string, string> {
  const byChatId = new Map<string, string>();
  if (!hasMasterSearch) {
    return byChatId;
  }
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
    const runMessages = extractRunMessagesForConversationSearch(run);
    const runSearchText = buildSearchableTextForMessages(runMessages);
    if (runSearchText.length === 0) {
      continue;
    }
    const existingSegments = segmentsByChatId.get(runChatId);
    if (!existingSegments) {
      continue;
    }
    existingSegments.push(runSearchText);
  }
  for (const [chatId, segments] of segmentsByChatId.entries()) {
    byChatId.set(chatId, segments.join("\n"));
  }
  return byChatId;
}

function buildMasterSearchMatchCountByChatId({
  displayEntries,
  hasMasterSearch,
  normalizedMasterSearchTerms,
  searchableTextByChatId,
  syntheticDraftThreadEntry,
}: {
  displayEntries: Array<ProjectChatHistoryEntry>;
  hasMasterSearch: boolean;
  normalizedMasterSearchTerms: Array<string>;
  searchableTextByChatId: Map<string, string>;
  syntheticDraftThreadEntry: ProjectChatHistoryEntry | null;
}): Map<string, number> {
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
    if (matchCount <= 0) {
      continue;
    }
    countsByChatId.set(entry.chatId, matchCount);
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
}

function buildSearchableDisplayEntries({
  displayEntries,
  hasMasterSearch,
  normalizedMasterSearchTerms,
  searchableTextByChatId,
}: {
  displayEntries: Array<ProjectChatHistoryEntry>;
  hasMasterSearch: boolean;
  normalizedMasterSearchTerms: Array<string>;
  searchableTextByChatId: Map<string, string>;
}): Array<ProjectChatHistoryEntry> {
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
}

function buildSortedEntries({
  hasMasterSearch,
  normalizedMasterSearchTerms,
  searchableDisplayEntries,
  syntheticDraftThreadEntry,
}: {
  hasMasterSearch: boolean;
  normalizedMasterSearchTerms: Array<string>;
  searchableDisplayEntries: Array<ProjectChatHistoryEntry>;
  syntheticDraftThreadEntry: ProjectChatHistoryEntry | null;
}): Array<ProjectChatHistoryEntry> {
  const nextEntries = [...searchableDisplayEntries];
  const shouldIncludeSyntheticDraft =
    syntheticDraftThreadEntry &&
    (!hasMasterSearch ||
      matchesConversationSearchText(
        syntheticDraftThreadEntry.label,
        normalizedMasterSearchTerms,
      ));
  if (shouldIncludeSyntheticDraft) {
    nextEntries.push(syntheticDraftThreadEntry);
  }
  return nextEntries.sort(
    (left, right) => right.lastUpdatedMs - left.lastUpdatedMs,
  );
}

function buildThreadAgentBadgeLabelByChatId({
  engineConfigs,
  externalAgentConfigs,
  visibleSortedEntries,
}: {
  engineConfigs: Array<EngineConfig>;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  visibleSortedEntries: Array<ProjectChatHistoryEntry>;
}): Map<string, string> {
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
    if (!label) {
      continue;
    }
    labelByChatId.set(entry.chatId, label);
  }
  return labelByChatId;
}

function buildGroupedEntries({
  draftThread,
  pinnedThreadIdsSet,
  threadAssignments,
  threadGroups,
  threadOrderIds,
  visibleSortedEntries,
}: {
  draftThread: ProjectChatHistoryDraftThread;
  pinnedThreadIdsSet: Set<string>;
  threadAssignments: Record<string, string | null | undefined>;
  threadGroups: Array<ThreadGroup>;
  threadOrderIds: Array<string>;
  visibleSortedEntries: Array<ProjectChatHistoryEntry>;
}): {
  groupSections: Array<ThreadGroupSection>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
} {
  const groupsById = new Map<string, ThreadGroup>();
  for (const group of threadGroups) {
    groupsById.set(group.id, group);
  }
  const normalizedThreadOrder = normalizeUniqueThreadIds(threadOrderIds);
  const threadOrderIndexById = new Map<string, number>();
  for (let index = 0; index < normalizedThreadOrder.length; index += 1) {
    threadOrderIndexById.set(normalizedThreadOrder[index], index);
  }

  const sortThreadEntries = (entries: Array<ProjectChatHistoryEntry>) => {
    return [...entries].sort((left, right) => {
      const leftPinned = pinnedThreadIdsSet.has(left.chatId);
      const rightPinned = pinnedThreadIdsSet.has(right.chatId);
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }
      const leftOrderIndex = threadOrderIndexById.get(left.chatId);
      const rightOrderIndex = threadOrderIndexById.get(right.chatId);
      if (leftOrderIndex !== undefined || rightOrderIndex !== undefined) {
        if (leftOrderIndex === undefined) {
          return 1;
        }
        if (rightOrderIndex === undefined) {
          return -1;
        }
        if (leftOrderIndex !== rightOrderIndex) {
          return leftOrderIndex - rightOrderIndex;
        }
      }
      return right.lastUpdatedMs - left.lastUpdatedMs;
    });
  };

  const entriesByGroupId = new Map<string, Array<ProjectChatHistoryEntry>>();
  const nextUngroupedEntries: Array<ProjectChatHistoryEntry> = [];
  const draftGroupId = draftThread?.groupId ?? null;

  for (const entry of visibleSortedEntries) {
    const groupId =
      isDraftThreadEntry(entry) && draftGroupId
        ? draftGroupId
        : threadAssignments[entry.chatId] ?? null;
    if (!groupId || !groupsById.has(groupId)) {
      nextUngroupedEntries.push(entry);
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
      entries: sortThreadEntries(entriesByGroupId.get(group.id) ?? []),
    })),
    ungroupedEntries: sortThreadEntries(nextUngroupedEntries),
  };
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
  if (!entry.engineConfigId) {
    return llmFallbackBadge;
  }
  const engineConfig = engineConfigById.get(entry.engineConfigId);
  if (!engineConfig) {
    return llmFallbackBadge;
  }
  if (engineConfig.engineType === EngineTypeEnum.setta_llm) {
    return "setta";
  }
  if (engineConfig.engineType === EngineTypeEnum.external_agent) {
    if (!engineConfig.externalAgentConfigId) {
      return null;
    }
    const externalAgentConfig = externalAgentConfigById.get(
      engineConfig.externalAgentConfigId,
    );
    if (!externalAgentConfig) {
      return null;
    }
    if (externalAgentConfig.toolType === ExternalAgentToolTypeEnum.codex) {
      return "codex";
    }
    if (
      externalAgentConfig.toolType === ExternalAgentToolTypeEnum.claude_code
    ) {
      return "claude";
    }
    if (externalAgentConfig.toolType === ExternalAgentToolTypeEnum.opencode) {
      return "opencode";
    }
  }
  return null;
}

export function isDraftThreadEntry(entry: ProjectChatHistoryEntry): boolean {
  return entry.chatId === DRAFT_THREAD_ENTRY_ID;
}

export function normalizeUniqueThreadIds(
  threadIds: Array<string>,
): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];
  for (const threadId of threadIds) {
    const nextId = threadId.trim();
    if (!nextId || seen.has(nextId)) {
      continue;
    }
    seen.add(nextId);
    normalized.push(nextId);
  }
  return normalized;
}

function getProjectChatHistoryPlaceholderText(
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
