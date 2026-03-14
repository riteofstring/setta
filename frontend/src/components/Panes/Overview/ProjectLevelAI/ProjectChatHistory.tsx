import { PointerSensor } from "@dnd-kit/dom";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
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
import {
  MdAdd,
  MdCategory,
  MdChevronLeft,
  MdChevronRight,
  MdRestore,
} from "react-icons/md";
import { RiChatNewFill } from "react-icons/ri";
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
import { ProjectChatHistoryGroupFolder } from "./ProjectChatHistoryGroupFolder";
import { isDraftProjectChatHistoryEntry } from "./projectChatHistoryThreadListShared";
import { ProjectChatHistoryUngroupedFolder } from "./ProjectChatHistoryUngroupedFolder";
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
                            <ProjectChatHistoryGroupFolder
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
                              deleteGroupTooltipContent={getProjectChatDeleteRecoveryTooltipContent(
                                "group",
                              )}
                              deleteThreadTooltipContent={getProjectChatDeleteRecoveryTooltipContent(
                                "thread",
                              )}
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
                <ProjectChatHistoryUngroupedFolder
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
                  deleteTooltipContent={getProjectChatDeleteRecoveryTooltipContent(
                    "thread",
                  )}
                />
              ) : null}
            </>
          </DragDropProvider>
        )}
      </div>
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
