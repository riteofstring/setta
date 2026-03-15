import { PointerSensor } from "@dnd-kit/dom";
import { arrayMove } from "@dnd-kit/helpers";
import { useSortableListItem as useDisplacementSortableListItem } from "components/Pages/Project/ViewModeDnd";
import {
  BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  DragDropProvider,
  SortableContext,
  useDroppable,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type SettaCollision,
} from "forks/dnd-kit/adapter";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { FiEdit3, FiTrash2 } from "react-icons/fi";
import {
  MdAdd,
  MdCategory,
  MdChevronLeft,
  MdChevronRight,
  MdPushPin,
  MdRestore,
} from "react-icons/md";
import { RiChatNewFill } from "react-icons/ri";
import { RxDragHandleDots2 } from "react-icons/rx";
import { TbFolder, TbFolderOpen } from "react-icons/tb";
import { getRunInputString } from "state/actions/agentRunUtils";
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import { buildChatHistoryEntries } from "state/actions/chatHistoryEntries";
import type { ChatRunType } from "state/actions/chatHistoryTypes";
import {
  deleteProjectChatThreadGroup,
  setProjectChatThreadGroupAssignment,
} from "state/actions/projectChatThreadGroupAssignments";
import {
  createProjectChatThreadGroup,
  renameProjectChatThreadGroup,
} from "state/actions/projectChatThreadGroupCrud";
import {
  reorderProjectChatThreadGroups,
  toggleProjectChatThreadGroupCollapsed,
  toggleProjectChatThreadGroupPinned,
} from "state/actions/projectChatThreadGroupOrdering";
import {
  deleteProjectChatThread,
  markProjectChatThreadViewed,
  reorderProjectChatThreads,
  toggleProjectChatThreadPinned,
} from "state/actions/projectChatThreadMutations";
import { undoLastProjectChatThreadStorageMutation } from "state/actions/projectChatThreadStorageUndoApply";
import { canUndoLastProjectChatThreadStorageMutation } from "state/actions/projectChatThreadStorageUndoStack";
import { useAIStore, useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
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
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];
const DRAFT_THREAD_ENTRY_ID = "__setta_project_chat_draft_thread__";
const DRAFT_THREAD_LABEL = "New thread...";
const THREAD_DND_PREFIX = "project-chat-thread::";
const THREAD_GROUP_DND_PREFIX = "project-chat-thread-group::";
const THREAD_SECTION_DROP_TARGET_PREFIX = "project-chat-thread-section-drop::";
const THREAD_DROP_TARGET_PREFIX = "project-chat-thread-drop::";
const GROUP_DRAG_RELEASE_THRESHOLD_PX = 4;
const PROJECT_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS = 5000;
const PROJECT_CHAT_HISTORY_MISSING_SELECTED_CHAT_POLL_INTERVAL_MS = 1500;
const PROJECT_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS = 10000;

type ThreadPinDomain = "pinned" | "unpinned";
const PINNED_THREAD_DOMAIN: ThreadPinDomain = "pinned";
const UNPINNED_THREAD_DOMAIN: ThreadPinDomain = "unpinned";

export function getProjectChatDeleteRecoveryTooltipContent(
  target: "thread" | "group",
): string {
  if (target === "group") {
    return "Delete this group and move its chats to Ungrouped. Use Undo Delete in the toolbar to undo.";
  }
  return "Remove this chat from history. Use Undo Delete in the toolbar to undo.";
}

type ThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

type ThreadGroupSection = ThreadGroup & {
  entries: Array<ProjectChatHistoryEntry>;
};

type ThreadDropPlacement = "before" | "after";

type ThreadDropTarget = {
  groupId: string | null;
  targetThreadId: string | null;
  placement: ThreadDropPlacement;
  pinDomain: ThreadPinDomain;
};

function resolveProjectChatHistoryPollIntervalMs({
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

export function ProjectChatHistory({
  chatId,
  setChatId,
  runType,
  engineConfigId,
  inline = false,
  closeOnSelect = true,
  draftThread = null,
  draftWaitingForResponse = false,
  selectedGroupId = null,
  onSelectedGroupChange,
  onStartNewThread,
  onStartNewThreadInGroup,
  onCloseThreadsView,
  headerPortalTarget = null,
}: {
  chatId: string | null | undefined;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  runType: ChatRunType | null;
  engineConfigId: string | null;
  inline?: boolean;
  closeOnSelect?: boolean;
  draftThread?: { chatId: string | null; groupId: string | null } | null;
  draftWaitingForResponse?: boolean;
  selectedGroupId?: string | null;
  onSelectedGroupChange?: (groupId: string | null) => void;
  onStartNewThread?: () => void;
  onStartNewThreadInGroup?: (groupId: string) => void;
  onCloseThreadsView?: () => void;
  headerPortalTarget?: HTMLDivElement | null;
}) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const { agentRuns, agentRunsInitialLoadComplete, agentRunsLoadError } =
    useAIStore(
      (x) => ({
        agentRuns: x.agentRuns,
        agentRunsInitialLoadComplete: x.agentRunsInitialLoadComplete,
        agentRunsLoadError: x.agentRunsLoadError,
      }),
      shallow,
    );
  const { engineConfigs, externalAgentConfigs } = useAIStore(
    (x) => ({
      engineConfigs: x.engineConfigs,
      externalAgentConfigs: x.externalAgentConfigs,
    }),
    shallow,
  );
  const activeThreadWaitingForResponse = useAIStore((state) => {
    if (chatId === null) {
      return draftWaitingForResponse;
    }
    if (typeof chatId !== "string") {
      return false;
    }
    return Boolean(state.chatDetails[chatId]?.waitingForResponse);
  });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showThreadAgentBadges, setShowThreadAgentBadges] = useState(true);
  const [masterSearchInput, setMasterSearchInput] = useState("");
  const [activeMasterSearchMatchIndex, setActiveMasterSearchMatchIndex] =
    useState<number | null>(null);
  const [activeThreadDragId, setActiveThreadDragId] = useState<string | null>(
    null,
  );
  const [threadDragHoverGroupId, setThreadDragHoverGroupId] = useState<
    string | null
  >(null);
  const latestThreadDropTargetRef = useRef<ThreadDropTarget | null>(null);
  const dragPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerMoveListenerRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const threadListScrollRef = useRef<HTMLDivElement | null>(null);
  const {
    threadGroups,
    threadAssignments,
    threadOrderIds,
    viewedThreadIds,
    pinnedThreadIds,
    trashedThreadIds,
  } = useLocalStorage(
    (state) => ({
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      threadOrderIds:
        state.projectChatThreadOrderByProjectConfigId[projectConfigId] ?? [],
      viewedThreadIds:
        state.viewedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
        [],
      pinnedThreadIds:
        state.pinnedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
        [],
      trashedThreadIds:
        state.trashedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
        [],
    }),
    shallow,
  );

  useEffect(() => {
    void loadAgentRuns();
  }, []);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    markProjectChatThreadViewed(projectConfigId, chatId);
  }, [chatId, projectConfigId]);

  const historyEntries = useMemo(() => {
    return buildChatHistoryEntries(agentRuns, {
      projectConfigId,
      unscopedOnly: true,
    });
  }, [agentRuns, projectConfigId]);
  const hasRunningHistoryEntry = useMemo(() => {
    return historyEntries.some((entry) => entry.waitingForResponse);
  }, [historyEntries]);
  const selectedChatMissingFromHistory = useMemo(() => {
    if (typeof chatId !== "string") {
      return false;
    }
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return false;
    }
    return !historyEntries.some((entry) => entry.chatId === normalizedChatId);
  }, [chatId, historyEntries]);
  const historyPollIntervalMs = useMemo(() => {
    return resolveProjectChatHistoryPollIntervalMs({
      hasLoadError: Boolean(agentRunsLoadError),
      hasRunningHistoryEntry,
      selectedChatMissingFromHistory,
    });
  }, [
    agentRunsLoadError,
    hasRunningHistoryEntry,
    selectedChatMissingFromHistory,
  ]);
  useEffect(() => {
    if (historyPollIntervalMs === null) {
      return;
    }
    let intervalId: number | null = null;
    const clearPollingInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPollingIfVisible = () => {
      clearPollingInterval();
      if (document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        void loadAgentRuns();
      }, historyPollIntervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearPollingInterval();
        return;
      }
      void loadAgentRuns();
      startPollingIfVisible();
    };

    void loadAgentRuns();
    startPollingIfVisible();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [historyPollIntervalMs]);
  const displayEntries = useMemo(() => {
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
  }, [draftThread, historyEntries]);
  const hasDraftThreadEntry = useMemo(() => {
    if (!draftThread?.chatId) {
      return false;
    }
    return displayEntries.some((entry) => entry.chatId === draftThread.chatId);
  }, [displayEntries, draftThread]);
  const syntheticDraftThreadEntry =
    useMemo<ProjectChatHistoryEntry | null>(() => {
      if (!draftThread) {
        return null;
      }
      if (draftThread.chatId !== null && hasDraftThreadEntry) {
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
  const engineConfigById = useMemo(() => {
    return new Map(engineConfigs.map((config) => [config.id, config]));
  }, [engineConfigs]);
  const externalAgentConfigById = useMemo(() => {
    return new Map(externalAgentConfigs.map((config) => [config.id, config]));
  }, [externalAgentConfigs]);
  const normalizedMasterSearchTerms = useMemo(
    () => tokenizeConversationSearchQuery(masterSearchInput),
    [masterSearchInput],
  );
  const hasMasterSearch = normalizedMasterSearchTerms.length > 0;
  const searchableTextByChatId = useMemo(() => {
    const byChatId = new Map<string, string>();
    if (!hasMasterSearch) {
      return byChatId;
    }
    const candidateChatIds = new Set(
      displayEntries.map((entry) => entry.chatId),
    );
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
    return nextEntries.sort((a, b) => b.lastUpdatedMs - a.lastUpdatedMs);
  }, [
    hasMasterSearch,
    normalizedMasterSearchTerms,
    searchableDisplayEntries,
    syntheticDraftThreadEntry,
  ]);

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
        isDraftThreadEntry(entry) || !trashedThreadIdsSet.has(entry.chatId),
    );
  }, [sortedEntries, trashedThreadIdsSet]);
  const threadAgentBadgeLabelByChatId = useMemo(() => {
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
  }, [engineConfigById, externalAgentConfigById, visibleSortedEntries]);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const exists = threadGroups.some((group) => group.id === editingGroupId);
    if (!exists) {
      setEditingGroupId(null);
    }
  }, [editingGroupId, threadGroups]);

  const { groupSections, ungroupedEntries } = useMemo(() => {
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
      ungroupedEntries: sortThreadEntries(nextUngroupedEntries),
    };
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

  const groupIdSet = useMemo(() => {
    return new Set(groupSections.map((section) => section.id));
  }, [groupSections]);

  const orderedVisibleThreadIds = useMemo(() => {
    const nextIds: Array<string> = [];
    for (const section of searchableGroupSections) {
      for (const entry of section.entries) {
        if (isDraftThreadEntry(entry)) {
          continue;
        }
        nextIds.push(entry.chatId);
      }
    }
    for (const entry of ungroupedEntries) {
      if (isDraftThreadEntry(entry)) {
        continue;
      }
      nextIds.push(entry.chatId);
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
      if (current >= masterSearchMatchCount) {
        return masterSearchMatchCount - 1;
      }
      return current;
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
        if (direction === "next") {
          return (baseIndex + 1) % masterSearchMatchCount;
        }
        return (
          (baseIndex - 1 + masterSearchMatchCount) % masterSearchMatchCount
        );
      });
    },
    [masterSearchMatchCount],
  );
  useEffect(() => {
    if (!activeMasterSearchMatchThreadId) {
      return;
    }
    const scrollContainer = threadListScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const target = scrollContainer.querySelector<HTMLElement>(
      `[data-thread-id="${activeMasterSearchMatchThreadId}"]`,
    );
    if (!target) {
      return;
    }
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeMasterSearchMatchThreadId]);

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
          if (!source.handle) {
            return [];
          }
          return [source.handle];
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

  const handleCreateGroup = useCallback(() => {
    const groupName = buildDefaultThreadGroupName(
      threadGroups.map((group) => group.name),
    );
    const groupId = createProjectChatThreadGroup(projectConfigId, groupName);
    if (!groupId) {
      return;
    }
    onSelectedGroupChange?.(groupId);
    setEditingGroupId(groupId);
  }, [onSelectedGroupChange, projectConfigId, threadGroups]);

  const handleSelectThread = useCallback(
    (entry: ProjectChatHistoryEntry) => {
      if (isDraftThreadEntry(entry)) {
        setChatId(undefined);
        if (closeOnSelect) {
          onCloseThreadsView?.();
        }
        return;
      }
      setChatId(entry.chatId);
      markProjectChatThreadViewed(projectConfigId, entry.chatId);
      if (!closeOnSelect) {
        return;
      }
      onCloseThreadsView?.();
    },
    [closeOnSelect, onCloseThreadsView, projectConfigId, setChatId],
  );
  const handleStartThreadInGroup = useCallback(
    (groupId: string) => {
      onSelectedGroupChange?.(groupId);
      if (onStartNewThreadInGroup) {
        onStartNewThreadInGroup(groupId);
        return;
      }
      setChatId(undefined);
      if (!closeOnSelect) {
        return;
      }
      onCloseThreadsView?.();
    },
    [
      closeOnSelect,
      onCloseThreadsView,
      onSelectedGroupChange,
      onStartNewThreadInGroup,
      setChatId,
    ],
  );
  const handleStartNewThread = useCallback(() => {
    if (onStartNewThread) {
      onStartNewThread();
      return;
    }
    if (selectedGroupId && onStartNewThreadInGroup) {
      handleStartThreadInGroup(selectedGroupId);
      return;
    }
    setChatId(undefined);
    if (!closeOnSelect) {
      return;
    }
    onCloseThreadsView?.();
  }, [
    closeOnSelect,
    handleStartThreadInGroup,
    onCloseThreadsView,
    onStartNewThread,
    onStartNewThreadInGroup,
    selectedGroupId,
    setChatId,
  ]);

  const handleRenameGroup = useCallback(
    (groupId: string, nextName: string) => {
      return renameProjectChatThreadGroup(projectConfigId, groupId, nextName);
    },
    [projectConfigId],
  );
  const handleMoveThread = useCallback(
    (sourceThreadId: string, dropTarget: ThreadDropTarget) => {
      if (!sourceThreadId || sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
        return;
      }
      if (dropTarget.targetThreadId === sourceThreadId) {
        return;
      }
      const sourceThreadPinned = pinnedThreadIdsSet.has(sourceThreadId);
      const sourceThreadPinDomain = sourceThreadPinned
        ? PINNED_THREAD_DOMAIN
        : UNPINNED_THREAD_DOMAIN;
      if (dropTarget.pinDomain !== sourceThreadPinDomain) {
        return;
      }
      const normalizedThreadOrder = normalizeUniqueThreadIds(threadOrderIds);
      const nextThreadOrder = buildNextThreadOrder({
        sourceThreadId,
        targetThreadId: dropTarget.targetThreadId,
        targetGroupId: dropTarget.groupId,
        placement: dropTarget.placement,
        sourceThreadPinned,
        preferredOrder: normalizedThreadOrder,
        fallbackOrder: orderedVisibleThreadIds,
        threadGroupById: threadGroupById,
        threadPinnedById,
      });
      setProjectChatThreadGroupAssignment(
        projectConfigId,
        sourceThreadId,
        dropTarget.groupId,
      );
      reorderProjectChatThreads(projectConfigId, nextThreadOrder);
      onSelectedGroupChange?.(dropTarget.groupId);
    },
    [
      onSelectedGroupChange,
      orderedVisibleThreadIds,
      pinnedThreadIdsSet,
      projectConfigId,
      threadGroupById,
      threadPinnedById,
      threadOrderIds,
    ],
  );
  const stopPointerTracking = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const listener = dragPointerMoveListenerRef.current;
    if (!listener) {
      return;
    }
    window.removeEventListener("pointermove", listener, true);
    dragPointerMoveListenerRef.current = null;
  }, []);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      latestThreadDropTargetRef.current = null;
      const activeId = String(event.active.id);
      const sourceThreadId = getThreadIdFromDndId(activeId);
      if (sourceThreadId && sourceThreadId !== DRAFT_THREAD_ENTRY_ID) {
        setActiveThreadDragId(sourceThreadId);
      } else {
        setActiveThreadDragId(null);
        setThreadDragHoverGroupId(null);
      }
      stopPointerTracking();
      const pointerStart = getPointerClientPoint(event.activatorEvent);
      dragPointerStartRef.current = pointerStart;
      dragPointerCurrentRef.current = pointerStart;
      const initialHoverGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: pointerStart,
        pointerStart,
        delta: { x: 0, y: 0 },
        groupIdSet,
      });
      setThreadDragHoverGroupId(initialHoverGroupId);
      if (typeof window === "undefined") {
        return;
      }
      const listener = (pointerEvent: PointerEvent) => {
        dragPointerCurrentRef.current = {
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        };
      };
      dragPointerMoveListenerRef.current = listener;
      window.addEventListener("pointermove", listener, true);
    },
    [groupIdSet, stopPointerTracking],
  );
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const sourceThreadId = getThreadIdFromDndId(String(event.active.id));
      if (sourceThreadId === null || sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
        setThreadDragHoverGroupId(null);
        return;
      }
      const hoverGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        groupIdSet,
      });
      setThreadDragHoverGroupId(hoverGroupId);
      const dropTarget = resolveThreadDropTarget({
        event,
        sourceThreadId,
        groupIdSet,
        threadGroupById,
        threadPinnedById,
      });
      if (!dropTarget) {
        return;
      }
      latestThreadDropTargetRef.current = dropTarget;
    },
    [groupIdSet, threadGroupById, threadPinnedById],
  );
  const handleDragCancel = useCallback(() => {
    latestThreadDropTargetRef.current = null;
    setActiveThreadDragId(null);
    setThreadDragHoverGroupId(null);
    dragPointerStartRef.current = null;
    dragPointerCurrentRef.current = null;
    stopPointerTracking();
  }, [stopPointerTracking]);
  useEffect(() => {
    return () => {
      stopPointerTracking();
    };
  }, [stopPointerTracking]);
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      setActiveThreadDragId(null);
      setThreadDragHoverGroupId(null);
      const pointerGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        groupIdSet,
      });
      dragPointerStartRef.current = null;
      dragPointerCurrentRef.current = null;
      stopPointerTracking();
      const sourceThreadId = getThreadIdFromDndId(activeId);
      if (sourceThreadId !== null) {
        const primaryDelta = Math.abs(event.delta.y);
        const secondaryDelta = Math.abs(event.delta.x);
        if (
          primaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX &&
          secondaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX
        ) {
          latestThreadDropTargetRef.current = null;
          return;
        }
        if (sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
          latestThreadDropTargetRef.current = null;
          return;
        }
        const sourceThreadPinDomain = pinnedThreadIdsSet.has(sourceThreadId)
          ? PINNED_THREAD_DOMAIN
          : UNPINNED_THREAD_DOMAIN;
        const dropTarget =
          resolveThreadDropTarget({
            event,
            sourceThreadId,
            groupIdSet,
            threadGroupById,
            threadPinnedById,
          }) ??
          latestThreadDropTargetRef.current ??
          (pointerGroupId !== null
            ? {
                groupId: pointerGroupId,
                targetThreadId: null,
                placement: "after",
                pinDomain: sourceThreadPinDomain,
              }
            : null);
        latestThreadDropTargetRef.current = null;
        if (!dropTarget) {
          return;
        }
        if (pointerGroupId !== null && dropTarget.groupId !== pointerGroupId) {
          handleMoveThread(sourceThreadId, {
            groupId: pointerGroupId,
            targetThreadId: null,
            placement: "after",
            pinDomain: sourceThreadPinDomain,
          });
          return;
        }
        handleMoveThread(sourceThreadId, dropTarget);
        return;
      }

      const sourceGroupId = getThreadGroupIdFromDndId(activeId, groupIdSet);
      if (!sourceGroupId) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const sourceGroupSection = groupSections.find(
        (section) => section.id === sourceGroupId,
      );
      const sourceGroupPinned = sourceGroupSection?.pinned ?? false;
      const sourceGroupPinDomain = sourceGroupPinned
        ? PINNED_THREAD_DOMAIN
        : UNPINNED_THREAD_DOMAIN;
      const pointerInsideSourceDomain = isPointerWithinThreadGroupDomain({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        pinDomain: sourceGroupPinDomain,
      });
      if (pointerInsideSourceDomain === false) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const scopedOrderedGroupIds = sourceGroupPinned
        ? pinnedSortableGroupIds
        : unpinnedSortableGroupIds;
      const scopedGroupIdSet = new Set(scopedOrderedGroupIds);
      if (pointerGroupId !== null && !scopedGroupIdSet.has(pointerGroupId)) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      const overId = event.over ? String(event.over.id) : null;
      if (overId) {
        const overGroupId =
          getThreadGroupIdFromDndId(overId, groupIdSet) ??
          getGroupIdFromThreadSectionDropTargetId(overId, groupIdSet) ??
          (groupIdSet.has(overId) ? overId : null);
        if (overGroupId && !scopedGroupIdSet.has(overGroupId)) {
          latestThreadDropTargetRef.current = null;
          return;
        }
      }
      const nextOrderedGroupIds = resolveNextGroupOrderFromDrag({
        event,
        sourceGroupId,
        orderedGroupIds: scopedOrderedGroupIds,
        groupIdSet: scopedGroupIdSet,
      });
      if (!nextOrderedGroupIds) {
        latestThreadDropTargetRef.current = null;
        return;
      }
      latestThreadDropTargetRef.current = null;
      reorderProjectChatThreadGroups(projectConfigId, [
        ...(sourceGroupPinned ? nextOrderedGroupIds : pinnedSortableGroupIds),
        ...(sourceGroupPinned ? unpinnedSortableGroupIds : nextOrderedGroupIds),
      ]);
    },
    [
      groupSections,
      groupIdSet,
      handleMoveThread,
      pinnedSortableGroupIds,
      pinnedThreadIdsSet,
      projectConfigId,
      stopPointerTracking,
      threadGroupById,
      threadPinnedById,
      unpinnedSortableGroupIds,
    ],
  );
  const handleToggleGroupPinned = useCallback(
    (groupId: string) => {
      toggleProjectChatThreadGroupPinned(projectConfigId, groupId);
    },
    [projectConfigId],
  );
  const handleToggleThreadPinned = useCallback(
    (threadId: string) => {
      toggleProjectChatThreadPinned(projectConfigId, threadId);
    },
    [projectConfigId],
  );
  const handleDeleteThread = useCallback(
    (threadId: string) => {
      const deleted = deleteProjectChatThread(projectConfigId, threadId);
      if (!deleted) {
        return;
      }
      if (chatId === threadId) {
        setChatId(undefined);
      }
    },
    [chatId, projectConfigId, setChatId],
  );
  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const deleted = deleteProjectChatThreadGroup(projectConfigId, groupId);
      if (!deleted) {
        return;
      }
      if (selectedGroupId === groupId) {
        onSelectedGroupChange?.(null);
      }
    },
    [onSelectedGroupChange, projectConfigId, selectedGroupId],
  );
  const handleRestoreDeletedThreadOrGroup = useCallback(() => {
    undoLastProjectChatThreadStorageMutation(projectConfigId);
  }, [projectConfigId]);
  const canUndoDeletedThreadOrGroup =
    canUndoLastProjectChatThreadStorageMutation(projectConfigId);

  const panelClasses = inline
    ? "flex h-full min-h-0 w-full min-w-0 flex-col border-r border-setta-200 bg-setta-50 dark:border-setta-800 dark:bg-setta-900/40"
    : "flex h-full min-h-0 flex-col";

  const hasAnyContent =
    searchableGroupSections.length > 0 || ungroupedEntries.length > 0;
  const emptyStateText = hasMasterSearch
    ? "No conversations match this filter."
    : placeholderText;
  const showNoThreadsPlaceholder =
    !hasAnyContent && emptyStateText === "No threads yet";
  const newGroupTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "New group",
        content: "Create a new thread group and rename it.",
      }),
    [],
  );
  const agentBadgeToggleTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: showThreadAgentBadges
          ? "Hide thread badges"
          : "Show thread badges",
        content: showThreadAgentBadges
          ? "Hide the per-thread engine badge labels."
          : "Show the per-thread engine badge labels.",
      }),
    [showThreadAgentBadges],
  );
  const restoreThreadMutationTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Undo last thread delete",
        content:
          "Undo the most recently deleted thread or thread group in this project.",
      }),
    [],
  );
  const threadsToolbar = (
    <div
      className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap @container"
      data-testid="project-chat-threads-toolbar"
    >
      <search
        className="relative flex min-w-0 flex-1 items-center"
        data-testid="project-chat-master-search"
      >
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 pl-1">
          <i className="gg-sort-az !scale-[0.68] text-setta-300 dark:text-setta-600" />
        </span>
        <input
          type="text"
          aria-label="Search conversations"
          data-testid="project-chat-master-search-input"
          value={masterSearchInput}
          onChange={(event) => {
            setMasterSearchInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") {
              return;
            }
            event.currentTarget.blur();
          }}
          placeholder="Search conversations"
          className={`w-full min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-5 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600 ${
            hasMasterSearch ? "pr-16" : "pr-2"
          }`}
        />
        {hasMasterSearch ? (
          <div className="absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
            <span className="min-w-[34px] px-0.5 text-center text-[10px] text-setta-400 dark:text-setta-500">
              {masterSearchCounterText}
            </span>
            <button
              type="button"
              aria-label="Previous conversation result"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
              onClick={() => handleStepMasterSearch("previous")}
              disabled={masterSearchMatchCount === 0}
            >
              <MdChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next conversation result"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
              onClick={() => handleStepMasterSearch("next")}
              disabled={masterSearchMatchCount === 0}
            >
              <MdChevronRight />
            </button>
          </div>
        ) : null}
      </search>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
        onClick={() => {
          setShowThreadAgentBadges((prev) => !prev);
        }}
        aria-label={
          showThreadAgentBadges
            ? "Hide thread engine badges"
            : "Show thread engine badges"
        }
        aria-pressed={showThreadAgentBadges}
        data-testid="project-chat-thread-agent-badge-toggle-button"
        {...agentBadgeToggleTooltipHandlers}
      >
        <MdCategory size={12} />
      </button>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 disabled:cursor-not-allowed disabled:text-setta-400 disabled:opacity-60 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent dark:disabled:text-setta-500"
        aria-label="Undo Delete"
        onClick={handleRestoreDeletedThreadOrGroup}
        disabled={!canUndoDeletedThreadOrGroup}
        data-testid="project-chat-thread-restore-last-delete-button"
        {...restoreThreadMutationTooltipHandlers}
      >
        <MdRestore size={14} />
        <span className="hidden @[26rem]:inline">Undo Delete</span>
      </button>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
        aria-label="New Group"
        onClick={handleCreateGroup}
        data-testid="project-chat-thread-group-new-group-button"
        {...newGroupTooltipHandlers}
      >
        <MdAdd size={15} />
        <span className="hidden @[20rem]:inline">New Group</span>
      </button>
    </div>
  );

  return (
    <section
      className={`${panelClasses} [&_button]:cursor-pointer`}
      data-testid="project-chat-threads-panel"
      data-inline={inline ? "true" : "false"}
    >
      {headerPortalTarget ? (
        createPortal(
          <div className="flex h-full w-full min-w-0 items-start px-2 pt-2 [&_button]:cursor-pointer">
            {threadsToolbar}
          </div>,
          headerPortalTarget,
        )
      ) : (
        <header className="border-b border-setta-200 px-3 py-2 dark:border-setta-800">
          {threadsToolbar}
        </header>
      )}

      <div
        ref={threadListScrollRef}
        className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2"
      >
        {!hasAnyContent ? (
          showNoThreadsPlaceholder ? (
            <aside
              className="grid h-full min-h-[10rem] w-full place-items-center px-2 py-3"
              data-testid="project-chat-threads-empty-state"
            >
              <div className="flex w-full max-w-[18rem] flex-col items-center gap-2 rounded-xl border border-setta-200 bg-white/70 px-4 py-5 text-center dark:border-setta-700 dark:bg-setta-900/70">
                <RiChatNewFill className="h-10 w-10 text-setta-300 dark:text-setta-600" />
                <h3
                  className="text-sm font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
                  data-testid="project-chat-threads-empty-state-title"
                >
                  <button
                    type="button"
                    aria-label="Start a new thread"
                    data-testid="project-chat-threads-empty-state-start-thread-button"
                    className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold normal-case tracking-normal text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                    onClick={handleStartNewThread}
                  >
                    <MdAdd size={15} />
                    <span>Start a new thread</span>
                  </button>
                </h3>
                <p className="text-xs text-setta-400 dark:text-setta-500">
                  This creates a draft thread using the current thread context.
                </p>
              </div>
            </aside>
          ) : (
            <p className="text-center text-xs text-setta-400">
              {emptyStateText}
            </p>
          )
        ) : (
          <DragDropProvider
            sensors={threadDndSensors}
            dndContext={threadDndContext}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            debugLabel="project-chat-threads"
          >
            <>
              <DragOperationShapeSync enabled />
              {searchableGroupSections.length > 0 ? (
                <div className="flex w-full flex-col gap-2">
                  {pinnedSearchableGroupSections.length > 0 ? (
                    <section className="flex flex-col gap-1">
                      <div
                        className="flex items-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
                        data-testid="project-chat-pinned-groups-label"
                      >
                        <span className="truncate">Pinned</span>
                      </div>
                      <SortableContext
                        id={`project-chat-thread-groups:${projectConfigId}:pinned`}
                        items={pinnedSortableGroupDndIds}
                        strategy={verticalListSortingStrategy}
                        forceSorting
                      >
                        <div
                          className="flex w-full flex-col gap-2"
                          data-thread-group-domain={PINNED_THREAD_DOMAIN}
                        >
                          {pinnedSearchableGroupSections.map((section) => (
                            <ThreadGroupFolder
                              key={section.id}
                              section={section}
                              groupDndId={toThreadGroupDndId(section.id)}
                              chatId={chatId}
                              projectConfigId={projectConfigId}
                              viewedThreadIdsSet={viewedThreadIdsSet}
                              pinnedThreadIdsSet={pinnedThreadIdsSet}
                              groupSortableEnabled={
                                groupSortableEnabledById.get(section.id) ??
                                false
                              }
                              threadSortableEnabled={threadsSortableEnabled}
                              isSelected={selectedGroupId === section.id}
                              isEditing={editingGroupId === section.id}
                              isThreadDragActive={activeThreadDragId !== null}
                              isThreadDragHovering={
                                threadDragHoverGroupId === section.id
                              }
                              onStartEditing={setEditingGroupId}
                              onFinishEditing={() => setEditingGroupId(null)}
                              onRenameGroup={handleRenameGroup}
                              onToggleGroupPinned={handleToggleGroupPinned}
                              onToggleThreadPinned={handleToggleThreadPinned}
                              onDeleteGroup={handleDeleteGroup}
                              onDeleteThread={handleDeleteThread}
                              onSelectThread={handleSelectThread}
                              onSelectGroup={(groupId) => {
                                onSelectedGroupChange?.(groupId);
                              }}
                              onStartThreadInGroup={handleStartThreadInGroup}
                              hasMasterSearch={hasMasterSearch}
                              masterSearchMatchCountByChatId={
                                masterSearchMatchCountByChatId
                              }
                              activeMasterSearchMatchThreadId={
                                activeMasterSearchMatchThreadId
                              }
                              showThreadAgentBadges={showThreadAgentBadges}
                              threadAgentBadgeLabelByChatId={
                                threadAgentBadgeLabelByChatId
                              }
                              activeThreadWaitingForResponse={
                                activeThreadWaitingForResponse
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </section>
                  ) : null}
                  {unpinnedSearchableGroupSections.length > 0 ? (
                    <section className="flex flex-col gap-1">
                      {pinnedSearchableGroupSections.length > 0 ? (
                        <div
                          className="flex items-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
                          data-testid="project-chat-unpinned-groups-label"
                        >
                          <span className="truncate">Unpinned</span>
                        </div>
                      ) : null}
                      <SortableContext
                        id={`project-chat-thread-groups:${projectConfigId}:unpinned`}
                        items={unpinnedSortableGroupDndIds}
                        strategy={verticalListSortingStrategy}
                        forceSorting
                      >
                        <div
                          className="flex w-full flex-col gap-2"
                          data-thread-group-domain={UNPINNED_THREAD_DOMAIN}
                        >
                          {unpinnedSearchableGroupSections.map((section) => (
                            <ThreadGroupFolder
                              key={section.id}
                              section={section}
                              groupDndId={toThreadGroupDndId(section.id)}
                              chatId={chatId}
                              projectConfigId={projectConfigId}
                              viewedThreadIdsSet={viewedThreadIdsSet}
                              pinnedThreadIdsSet={pinnedThreadIdsSet}
                              groupSortableEnabled={
                                groupSortableEnabledById.get(section.id) ??
                                false
                              }
                              threadSortableEnabled={threadsSortableEnabled}
                              isSelected={selectedGroupId === section.id}
                              isEditing={editingGroupId === section.id}
                              isThreadDragActive={activeThreadDragId !== null}
                              isThreadDragHovering={
                                threadDragHoverGroupId === section.id
                              }
                              onStartEditing={setEditingGroupId}
                              onFinishEditing={() => setEditingGroupId(null)}
                              onRenameGroup={handleRenameGroup}
                              onToggleGroupPinned={handleToggleGroupPinned}
                              onToggleThreadPinned={handleToggleThreadPinned}
                              onDeleteGroup={handleDeleteGroup}
                              onDeleteThread={handleDeleteThread}
                              onSelectThread={handleSelectThread}
                              onSelectGroup={(groupId) => {
                                onSelectedGroupChange?.(groupId);
                              }}
                              onStartThreadInGroup={handleStartThreadInGroup}
                              hasMasterSearch={hasMasterSearch}
                              masterSearchMatchCountByChatId={
                                masterSearchMatchCountByChatId
                              }
                              activeMasterSearchMatchThreadId={
                                activeMasterSearchMatchThreadId
                              }
                              showThreadAgentBadges={showThreadAgentBadges}
                              threadAgentBadgeLabelByChatId={
                                threadAgentBadgeLabelByChatId
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {ungroupedEntries.length > 0 ? (
                <ThreadUngroupedFolder
                  entries={ungroupedEntries}
                  hasGroupsAbove={searchableGroupSections.length > 0}
                  chatId={chatId}
                  threadSortableEnabled={threadsSortableEnabled}
                  viewedThreadIdsSet={viewedThreadIdsSet}
                  pinnedThreadIdsSet={pinnedThreadIdsSet}
                  onToggleThreadPinned={handleToggleThreadPinned}
                  onDeleteThread={handleDeleteThread}
                  onSelectThread={handleSelectThread}
                  onSelectGroup={(groupId) => {
                    onSelectedGroupChange?.(groupId);
                  }}
                  hasMasterSearch={hasMasterSearch}
                  masterSearchMatchCountByChatId={
                    masterSearchMatchCountByChatId
                  }
                  activeMasterSearchMatchThreadId={
                    activeMasterSearchMatchThreadId
                  }
                  showThreadAgentBadges={showThreadAgentBadges}
                  threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
                  activeThreadWaitingForResponse={
                    activeThreadWaitingForResponse
                  }
                />
              ) : null}
            </>
          </DragDropProvider>
        )}
      </div>
    </section>
  );
}

function useThreadGroupSortableItem(id: string, disabled: boolean) {
  return useSortableListItem(id, disabled, "vertical");
}

function useSortableListItem(
  id: string,
  disabled: boolean,
  direction: "vertical" | "horizontal" = "vertical",
) {
  return useDisplacementSortableListItem(id, disabled, direction);
}

function ThreadGroupFolder({
  section,
  groupDndId,
  chatId,
  projectConfigId,
  viewedThreadIdsSet,
  pinnedThreadIdsSet,
  groupSortableEnabled,
  threadSortableEnabled,
  isSelected,
  isEditing,
  isThreadDragActive,
  isThreadDragHovering,
  onStartEditing,
  onFinishEditing,
  onRenameGroup,
  onToggleGroupPinned,
  onToggleThreadPinned,
  onDeleteGroup,
  onDeleteThread,
  onSelectThread,
  onSelectGroup,
  onStartThreadInGroup,
  hasMasterSearch,
  masterSearchMatchCountByChatId,
  activeMasterSearchMatchThreadId,
  showThreadAgentBadges,
  threadAgentBadgeLabelByChatId,
  activeThreadWaitingForResponse,
}: {
  section: ThreadGroupSection;
  groupDndId: string;
  chatId: string | null | undefined;
  projectConfigId: string;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  groupSortableEnabled: boolean;
  threadSortableEnabled: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isThreadDragActive: boolean;
  isThreadDragHovering: boolean;
  onStartEditing: (groupId: string | null) => void;
  onFinishEditing: () => void;
  onRenameGroup: (groupId: string, nextName: string) => boolean;
  onToggleGroupPinned: (groupId: string) => void;
  onToggleThreadPinned: (threadId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
  onSelectGroup: (groupId: string | null) => void;
  onStartThreadInGroup: (groupId: string) => void;
  hasMasterSearch: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  activeMasterSearchMatchThreadId: string | null;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  activeThreadWaitingForResponse: boolean;
}) {
  const sortable = useThreadGroupSortableItem(
    groupDndId,
    !groupSortableEnabled,
  );
  const groupSectionDropTarget = useDroppable({
    id: toThreadSectionDropTargetId(section.id),
    data: {
      type: "project-chat-thread-section-drop-target",
      groupId: section.id,
    },
  });
  const pinnedEntries = useMemo(() => {
    return section.entries.filter((entry) =>
      pinnedThreadIdsSet.has(entry.chatId),
    );
  }, [pinnedThreadIdsSet, section.entries]);
  const unpinnedEntries = useMemo(() => {
    return section.entries.filter(
      (entry) => !pinnedThreadIdsSet.has(entry.chatId),
    );
  }, [pinnedThreadIdsSet, section.entries]);
  const pinnedSortableThreadItemIds = useMemo(() => {
    return pinnedEntries.map((entry) => toThreadDndId(entry.chatId));
  }, [pinnedEntries]);
  const unpinnedSortableThreadItemIds = useMemo(() => {
    return unpinnedEntries.map((entry) => toThreadDndId(entry.chatId));
  }, [unpinnedEntries]);
  const showGroupDropHighlight =
    groupSectionDropTarget.isOver ||
    (isThreadDragActive && isThreadDragHovering);
  const groupDropSurfaceClassName = showGroupDropHighlight
    ? groupSectionDropTarget.isOver
      ? "border border-blue-500/60 bg-blue-100/70 dark:bg-blue-900/35"
      : "border border-dashed border-blue-400/60 bg-blue-50/70 dark:bg-blue-950/20"
    : "";
  const [draftName, setDraftName] = useState(section.name);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const folderIcon = section.collapsed ? (
    <TbFolder size={14} className="text-setta-400" />
  ) : (
    <TbFolderOpen size={14} className="text-setta-400" />
  );

  useEffect(() => {
    setDraftName(section.name);
  }, [section.name]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const input = editInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [isEditing]);

  const commitRename = useCallback(() => {
    const normalized = normalizeThreadGroupNameForEditing(draftName);
    if (!normalized) {
      setDraftName(section.name);
      onFinishEditing();
      return;
    }
    onRenameGroup(section.id, normalized);
    onFinishEditing();
  }, [draftName, onFinishEditing, onRenameGroup, section.id, section.name]);

  const cancelRename = useCallback(() => {
    setDraftName(section.name);
    onFinishEditing();
  }, [onFinishEditing, section.name]);
  const groupPinTooltipHandlers = getFloatingBoxHandlers({
    title: section.pinned ? "Unpin thread group" : "Pin thread group",
    content: section.pinned
      ? "Move this group back to the unpinned section."
      : "Keep this group at the top in the pinned section.",
  });
  const groupEditTooltipHandlers = getFloatingBoxHandlers({
    title: "Edit thread group name",
    content: "Rename this group in place.",
  });
  const groupDeleteTooltipHandlers = getFloatingBoxHandlers({
    title: "Delete thread group",
    content: getProjectChatDeleteRecoveryTooltipContent("group"),
  });
  const newChatTooltipHandlers = getFloatingBoxHandlers({
    title: "New chat",
    content: "Start a new chat in this group.",
  });
  const groupDragInteractions = groupSortableEnabled
    ? { ...sortable.listeners }
    : {};

  return (
    <section
      ref={sortable.setNodeRef}
      style={sortable.style}
      className="flex flex-col gap-1"
      data-testid="project-chat-thread-group-row"
      data-group-id={section.id}
      data-selected={isSelected ? "true" : "false"}
    >
      <div
        ref={groupSectionDropTarget.setNodeRef}
        className={`rounded ${groupDropSurfaceClassName}`}
        data-testid="project-chat-thread-group-drop-surface"
        data-drop-highlight={showGroupDropHighlight ? "true" : "false"}
        data-drop-active={groupSectionDropTarget.isOver ? "true" : "false"}
      >
        <div className="group relative flex w-full items-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800">
          {isEditing ? (
            <div
              key="group-edit-row"
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5"
            >
              <span
                ref={sortable.setActivatorNodeRef}
                className="h-0 w-0 overflow-hidden"
                aria-hidden="true"
              />
              {folderIcon}
              <input
                ref={editInputRef}
                type="text"
                value={draftName}
                className="h-6 min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 text-[11px] font-semibold normal-case tracking-normal text-setta-800 outline-none ring-blue-400 focus:ring-2 dark:border-blue-500 dark:bg-setta-900 dark:text-setta-100"
                onChange={(event) => {
                  setDraftName(event.target.value);
                }}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                data-testid="project-chat-thread-group-name-input"
              />
            </div>
          ) : (
            <div
              key="group-select-row"
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 pr-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-focus-within:pr-[5.5rem] group-hover:pr-[5.5rem]"
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelectGroup(section.id);
                toggleProjectChatThreadGroupCollapsed(
                  projectConfigId,
                  section.id,
                );
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                onSelectGroup(section.id);
                toggleProjectChatThreadGroupCollapsed(
                  projectConfigId,
                  section.id,
                );
              }}
            >
              <div
                className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 text-left"
                data-testid="project-chat-thread-group-select"
              >
                <span
                  ref={sortable.setActivatorNodeRef}
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                    groupSortableEnabled
                      ? "cursor-grab touch-none text-setta-400 active:cursor-grabbing"
                      : "text-setta-400"
                  }`}
                  data-testid="project-chat-thread-group-drag-handle"
                  aria-label={
                    groupSortableEnabled ? "Drag thread group" : undefined
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  {...groupDragInteractions}
                >
                  {groupSortableEnabled ? (
                    <>
                      <span className="inline-flex group-hover:hidden">
                        {folderIcon}
                      </span>
                      <span className="hidden group-hover:inline-flex">
                        <RxDragHandleDots2 size={13} />
                      </span>
                    </>
                  ) : (
                    folderIcon
                  )}
                </span>
                <span
                  className={`truncate ${
                    isSelected ? "text-blue-700 dark:text-blue-300" : ""
                  }`}
                >
                  {section.name}
                </span>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:text-setta-500 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
              aria-label="New chat in thread group"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectGroup(section.id);
                onStartThreadInGroup(section.id);
              }}
              data-testid="project-chat-thread-group-new-chat-button"
              {...newChatTooltipHandlers}
            >
              <RiChatNewFill size={12} />
            </button>
            <button
              type="button"
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                section.pinned
                  ? "text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  : "text-setta-400 hover:bg-setta-200 dark:text-setta-500 dark:hover:bg-setta-700"
              }`}
              aria-label={
                section.pinned ? "Unpin thread group" : "Pin thread group"
              }
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onToggleGroupPinned(section.id);
              }}
              data-testid="project-chat-thread-group-pin-button"
              {...groupPinTooltipHandlers}
            >
              <MdPushPin size={13} />
            </button>
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-setta-200 hover:text-setta-700 dark:text-setta-500 dark:hover:bg-setta-700 dark:hover:text-setta-200"
              aria-label="Edit thread group name"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onStartEditing(section.id);
              }}
              data-testid="project-chat-thread-group-edit-button"
              {...groupEditTooltipHandlers}
            >
              <FiEdit3 size={12} />
            </button>
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-setta-500 dark:hover:bg-red-950/50 dark:hover:text-red-300"
              aria-label="Delete thread group"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteGroup(section.id);
              }}
              data-testid="project-chat-thread-group-delete-button"
              {...groupDeleteTooltipHandlers}
            >
              <FiTrash2 size={12} />
            </button>
          </div>
        </div>
        {!section.collapsed ? (
          <div
            className="ml-1 flex flex-col gap-1 border-l border-setta-200/70 pl-1 dark:border-setta-700/70"
            data-testid="project-chat-thread-group-entries"
          >
            {pinnedEntries.length > 0 ? (
              <section className="flex flex-col gap-1">
                <div
                  className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
                  data-testid="project-chat-thread-pinned-section-label"
                >
                  <span>Pinned</span>
                </div>
                <ThreadDropZone
                  groupId={section.id}
                  pinDomain={PINNED_THREAD_DOMAIN}
                >
                  <SortableContext
                    id={`project-chat-threads:${section.id}:pinned`}
                    items={pinnedSortableThreadItemIds}
                    strategy={verticalListSortingStrategy}
                    forceSorting
                  >
                    {pinnedEntries.map((entry) => (
                      <ThreadEntryLine
                        key={entry.chatId}
                        entry={entry}
                        threadGroupId={section.id}
                        pinDomain={PINNED_THREAD_DOMAIN}
                        sortableEnabled={threadSortableEnabled}
                        isActive={isThreadEntryActive(entry, chatId)}
                        isViewed={
                          isDraftThreadEntry(entry) ||
                          viewedThreadIdsSet.has(entry.chatId) ||
                          entry.chatId === chatId
                        }
                        searchMatchCount={
                          hasMasterSearch
                            ? masterSearchMatchCountByChatId.get(
                                entry.chatId,
                              ) ?? 0
                            : null
                        }
                        isSearchMatchActive={
                          activeMasterSearchMatchThreadId === entry.chatId
                        }
                        isPinned={pinnedThreadIdsSet.has(entry.chatId)}
                        isDraft={isDraftThreadEntry(entry)}
                        showAgentBadges={showThreadAgentBadges}
                        agentBadgeLabel={
                          threadAgentBadgeLabelByChatId.get(entry.chatId) ??
                          null
                        }
                        activeThreadWaitingForResponse={
                          activeThreadWaitingForResponse
                        }
                        onTogglePinned={onToggleThreadPinned}
                        onDelete={onDeleteThread}
                        onSelect={(selectedEntry) => {
                          onSelectGroup(section.id);
                          onSelectThread(selectedEntry);
                        }}
                      />
                    ))}
                  </SortableContext>
                </ThreadDropZone>
              </section>
            ) : null}
            {unpinnedEntries.length > 0 || pinnedEntries.length > 0 ? (
              <section className="flex flex-col gap-1">
                {pinnedEntries.length > 0 ? (
                  <div
                    className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
                    data-testid="project-chat-thread-unpinned-section-label"
                  >
                    <span>Unpinned</span>
                  </div>
                ) : null}
                <ThreadDropZone
                  groupId={section.id}
                  pinDomain={UNPINNED_THREAD_DOMAIN}
                >
                  <SortableContext
                    id={`project-chat-threads:${section.id}:unpinned`}
                    items={unpinnedSortableThreadItemIds}
                    strategy={verticalListSortingStrategy}
                    forceSorting
                  >
                    {unpinnedEntries.map((entry) => (
                      <ThreadEntryLine
                        key={entry.chatId}
                        entry={entry}
                        threadGroupId={section.id}
                        pinDomain={UNPINNED_THREAD_DOMAIN}
                        sortableEnabled={threadSortableEnabled}
                        isActive={isThreadEntryActive(entry, chatId)}
                        isViewed={
                          isDraftThreadEntry(entry) ||
                          viewedThreadIdsSet.has(entry.chatId) ||
                          entry.chatId === chatId
                        }
                        searchMatchCount={
                          hasMasterSearch
                            ? masterSearchMatchCountByChatId.get(
                                entry.chatId,
                              ) ?? 0
                            : null
                        }
                        isSearchMatchActive={
                          activeMasterSearchMatchThreadId === entry.chatId
                        }
                        isPinned={pinnedThreadIdsSet.has(entry.chatId)}
                        isDraft={isDraftThreadEntry(entry)}
                        showAgentBadges={showThreadAgentBadges}
                        agentBadgeLabel={
                          threadAgentBadgeLabelByChatId.get(entry.chatId) ??
                          null
                        }
                        activeThreadWaitingForResponse={
                          activeThreadWaitingForResponse
                        }
                        onTogglePinned={onToggleThreadPinned}
                        onDelete={onDeleteThread}
                        onSelect={(selectedEntry) => {
                          onSelectGroup(section.id);
                          onSelectThread(selectedEntry);
                        }}
                      />
                    ))}
                  </SortableContext>
                </ThreadDropZone>
                {pinnedEntries.length > 0 && unpinnedEntries.length === 0 ? (
                  <p
                    className="px-1 py-1 text-[11px] text-setta-400 dark:text-setta-500"
                    data-testid="project-chat-thread-unpinned-empty-state"
                  >
                    No unpinned threads.
                  </p>
                ) : null}
              </section>
            ) : null}
            {section.entries.length === 0 ? (
              <p className="py-1 text-[11px] text-setta-400 dark:text-setta-500">
                No threads in this group.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ThreadUngroupedFolder({
  entries,
  hasGroupsAbove,
  chatId,
  threadSortableEnabled,
  viewedThreadIdsSet,
  pinnedThreadIdsSet,
  hasMasterSearch,
  masterSearchMatchCountByChatId,
  activeMasterSearchMatchThreadId,
  showThreadAgentBadges,
  threadAgentBadgeLabelByChatId,
  activeThreadWaitingForResponse,
  onToggleThreadPinned,
  onDeleteThread,
  onSelectThread,
  onSelectGroup,
}: {
  entries: Array<ProjectChatHistoryEntry>;
  hasGroupsAbove: boolean;
  chatId: string | null | undefined;
  threadSortableEnabled: boolean;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  hasMasterSearch: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  activeMasterSearchMatchThreadId: string | null;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  activeThreadWaitingForResponse: boolean;
  onToggleThreadPinned: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
  onSelectGroup: (groupId: string | null) => void;
}) {
  const pinnedEntries = useMemo(() => {
    return entries.filter((entry) => pinnedThreadIdsSet.has(entry.chatId));
  }, [entries, pinnedThreadIdsSet]);
  const unpinnedEntries = useMemo(() => {
    return entries.filter((entry) => !pinnedThreadIdsSet.has(entry.chatId));
  }, [entries, pinnedThreadIdsSet]);
  const pinnedSortableThreadItemIds = useMemo(() => {
    return pinnedEntries.map((entry) => toThreadDndId(entry.chatId));
  }, [pinnedEntries]);
  const unpinnedSortableThreadItemIds = useMemo(() => {
    return unpinnedEntries.map((entry) => toThreadDndId(entry.chatId));
  }, [unpinnedEntries]);
  return (
    <section className="flex flex-col">
      {hasGroupsAbove ? (
        <hr
          data-testid="project-chat-ungrouped-divider"
          className="mx-0.5 mb-2 mt-2 border-setta-200/70 dark:border-setta-700/70"
        />
      ) : null}
      {hasGroupsAbove ? (
        <div
          className="flex w-full items-center gap-1 rounded px-0.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
          data-testid="project-chat-ungrouped-label"
        >
          <span className="truncate">Ungrouped</span>
        </div>
      ) : null}
      <div
        className={
          hasGroupsAbove
            ? "ml-1 mt-1 flex flex-col gap-1 border-l border-setta-200/70 pl-1 dark:border-setta-700/70"
            : "mt-1 flex flex-col gap-1 pl-1"
        }
        data-testid="project-chat-ungrouped-entries"
      >
        {pinnedEntries.length > 0 ? (
          <section className="flex flex-col gap-1">
            <div
              className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
              data-testid="project-chat-thread-pinned-section-label"
            >
              <span>Pinned</span>
            </div>
            <ThreadDropZone groupId={null} pinDomain={PINNED_THREAD_DOMAIN}>
              <SortableContext
                id="project-chat-threads:ungrouped:pinned"
                items={pinnedSortableThreadItemIds}
                strategy={verticalListSortingStrategy}
                forceSorting
              >
                {pinnedEntries.map((entry) => (
                  <ThreadEntryLine
                    key={entry.chatId}
                    entry={entry}
                    threadGroupId={null}
                    pinDomain={PINNED_THREAD_DOMAIN}
                    sortableEnabled={threadSortableEnabled}
                    isActive={isThreadEntryActive(entry, chatId)}
                    isViewed={
                      isDraftThreadEntry(entry) ||
                      viewedThreadIdsSet.has(entry.chatId) ||
                      entry.chatId === chatId
                    }
                    searchMatchCount={
                      hasMasterSearch
                        ? masterSearchMatchCountByChatId.get(entry.chatId) ?? 0
                        : null
                    }
                    isSearchMatchActive={
                      activeMasterSearchMatchThreadId === entry.chatId
                    }
                    isPinned={pinnedThreadIdsSet.has(entry.chatId)}
                    isDraft={isDraftThreadEntry(entry)}
                    showAgentBadges={showThreadAgentBadges}
                    agentBadgeLabel={
                      threadAgentBadgeLabelByChatId.get(entry.chatId) ?? null
                    }
                    activeThreadWaitingForResponse={
                      activeThreadWaitingForResponse
                    }
                    onTogglePinned={onToggleThreadPinned}
                    onDelete={onDeleteThread}
                    onSelect={(selectedEntry) => {
                      onSelectGroup(null);
                      onSelectThread(selectedEntry);
                    }}
                  />
                ))}
              </SortableContext>
            </ThreadDropZone>
          </section>
        ) : null}
        {unpinnedEntries.length > 0 || pinnedEntries.length > 0 ? (
          <section className="flex flex-col gap-1">
            {pinnedEntries.length > 0 ? (
              <div
                className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
                data-testid="project-chat-thread-unpinned-section-label"
              >
                <span>Unpinned</span>
              </div>
            ) : null}
            <ThreadDropZone groupId={null} pinDomain={UNPINNED_THREAD_DOMAIN}>
              <SortableContext
                id="project-chat-threads:ungrouped:unpinned"
                items={unpinnedSortableThreadItemIds}
                strategy={verticalListSortingStrategy}
                forceSorting
              >
                {unpinnedEntries.map((entry) => (
                  <ThreadEntryLine
                    key={entry.chatId}
                    entry={entry}
                    threadGroupId={null}
                    pinDomain={UNPINNED_THREAD_DOMAIN}
                    sortableEnabled={threadSortableEnabled}
                    isActive={isThreadEntryActive(entry, chatId)}
                    isViewed={
                      isDraftThreadEntry(entry) ||
                      viewedThreadIdsSet.has(entry.chatId) ||
                      entry.chatId === chatId
                    }
                    searchMatchCount={
                      hasMasterSearch
                        ? masterSearchMatchCountByChatId.get(entry.chatId) ?? 0
                        : null
                    }
                    isSearchMatchActive={
                      activeMasterSearchMatchThreadId === entry.chatId
                    }
                    isPinned={pinnedThreadIdsSet.has(entry.chatId)}
                    isDraft={isDraftThreadEntry(entry)}
                    showAgentBadges={showThreadAgentBadges}
                    agentBadgeLabel={
                      threadAgentBadgeLabelByChatId.get(entry.chatId) ?? null
                    }
                    activeThreadWaitingForResponse={
                      activeThreadWaitingForResponse
                    }
                    onTogglePinned={onToggleThreadPinned}
                    onDelete={onDeleteThread}
                    onSelect={(selectedEntry) => {
                      onSelectGroup(null);
                      onSelectThread(selectedEntry);
                    }}
                  />
                ))}
              </SortableContext>
            </ThreadDropZone>
            {pinnedEntries.length > 0 && unpinnedEntries.length === 0 ? (
              <p
                className="px-1 py-1 text-[11px] text-setta-400 dark:text-setta-500"
                data-testid="project-chat-thread-unpinned-empty-state"
              >
                No unpinned threads.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function ThreadEntryLine({
  entry,
  threadGroupId,
  pinDomain,
  sortableEnabled,
  isActive,
  isViewed,
  searchMatchCount,
  isSearchMatchActive,
  isPinned,
  isDraft,
  showAgentBadges,
  agentBadgeLabel,
  activeThreadWaitingForResponse,
  onTogglePinned,
  onDelete,
  onSelect,
}: {
  entry: ProjectChatHistoryEntry;
  threadGroupId: string | null;
  pinDomain: ThreadPinDomain;
  sortableEnabled: boolean;
  isActive: boolean;
  isViewed: boolean;
  searchMatchCount: number | null;
  isSearchMatchActive: boolean;
  isPinned: boolean;
  isDraft: boolean;
  showAgentBadges: boolean;
  agentBadgeLabel: string | null;
  activeThreadWaitingForResponse: boolean;
  onTogglePinned: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onSelect: (entry: ProjectChatHistoryEntry) => void;
}) {
  const sortable = useSortableListItem(
    toThreadDndId(entry.chatId),
    !sortableEnabled || isDraft,
    "vertical",
  );
  const showWorkingIndicator = isActive
    ? activeThreadWaitingForResponse
    : entry.waitingForResponse;
  const showUnreadIndicator = !showWorkingIndicator && !isViewed;

  const rowClassName = isActive
    ? "border border-blue-400/90 bg-blue-50/70 text-setta-800 hover:border-blue-500/90 hover:bg-blue-50/90 dark:border-blue-700/80 dark:bg-blue-950/45 dark:text-setta-50 dark:hover:border-blue-600/80 dark:hover:bg-blue-950/55"
    : isSearchMatchActive
      ? "border border-blue-300/70 bg-blue-50/45 text-setta-700 hover:border-blue-400/80 hover:bg-blue-50/70 dark:border-blue-700/60 dark:bg-blue-950/25 dark:text-setta-100 dark:hover:border-blue-600/70 dark:hover:bg-blue-950/35"
      : "border border-transparent text-setta-700 hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800";
  const hasSearchMatchCount =
    searchMatchCount !== null && searchMatchCount > 0 && !isDraft;
  const hasAgentBadge = Boolean(agentBadgeLabel && agentBadgeLabel.trim());
  const showAgentBadge = showAgentBadges && hasAgentBadge;
  const rowRightPaddingClass = showAgentBadge
    ? isDraft
      ? "pr-[3.9rem]"
      : "pr-[3.9rem] group-focus-within/thread-entry:pr-[2.8rem] group-hover/thread-entry:pr-[2.8rem]"
    : isDraft
      ? "pr-0"
      : "pr-0 group-focus-within/thread-entry:pr-[2.8rem] group-hover/thread-entry:pr-[2.8rem]";
  const agentBadgeVisibilityClass = isDraft
    ? ""
    : "group-focus-within/thread-entry:opacity-0 group-hover/thread-entry:opacity-0";
  const pinTooltipHandlers = isDraft
    ? null
    : getFloatingBoxHandlers({
        title: isPinned ? "Unpin thread" : "Pin thread",
        content: isPinned
          ? "Move this chat back to unpinned."
          : "Keep this chat at the top of its section.",
      });
  const deleteTooltipHandlers = isDraft
    ? null
    : getFloatingBoxHandlers({
        title: "Delete chat",
        content: getProjectChatDeleteRecoveryTooltipContent("thread"),
      });
  const workingIndicatorTooltipHandlers = showWorkingIndicator
    ? getFloatingBoxHandlers({
        title: "Working",
        content: "This chat currently has in-progress activity.",
      })
    : null;
  const unreadIndicatorTooltipHandlers = showUnreadIndicator
    ? getFloatingBoxHandlers({
        title: "Unread",
        content: "This chat has completed updates you have not opened yet.",
      })
    : null;
  const threadDragInteractions =
    !isDraft && sortableEnabled ? { ...sortable.listeners } : {};
  const showThreadDragCursor = !isDraft && sortableEnabled;
  const leadingStatusVisibilityClass = showThreadDragCursor
    ? "opacity-100 pointer-events-auto group-focus-within/thread-entry:pointer-events-none group-focus-within/thread-entry:opacity-0 group-hover/thread-entry:pointer-events-none group-hover/thread-entry:opacity-0"
    : "opacity-100 pointer-events-auto";
  const handleThreadRowClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button")) {
      return;
    }
    onSelect(entry);
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={sortable.style}
      className={`group/thread-entry relative flex min-w-0 max-w-full items-center gap-1 self-stretch rounded transition-colors ${rowClassName}`}
      data-testid={
        isDraft
          ? "project-chat-thread-draft-entry"
          : "project-chat-thread-entry"
      }
      data-thread-id={entry.chatId}
      data-thread-group-id={threadGroupId ?? "ungrouped"}
      data-thread-pin-domain={pinDomain}
      onClick={handleThreadRowClick}
    >
      <div
        className={`flex min-w-0 flex-1 items-center rounded px-0 py-1 text-left ${rowRightPaddingClass}`}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => onThreadEntryKeyDown(event, entry, onSelect)}
      >
        <span className="relative -ml-px mr-px inline-flex h-4 w-3 shrink-0 items-center justify-center">
          <span
            ref={
              showThreadDragCursor ? sortable.setActivatorNodeRef : undefined
            }
            className={`absolute inset-0 inline-flex h-4 w-3 items-center justify-center rounded transition-[color,opacity] ${
              showThreadDragCursor
                ? "pointer-events-none cursor-grab touch-none text-setta-400 opacity-0 hover:text-setta-600 active:cursor-grabbing group-focus-within/thread-entry:pointer-events-auto group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:pointer-events-auto group-hover/thread-entry:opacity-100 dark:text-setta-500 dark:hover:text-setta-300"
                : "pointer-events-none text-setta-300 opacity-0 group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:opacity-100 dark:text-setta-700"
            }`}
            data-testid="project-chat-thread-drag-handle"
            aria-label={showThreadDragCursor ? "Drag thread" : undefined}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            {...threadDragInteractions}
          >
            <RxDragHandleDots2 size={12} />
          </span>
          {showWorkingIndicator ? (
            <BrailleSpinner
              className={`absolute inset-0 m-auto ${BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME} text-blue-500 transition-opacity dark:text-blue-300 ${leadingStatusVisibilityClass}`}
              data-testid={"project-chat-thread-working-indicator"}
              aria-hidden="true"
              {...(workingIndicatorTooltipHandlers ?? {})}
            />
          ) : showUnreadIndicator ? (
            <span
              className={`absolute inset-0 m-auto h-2 w-2 rounded-full bg-blue-500 transition-opacity ${leadingStatusVisibilityClass}`}
              data-testid="project-chat-thread-unread-dot"
              {...(unreadIndicatorTooltipHandlers ?? {})}
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
          {entry.label}
        </span>
        {hasSearchMatchCount ? (
          <span
            className={`ml-1 inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-sm px-1 py-[1px] text-[9px] font-semibold leading-none ${
              isActive
                ? "bg-blue-200/80 text-blue-800 dark:bg-blue-900/70 dark:text-blue-100"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/55 dark:text-blue-200"
            }`}
            data-testid="project-chat-thread-search-match-count"
          >
            {searchMatchCount}
          </span>
        ) : null}
      </div>
      {showAgentBadge ? (
        <span
          className={`pointer-events-none absolute right-0.5 top-1/2 inline-flex max-w-[3.9rem] -translate-y-1/2 items-center justify-center truncate rounded border border-setta-200/80 bg-setta-100/90 px-[2px] py-[1px] text-[8px] font-semibold uppercase leading-none tracking-[-0.06em] text-setta-600 transition-opacity dark:border-setta-700/80 dark:bg-setta-800/90 dark:text-setta-200 ${agentBadgeVisibilityClass}`}
          data-testid="project-chat-thread-agent-badge"
        >
          {agentBadgeLabel}
        </span>
      ) : null}
      {!isDraft ? (
        <div className="pointer-events-none absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/thread-entry:pointer-events-auto group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:pointer-events-auto group-hover/thread-entry:opacity-100">
          <button
            type="button"
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
              isPinned
                ? "text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                : "text-setta-400 hover:bg-setta-200 dark:text-setta-500 dark:hover:bg-setta-700"
            }`}
            aria-label={isPinned ? "Unpin thread" : "Pin thread"}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinned(entry.chatId);
            }}
            data-testid="project-chat-thread-pin-button"
            {...(pinTooltipHandlers ?? {})}
          >
            <MdPushPin size={12} />
          </button>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-setta-500 dark:hover:bg-red-950/50 dark:hover:text-red-300"
            aria-label="Delete thread"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(entry.chatId);
            }}
            data-testid="project-chat-thread-delete-button"
            {...(deleteTooltipHandlers ?? {})}
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function onThreadEntryKeyDown(
  event: KeyboardEvent<HTMLElement>,
  entry: ProjectChatHistoryEntry,
  onSelect: (entry: ProjectChatHistoryEntry) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect(entry);
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

function isDraftThreadEntry(entry: ProjectChatHistoryEntry): boolean {
  return entry.chatId === DRAFT_THREAD_ENTRY_ID;
}

function isThreadEntryActive(
  entry: ProjectChatHistoryEntry,
  chatId: string | null | undefined,
): boolean {
  if (isDraftThreadEntry(entry)) {
    return chatId === null || chatId === undefined;
  }
  return entry.chatId === chatId;
}

function normalizeUniqueThreadIds(threadIds: Array<string>): Array<string> {
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

function toThreadDndId(threadId: string): string {
  return `${THREAD_DND_PREFIX}${threadId}`;
}

function getThreadIdFromDndId(dndId: string): string | null {
  if (!dndId.startsWith(THREAD_DND_PREFIX)) {
    return null;
  }
  const threadId = dndId.slice(THREAD_DND_PREFIX.length).trim();
  if (!threadId) {
    return null;
  }
  return threadId;
}

function toThreadGroupDndId(groupId: string): string {
  return `${THREAD_GROUP_DND_PREFIX}${groupId}`;
}

function getThreadGroupIdFromDndId(
  dndId: string,
  groupIdSet: Set<string>,
): string | null {
  if (!dndId.startsWith(THREAD_GROUP_DND_PREFIX)) {
    return null;
  }
  const groupId = dndId.slice(THREAD_GROUP_DND_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return null;
  }
  return groupId;
}

function toThreadDropTargetId(
  groupId: string | null,
  pinDomain: ThreadPinDomain,
): string {
  const groupToken = groupId === null ? "ungrouped" : groupId;
  return `${THREAD_DROP_TARGET_PREFIX}${groupToken}::${pinDomain}`;
}

function toThreadSectionDropTargetId(groupId: string): string {
  return `${THREAD_SECTION_DROP_TARGET_PREFIX}${groupId}`;
}

function parseThreadDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): { groupId: string | null; pinDomain: ThreadPinDomain } | undefined {
  if (!dndId.startsWith(THREAD_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const rawPayload = dndId.slice(THREAD_DROP_TARGET_PREFIX.length).trim();
  if (!rawPayload) {
    return undefined;
  }
  const [groupToken, pinDomainToken] = rawPayload.split("::");
  if (!groupToken || !pinDomainToken) {
    return undefined;
  }
  const pinDomain =
    pinDomainToken === PINNED_THREAD_DOMAIN
      ? PINNED_THREAD_DOMAIN
      : pinDomainToken === UNPINNED_THREAD_DOMAIN
        ? UNPINNED_THREAD_DOMAIN
        : null;
  if (!pinDomain) {
    return undefined;
  }
  if (groupToken === "ungrouped") {
    return { groupId: null, pinDomain };
  }
  if (!groupIdSet.has(groupToken)) {
    return undefined;
  }
  return { groupId: groupToken, pinDomain };
}

function getGroupIdFromThreadSectionDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): string | undefined {
  if (!dndId.startsWith(THREAD_SECTION_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const groupId = dndId.slice(THREAD_SECTION_DROP_TARGET_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return undefined;
  }
  return groupId;
}

function resolveThreadDropTarget({
  event,
  sourceThreadId,
  groupIdSet,
  threadGroupById,
  threadPinnedById,
}: {
  event: DragEndEvent;
  sourceThreadId: string;
  groupIdSet: Set<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): ThreadDropTarget | null {
  const sourceThreadPinned = threadPinnedById.get(sourceThreadId) ?? false;
  const sourcePinDomain = sourceThreadPinned
    ? PINNED_THREAD_DOMAIN
    : UNPINNED_THREAD_DOMAIN;
  const candidateIds: Array<string> = [];
  const overId = event.over ? String(event.over.id) : null;
  if (overId) {
    candidateIds.push(overId);
  }
  for (const collision of event.collisions ?? []) {
    const collisionId = String(collision.id);
    if (candidateIds.includes(collisionId)) {
      continue;
    }
    candidateIds.push(collisionId);
  }

  if (overId) {
    const overThreadId = getThreadIdFromDndId(overId);
    const overThreadGroupId =
      overThreadId && overThreadId !== DRAFT_THREAD_ENTRY_ID
        ? threadGroupById.get(overThreadId) ?? null
        : null;
    const overThreadPinned =
      overThreadId && overThreadId !== DRAFT_THREAD_ENTRY_ID
        ? threadPinnedById.get(overThreadId) ?? false
        : sourceThreadPinned;
    if (
      overThreadId &&
      overThreadId !== sourceThreadId &&
      overThreadId !== DRAFT_THREAD_ENTRY_ID &&
      overThreadPinned === sourceThreadPinned
    ) {
      const conflictingDropGroupId = resolveFirstConflictingDropGroupId({
        candidateIds,
        groupIdSet,
        overThreadGroupId,
      });
      if (conflictingDropGroupId !== undefined) {
        return {
          groupId: conflictingDropGroupId,
          targetThreadId: null,
          placement: "after",
          pinDomain: sourcePinDomain,
        };
      }
      return {
        groupId: overThreadGroupId,
        targetThreadId: overThreadId,
        placement: resolveThreadPlacement(event, overId),
        pinDomain: sourcePinDomain,
      };
    }
    if (
      overThreadId &&
      overThreadId !== sourceThreadId &&
      overThreadId !== DRAFT_THREAD_ENTRY_ID &&
      overThreadPinned !== sourceThreadPinned
    ) {
      return null;
    }
    const parsedDropTarget = parseThreadDropTargetId(overId, groupIdSet);
    if (parsedDropTarget && parsedDropTarget.pinDomain !== sourcePinDomain) {
      return null;
    }
    if (parsedDropTarget && parsedDropTarget.pinDomain === sourcePinDomain) {
      return {
        groupId: parsedDropTarget.groupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const overSectionDropGroupId = getGroupIdFromThreadSectionDropTargetId(
      overId,
      groupIdSet,
    );
    if (overSectionDropGroupId !== undefined) {
      return {
        groupId: overSectionDropGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const overGroupId = getThreadGroupIdFromDndId(overId, groupIdSet);
    if (overGroupId) {
      return {
        groupId: overGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    if (groupIdSet.has(overId)) {
      return {
        groupId: overId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
  }

  for (const candidateId of candidateIds) {
    const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
    if (parsedDropTarget && parsedDropTarget.pinDomain === sourcePinDomain) {
      return {
        groupId: parsedDropTarget.groupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    const sectionGroupId = getGroupIdFromThreadSectionDropTargetId(
      candidateId,
      groupIdSet,
    );
    if (sectionGroupId !== undefined) {
      return {
        groupId: sectionGroupId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
  }

  for (const candidateId of candidateIds) {
    const targetThreadId = getThreadIdFromDndId(candidateId);
    if (!targetThreadId || targetThreadId === sourceThreadId) {
      continue;
    }
    if (targetThreadId === DRAFT_THREAD_ENTRY_ID) {
      continue;
    }
    const targetThreadPinned = threadPinnedById.get(targetThreadId) ?? false;
    if (targetThreadPinned !== sourceThreadPinned) {
      continue;
    }
    return {
      groupId: threadGroupById.get(targetThreadId) ?? null,
      targetThreadId,
      placement: resolveThreadPlacement(event, candidateId),
      pinDomain: sourcePinDomain,
    };
  }

  for (const candidateId of candidateIds) {
    const groupId = getThreadGroupIdFromDndId(candidateId, groupIdSet);
    if (!groupId) {
      if (!groupIdSet.has(candidateId)) {
        continue;
      }
      return {
        groupId: candidateId,
        targetThreadId: null,
        placement: "after",
        pinDomain: sourcePinDomain,
      };
    }
    if (!groupIdSet.has(groupId)) {
      continue;
    }
    return {
      groupId,
      targetThreadId: null,
      placement: "after",
      pinDomain: sourcePinDomain,
    };
  }

  return null;
}

function resolveFirstConflictingDropGroupId({
  candidateIds,
  groupIdSet,
  overThreadGroupId,
}: {
  candidateIds: Array<string>;
  groupIdSet: Set<string>;
  overThreadGroupId: string | null;
}): string | null | undefined {
  for (const candidateId of candidateIds) {
    const parsedDropTarget = parseThreadDropTargetId(candidateId, groupIdSet);
    const groupId =
      parsedDropTarget?.groupId ??
      getGroupIdFromThreadSectionDropTargetId(candidateId, groupIdSet) ??
      getThreadGroupIdFromDndId(candidateId, groupIdSet);
    if (
      groupId === undefined ||
      groupId === null ||
      groupId === overThreadGroupId
    ) {
      continue;
    }
    return groupId;
  }
  for (const candidateId of candidateIds) {
    if (!groupIdSet.has(candidateId) || candidateId === overThreadGroupId) {
      continue;
    }
    return candidateId;
  }
  return undefined;
}

function resolveNextGroupOrderFromDrag({
  event,
  sourceGroupId,
  orderedGroupIds,
  groupIdSet,
}: {
  event: DragEndEvent;
  sourceGroupId: string;
  orderedGroupIds: Array<string>;
  groupIdSet: Set<string>;
}): Array<string> | null {
  const primaryDelta = Math.abs(event.delta.y);
  const secondaryDelta = Math.abs(event.delta.x);
  if (
    primaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX &&
    secondaryDelta <= GROUP_DRAG_RELEASE_THRESHOLD_PX
  ) {
    return null;
  }
  const sourceIndex = orderedGroupIds.indexOf(sourceGroupId);
  if (sourceIndex < 0) {
    return null;
  }
  const overGroupId = resolveGroupDropOverId({
    event,
    sourceGroupId,
    groupIdSet,
  });
  if (!overGroupId) {
    return null;
  }
  const overIndex = orderedGroupIds.indexOf(overGroupId);
  if (overIndex < 0 || overIndex === sourceIndex) {
    return null;
  }
  if (event.delta.y < 0 && overIndex > sourceIndex) {
    return null;
  }
  if (event.delta.y > 0 && overIndex < sourceIndex) {
    return null;
  }
  const nextGroupOrder = arrayMove(orderedGroupIds, sourceIndex, overIndex);
  if (isSameGroupOrder(nextGroupOrder, orderedGroupIds)) {
    return null;
  }
  return nextGroupOrder;
}

function resolveGroupDropOverId({
  event,
  sourceGroupId,
  groupIdSet,
}: {
  event: DragEndEvent;
  sourceGroupId: string;
  groupIdSet: Set<string>;
}): string | null {
  const candidateIds: Array<string> = [];
  if (event.over) {
    candidateIds.push(String(event.over.id));
  }
  for (const collision of event.collisions ?? []) {
    const collisionId = String(collision.id);
    if (candidateIds.includes(collisionId)) {
      continue;
    }
    candidateIds.push(collisionId);
  }
  for (const candidateId of candidateIds) {
    const candidateGroupId =
      getThreadGroupIdFromDndId(candidateId, groupIdSet) ??
      getGroupIdFromThreadSectionDropTargetId(candidateId, groupIdSet) ??
      (groupIdSet.has(candidateId) ? candidateId : null);
    if (!candidateGroupId || candidateGroupId === sourceGroupId) {
      continue;
    }
    return candidateGroupId;
  }
  return null;
}

function isSameGroupOrder(left: Array<string>, right: Array<string>): boolean {
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

function getPointerClientPoint(
  activatorEvent: Event | null,
): { x: number; y: number } | null {
  if (!activatorEvent) {
    return null;
  }
  const mouseLike = activatorEvent as Event & {
    clientX?: number;
    clientY?: number;
  };
  if (
    typeof mouseLike.clientX === "number" &&
    typeof mouseLike.clientY === "number"
  ) {
    return { x: mouseLike.clientX, y: mouseLike.clientY };
  }
  const touchLike = activatorEvent as TouchEvent;
  const touch = touchLike.touches?.[0] ?? touchLike.changedTouches?.[0] ?? null;
  if (!touch) {
    return null;
  }
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function resolvePointerLocation({
  pointerCurrent,
  pointerStart,
  delta,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
  delta: { x: number; y: number };
}): { x: number; y: number } | null {
  const resolvedPointer =
    pointerCurrent ??
    (pointerStart
      ? {
          x: pointerStart.x + delta.x,
          y: pointerStart.y + delta.y,
        }
      : null);
  if (!resolvedPointer) {
    return null;
  }
  if (
    !Number.isFinite(resolvedPointer.x) ||
    !Number.isFinite(resolvedPointer.y)
  ) {
    return null;
  }
  return resolvedPointer;
}

function resolveGroupIdFromPointerPosition({
  pointerCurrent,
  pointerStart,
  delta,
  groupIdSet,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
  delta: { x: number; y: number };
  groupIdSet: Set<string>;
}): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const resolvedPointer = resolvePointerLocation({
    pointerCurrent,
    pointerStart,
    delta,
  });
  if (!resolvedPointer) {
    return null;
  }
  const targetX = resolvedPointer.x;
  const targetY = resolvedPointer.y;
  const elementsAtPoint =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(targetX, targetY)
      : [];
  const fallbackElement = document.elementFromPoint(targetX, targetY);
  if (elementsAtPoint.length === 0 && !fallbackElement) {
    return null;
  }
  const candidates =
    elementsAtPoint.length > 0
      ? elementsAtPoint
      : fallbackElement
        ? [fallbackElement]
        : [];
  for (const element of candidates) {
    const groupRow = element.closest(
      '[data-testid="project-chat-thread-group-row"]',
    );
    if (!groupRow) {
      continue;
    }
    const rawGroupId = groupRow.getAttribute("data-group-id") ?? "";
    const groupId = rawGroupId.trim();
    if (!groupId || !groupIdSet.has(groupId)) {
      continue;
    }
    return groupId;
  }
  return null;
}

function isPointerWithinThreadGroupDomain({
  pointerCurrent,
  pointerStart,
  delta,
  pinDomain,
}: {
  pointerCurrent: { x: number; y: number } | null;
  pointerStart: { x: number; y: number } | null;
  delta: { x: number; y: number };
  pinDomain: ThreadPinDomain;
}): boolean | null {
  if (typeof document === "undefined") {
    return null;
  }
  const resolvedPointer = resolvePointerLocation({
    pointerCurrent,
    pointerStart,
    delta,
  });
  if (!resolvedPointer) {
    return null;
  }
  const domainContainer = document.querySelector(
    `[data-thread-group-domain="${pinDomain}"]`,
  );
  if (!domainContainer) {
    return null;
  }
  const domainRect = domainContainer.getBoundingClientRect();
  return (
    resolvedPointer.x >= domainRect.left &&
    resolvedPointer.x <= domainRect.right &&
    resolvedPointer.y >= domainRect.top &&
    resolvedPointer.y <= domainRect.bottom
  );
}

function resolveThreadPlacement(
  event: DragEndEvent,
  overId: string,
): ThreadDropPlacement {
  const collisions = event.collisions as SettaCollision[] | null;
  const collision = collisions?.find(
    (candidate) => String(candidate.id) === overId,
  );
  if (collision?.pastHalfway === true) {
    return "after";
  }
  if (collision?.pastHalfway === false) {
    return "before";
  }
  return event.delta.y >= 0 ? "after" : "before";
}

function buildNextThreadOrder({
  sourceThreadId,
  targetThreadId,
  targetGroupId,
  placement,
  sourceThreadPinned,
  preferredOrder,
  fallbackOrder,
  threadGroupById,
  threadPinnedById,
}: {
  sourceThreadId: string;
  targetThreadId: string | null;
  targetGroupId: string | null;
  placement: ThreadDropPlacement;
  sourceThreadPinned: boolean;
  preferredOrder: Array<string>;
  fallbackOrder: Array<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}): Array<string> {
  const visibleThreadIds = new Set(fallbackOrder);
  const nextOrder = normalizeUniqueThreadIds([
    ...preferredOrder.filter((threadId) => visibleThreadIds.has(threadId)),
    ...fallbackOrder,
  ]).filter((threadId) => threadId !== sourceThreadId);

  let insertIndex = nextOrder.length;
  const normalizedTargetThreadId =
    targetThreadId && visibleThreadIds.has(targetThreadId)
      ? targetThreadId
      : null;
  const targetPinned =
    normalizedTargetThreadId !== null
      ? threadPinnedById.get(normalizedTargetThreadId) ?? false
      : null;
  if (
    normalizedTargetThreadId !== null &&
    targetPinned === sourceThreadPinned
  ) {
    const targetIndex = nextOrder.indexOf(normalizedTargetThreadId);
    if (targetIndex >= 0) {
      insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    }
  } else {
    let lastMatchIndex = -1;
    for (let index = 0; index < nextOrder.length; index += 1) {
      const candidateThreadId = nextOrder[index];
      const candidateGroupId = threadGroupById.get(candidateThreadId) ?? null;
      const candidatePinned = threadPinnedById.get(candidateThreadId) ?? false;
      if (
        candidateGroupId === targetGroupId &&
        candidatePinned === sourceThreadPinned
      ) {
        lastMatchIndex = index;
      }
    }
    if (lastMatchIndex >= 0) {
      insertIndex = lastMatchIndex + 1;
    }
  }
  nextOrder.splice(insertIndex, 0, sourceThreadId);
  return normalizeUniqueThreadIds(nextOrder);
}

function ThreadDropZone({
  groupId,
  pinDomain,
  children,
}: {
  groupId: string | null;
  pinDomain: ThreadPinDomain;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: toThreadDropTargetId(groupId, pinDomain),
    data: {
      type: "project-chat-thread-drop-target",
      groupId,
      pinDomain,
    },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col ${isOver ? "rounded border border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
      data-testid={
        groupId
          ? "project-chat-thread-group-drop-zone"
          : "project-chat-ungrouped-drop-zone"
      }
      data-thread-pin-domain={pinDomain}
      data-drop-highlight={isOver ? "true" : "false"}
    >
      {children}
    </div>
  );
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

function normalizeThreadGroupNameForEditing(name: string): string | null {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized;
}

function buildDefaultThreadGroupName(groupNames: Array<string>): string {
  const normalizedNames = new Set(
    groupNames.map((name) => name.trim().toLowerCase()),
  );
  let suffix = 1;
  while (suffix < 10_000) {
    const candidate = suffix === 1 ? "New Group" : `New Group ${suffix}`;
    if (!normalizedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }
  return `New Group ${Date.now()}`;
}
