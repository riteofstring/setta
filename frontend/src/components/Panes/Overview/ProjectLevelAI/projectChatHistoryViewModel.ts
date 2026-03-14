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
  ExternalAgentToolTypeEnum,
  type AgentRun,
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import {
  DRAFT_THREAD_ENTRY_ID,
  normalizeUniqueThreadIds,
} from "./projectChatHistoryDragUtils";

export type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

export type ThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

export type ThreadGroupSection = ThreadGroup & {
  entries: Array<ProjectChatHistoryEntry>;
};

export const DRAFT_THREAD_LABEL = "New thread...";
const PROJECT_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS = 5000;
const PROJECT_CHAT_HISTORY_MISSING_SELECTED_CHAT_POLL_INTERVAL_MS = 1500;
const PROJECT_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS = 10000;

export function resolveProjectChatHistoryPollIntervalMs({
  hasLoadError,
  hasRunningHistoryEntry,
  selectedChatMissingFromHistory,
}: {
  hasLoadError: boolean;
  hasRunningHistoryEntry: boolean;
  selectedChatMissingFromHistory: boolean;
}): number | null {
  if (selectedChatMissingFromHistory) {
    return PROJECT_CHAT_HISTORY_MISSING_SELECTED_CHAT_POLL_INTERVAL_MS;
  }
  if (hasRunningHistoryEntry) {
    return PROJECT_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS;
  }
  if (hasLoadError) {
    return PROJECT_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS;
  }
  return null;
}

export function buildProjectChatHistoryDisplayEntries({
  historyEntries,
  draftThread,
  chatId,
  runType,
  engineConfigId,
}: {
  historyEntries: Array<ProjectChatHistoryEntry>;
  draftThread?: { chatId: string | null; groupId: string | null } | null;
  chatId: string | null | undefined;
  runType: ChatRunType | null;
  engineConfigId: string | null;
}): {
  displayEntries: Array<ProjectChatHistoryEntry>;
  syntheticDraftThreadEntry: ProjectChatHistoryEntry | null;
} {
  const displayEntries =
    !draftThread || !draftThread.chatId
      ? historyEntries
      : historyEntries.map((entry) => {
          if (
            entry.chatId !== draftThread.chatId ||
            entry.nameSource !== null
          ) {
            return entry;
          }
          return {
            ...entry,
            label: DRAFT_THREAD_LABEL,
          };
        });
  const hasDraftThreadEntry = Boolean(
    draftThread?.chatId &&
      displayEntries.some((entry) => entry.chatId === draftThread.chatId),
  );
  const syntheticDraftThreadEntry =
    !draftThread || (draftThread.chatId !== null && hasDraftThreadEntry)
      ? null
      : {
          chatId: DRAFT_THREAD_ENTRY_ID,
          label: DRAFT_THREAD_LABEL,
          nameSource: null,
          lastUpdatedMs: Number.MAX_SAFE_INTEGER,
          waitingForResponse: chatId === null,
          runType,
          engineConfigId,
        };
  return {
    displayEntries,
    syntheticDraftThreadEntry,
  };
}

export function buildProjectChatHistorySearchState({
  agentRuns,
  displayEntries,
  syntheticDraftThreadEntry,
  masterSearchInput,
}: {
  agentRuns: Array<AgentRun>;
  displayEntries: Array<ProjectChatHistoryEntry>;
  syntheticDraftThreadEntry: ProjectChatHistoryEntry | null;
  masterSearchInput: string;
}): {
  normalizedMasterSearchTerms: Array<string>;
  hasMasterSearch: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  sortedEntries: Array<ProjectChatHistoryEntry>;
} {
  const normalizedMasterSearchTerms =
    tokenizeConversationSearchQuery(masterSearchInput);
  const hasMasterSearch = normalizedMasterSearchTerms.length > 0;
  const searchableTextByChatId = new Map<string, string>();
  if (hasMasterSearch) {
    const candidateChatIds = new Set(
      displayEntries.map((entry) => entry.chatId),
    );
    if (candidateChatIds.size > 0) {
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
        searchableTextByChatId.set(chatId, segments.join("\n"));
      }
    }
  }

  const masterSearchMatchCountByChatId = new Map<string, number>();
  if (hasMasterSearch) {
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
      masterSearchMatchCountByChatId.set(entry.chatId, matchCount);
    }
    if (syntheticDraftThreadEntry) {
      const draftMatchCount = countConversationSearchTextMatches(
        syntheticDraftThreadEntry.label,
        normalizedMasterSearchTerms,
      );
      if (draftMatchCount > 0) {
        masterSearchMatchCountByChatId.set(
          syntheticDraftThreadEntry.chatId,
          draftMatchCount,
        );
      }
    }
  }

  const searchableDisplayEntries = hasMasterSearch
    ? displayEntries.filter((entry) => {
        const searchableText =
          searchableTextByChatId.get(entry.chatId) ?? entry.label;
        return matchesConversationSearchText(
          searchableText,
          normalizedMasterSearchTerms,
        );
      })
    : displayEntries;

  const sortedEntries = [...searchableDisplayEntries];
  const shouldIncludeSyntheticDraft =
    syntheticDraftThreadEntry &&
    (!hasMasterSearch ||
      matchesConversationSearchText(
        syntheticDraftThreadEntry.label,
        normalizedMasterSearchTerms,
      ));
  if (shouldIncludeSyntheticDraft) {
    sortedEntries.push(syntheticDraftThreadEntry);
  }
  sortedEntries.sort((left, right) => right.lastUpdatedMs - left.lastUpdatedMs);

  return {
    normalizedMasterSearchTerms,
    hasMasterSearch,
    masterSearchMatchCountByChatId,
    sortedEntries,
  };
}

export function buildProjectChatThreadSections({
  visibleSortedEntries,
  draftThread,
  threadGroups,
  threadAssignments,
  threadOrderIds,
  pinnedThreadIds,
}: {
  visibleSortedEntries: Array<ProjectChatHistoryEntry>;
  draftThread?: { chatId: string | null; groupId: string | null } | null;
  threadGroups: Array<ThreadGroup>;
  threadAssignments: Record<string, string | null | undefined>;
  threadOrderIds: Array<string>;
  pinnedThreadIds: Array<string>;
}): {
  groupSections: Array<ThreadGroupSection>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
} {
  const groupsById = new Map<string, ThreadGroup>();
  threadGroups.forEach((group) => {
    groupsById.set(group.id, group);
  });
  const pinnedThreadIdsSet = new Set(pinnedThreadIds);
  const normalizedThreadOrder = normalizeUniqueThreadIds(threadOrderIds);
  const threadOrderIndexById = new Map<string, number>();
  for (let index = 0; index < normalizedThreadOrder.length; index += 1) {
    const threadId = normalizedThreadOrder[index];
    if (!threadId) {
      continue;
    }
    threadOrderIndexById.set(threadId, index);
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
  const ungroupedEntries: Array<ProjectChatHistoryEntry> = [];
  const draftGroupId = draftThread?.groupId ?? null;

  for (const entry of visibleSortedEntries) {
    const groupId =
      entry.chatId === DRAFT_THREAD_ENTRY_ID && draftGroupId
        ? draftGroupId
        : threadAssignments[entry.chatId] ?? null;
    if (!groupId || !groupsById.has(groupId)) {
      ungroupedEntries.push(entry);
      continue;
    }
    const groupEntries = entriesByGroupId.get(groupId);
    if (groupEntries) {
      groupEntries.push(entry);
    } else {
      entriesByGroupId.set(groupId, [entry]);
    }
  }

  return {
    groupSections: threadGroups.map((group) => {
      return {
        ...group,
        pinned: group.pinned ?? false,
        entries: sortThreadEntries(entriesByGroupId.get(group.id) ?? []),
      };
    }),
    ungroupedEntries: sortThreadEntries(ungroupedEntries),
  };
}

export function buildOrderedVisibleThreadIds({
  searchableGroupSections,
  ungroupedEntries,
}: {
  searchableGroupSections: Array<ThreadGroupSection>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
}): Array<string> {
  const nextIds: Array<string> = [];
  for (const section of searchableGroupSections) {
    for (const entry of section.entries) {
      if (entry.chatId === DRAFT_THREAD_ENTRY_ID) {
        continue;
      }
      nextIds.push(entry.chatId);
    }
  }
  for (const entry of ungroupedEntries) {
    if (entry.chatId === DRAFT_THREAD_ENTRY_ID) {
      continue;
    }
    nextIds.push(entry.chatId);
  }
  return normalizeUniqueThreadIds(nextIds);
}

export function buildThreadAgentBadgeLabelByChatId({
  visibleSortedEntries,
  engineConfigs,
  externalAgentConfigs,
}: {
  visibleSortedEntries: Array<ProjectChatHistoryEntry>;
  engineConfigs: Array<EngineConfig>;
  externalAgentConfigs: Array<ExternalAgentConfig>;
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
    return null;
  }
  return null;
}
