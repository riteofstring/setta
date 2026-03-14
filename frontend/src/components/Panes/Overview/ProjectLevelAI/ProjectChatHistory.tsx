import { PointerSensor } from "@dnd-kit/dom";
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import {
  buildChatHistoryEntries,
  type ChatRunType,
} from "state/actions/chatHistory";
import {
  canUndoLastProjectChatThreadStorageMutation,
  markProjectChatThreadViewed,
  renameProjectChatThreadGroup,
  reorderProjectChatThreadGroups,
  toggleProjectChatThreadGroupPinned,
  toggleProjectChatThreadPinned,
  undoLastProjectChatThreadStorageMutation,
} from "state/actions/projectChatThreads";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import { ProjectChatHistoryContent } from "./ProjectChatHistoryContent";
import { ProjectChatHistoryToolbar } from "./ProjectChatHistoryToolbar";
import {
  createProjectChatHistoryGroup,
  deleteProjectChatHistoryGroup,
  deleteProjectChatHistoryThread,
  moveProjectChatHistoryThread,
  selectProjectChatHistoryEntry,
  startProjectChatHistoryThread,
  startProjectChatHistoryThreadInGroup,
} from "./projectChatHistoryController";
import {
  DRAFT_THREAD_ENTRY_ID,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  GROUP_DRAG_RELEASE_THRESHOLD_PX,
  isPointerWithinThreadGroupDomain,
  PINNED_THREAD_DOMAIN,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadGroupDndId,
  UNPINNED_THREAD_DOMAIN,
  type ThreadDropTarget,
} from "./projectChatHistoryDragUtils";
import { isDraftProjectChatHistoryEntry } from "./projectChatHistoryThreadListShared";
import {
  buildOrderedVisibleThreadIds,
  buildProjectChatHistoryDisplayEntries,
  buildProjectChatHistorySearchState,
  buildProjectChatThreadSections,
  buildThreadAgentBadgeLabelByChatId,
  resolveProjectChatHistoryPollIntervalMs,
  type ProjectChatHistoryEntry,
} from "./projectChatHistoryViewModel";

export function getProjectChatDeleteRecoveryTooltipContent(
  target: "thread" | "group",
): string {
  if (target === "group") {
    return "Delete this group and move its chats to Ungrouped. Use Undo Delete in the toolbar to undo.";
  }
  return "Remove this chat from history. Use Undo Delete in the toolbar to undo.";
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
  const { displayEntries, syntheticDraftThreadEntry } = useMemo(() => {
    return buildProjectChatHistoryDisplayEntries({
      historyEntries,
      draftThread,
      chatId,
      runType,
      engineConfigId,
    });
  }, [chatId, draftThread, engineConfigId, historyEntries, runType]);
  const {
    normalizedMasterSearchTerms,
    hasMasterSearch,
    masterSearchMatchCountByChatId,
    sortedEntries,
  } = useMemo(() => {
    return buildProjectChatHistorySearchState({
      agentRuns,
      displayEntries,
      syntheticDraftThreadEntry,
      masterSearchInput,
    });
  }, [agentRuns, displayEntries, masterSearchInput, syntheticDraftThreadEntry]);

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

  const groupIdSet = useMemo(() => {
    return new Set(groupSections.map((section) => section.id));
  }, [groupSections]);

  const orderedVisibleThreadIds = useMemo(() => {
    return buildOrderedVisibleThreadIds({
      searchableGroupSections,
      ungroupedEntries,
    });
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
    createProjectChatHistoryGroup({
      projectConfigId,
      existingGroupNames: threadGroups.map((group) => group.name),
      onSelectedGroupChange,
      setEditingGroupId,
    });
  }, [onSelectedGroupChange, projectConfigId, threadGroups]);

  const handleSelectThread = useCallback(
    (entry: ProjectChatHistoryEntry) => {
      selectProjectChatHistoryEntry({
        entry,
        closeOnSelect,
        onCloseThreadsView,
        projectConfigId,
        setChatId,
      });
    },
    [closeOnSelect, onCloseThreadsView, projectConfigId, setChatId],
  );
  const handleStartThreadInGroup = useCallback(
    (groupId: string) => {
      startProjectChatHistoryThreadInGroup({
        groupId,
        onSelectedGroupChange,
        onStartNewThreadInGroup,
        setChatId,
        closeOnSelect,
        onCloseThreadsView,
      });
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
    startProjectChatHistoryThread({
      onStartNewThread,
      selectedGroupId,
      onStartNewThreadInGroup,
      startThreadInGroup: handleStartThreadInGroup,
      setChatId,
      closeOnSelect,
      onCloseThreadsView,
    });
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
      moveProjectChatHistoryThread({
        sourceThreadId,
        dropTarget,
        pinnedThreadIdsSet,
        threadOrderIds,
        orderedVisibleThreadIds,
        threadGroupById,
        threadPinnedById,
        projectConfigId,
        onSelectedGroupChange,
      });
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
      deleteProjectChatHistoryThread({
        projectConfigId,
        threadId,
        chatId,
        setChatId,
      });
    },
    [chatId, projectConfigId, setChatId],
  );
  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      deleteProjectChatHistoryGroup({
        projectConfigId,
        groupId,
        selectedGroupId,
        onSelectedGroupChange,
      });
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
  const threadsToolbar = (
    <ProjectChatHistoryToolbar
      masterSearchInput={masterSearchInput}
      hasMasterSearch={hasMasterSearch}
      masterSearchCounterText={masterSearchCounterText}
      masterSearchMatchCount={masterSearchMatchCount}
      showThreadAgentBadges={showThreadAgentBadges}
      canUndoDeletedThreadOrGroup={canUndoDeletedThreadOrGroup}
      onMasterSearchInputChange={setMasterSearchInput}
      onStepMasterSearch={handleStepMasterSearch}
      onToggleThreadAgentBadges={() => {
        setShowThreadAgentBadges((prev) => !prev);
      }}
      onRestoreDeletedThreadOrGroup={handleRestoreDeletedThreadOrGroup}
      onCreateGroup={handleCreateGroup}
    />
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

      <ProjectChatHistoryContent
        hasAnyContent={hasAnyContent}
        showNoThreadsPlaceholder={showNoThreadsPlaceholder}
        emptyStateText={emptyStateText}
        onStartNewThread={handleStartNewThread}
        threadListScrollRef={threadListScrollRef}
        threadDndSensors={threadDndSensors}
        threadDndContext={threadDndContext}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        searchableGroupSections={searchableGroupSections}
        pinnedSearchableGroupSections={pinnedSearchableGroupSections}
        unpinnedSearchableGroupSections={unpinnedSearchableGroupSections}
        pinnedSortableGroupDndIds={pinnedSortableGroupDndIds}
        unpinnedSortableGroupDndIds={unpinnedSortableGroupDndIds}
        projectConfigId={projectConfigId}
        chatId={chatId}
        viewedThreadIdsSet={viewedThreadIdsSet}
        pinnedThreadIdsSet={pinnedThreadIdsSet}
        groupSortableEnabledById={groupSortableEnabledById}
        threadsSortableEnabled={threadsSortableEnabled}
        selectedGroupId={selectedGroupId}
        editingGroupId={editingGroupId}
        activeThreadDragId={activeThreadDragId}
        threadDragHoverGroupId={threadDragHoverGroupId}
        onStartEditing={setEditingGroupId}
        onFinishEditing={() => {
          setEditingGroupId(null);
        }}
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
        masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
        activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
        showThreadAgentBadges={showThreadAgentBadges}
        threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
        activeThreadWaitingForResponse={activeThreadWaitingForResponse}
        ungroupedEntries={ungroupedEntries}
        deleteGroupTooltipContent={getProjectChatDeleteRecoveryTooltipContent(
          "group",
        )}
        deleteThreadTooltipContent={getProjectChatDeleteRecoveryTooltipContent(
          "thread",
        )}
      />
    </section>
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
