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
import { shallow } from "zustand/shallow";
import {
  buildNextThreadOrder,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  isPointerWithinThreadGroupDomain,
  PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadGroupDndId,
  type ThreadDropTarget,
} from "./projectChatHistoryDnd";
import { ProjectChatHistoryPanel } from "./projectChatHistoryPanel";
import { buildDefaultThreadGroupName } from "./projectChatHistoryThreadFolders";
import {
  buildProjectChatHistoryViewModel,
  DRAFT_THREAD_ENTRY_ID,
  isDraftThreadEntry,
  normalizeUniqueThreadIds,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ProjectChatHistoryEntry,
} from "./projectChatHistoryViewModel";
const PROJECT_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS = 5000;
const PROJECT_CHAT_HISTORY_MISSING_SELECTED_CHAT_POLL_INTERVAL_MS = 1500;
const PROJECT_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS = 10000;

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
  const viewedThreadIdsSet = useMemo(() => {
    return new Set(viewedThreadIds);
  }, [viewedThreadIds]);
  const pinnedThreadIdsSet = useMemo(() => {
    return new Set(pinnedThreadIds);
  }, [pinnedThreadIds]);
  const {
    groupIdSet,
    groupSections,
    groupSortableEnabledById,
    groupsSortableEnabled,
    hasMasterSearch,
    masterSearchMatchCount,
    masterSearchMatchCountByChatId,
    masterSearchQueryKey,
    orderedVisibleThreadIds,
    pinnedSearchableGroupSections,
    pinnedSortableGroupIds,
    placeholderText,
    searchableGroupSections,
    threadAgentBadgeLabelByChatId,
    threadGroupById,
    threadPinnedById,
    ungroupedEntries,
    unpinnedSearchableGroupSections,
    unpinnedSortableGroupIds,
  } = useMemo(
    () =>
      buildProjectChatHistoryViewModel({
        activeChatId: chatId,
        agentRuns,
        draftThread,
        engineConfigId,
        engineConfigs,
        externalAgentConfigs,
        historyEntries,
        initialLoadComplete: agentRunsInitialLoadComplete,
        loadError: agentRunsLoadError,
        masterSearchInput,
        pinnedThreadIds,
        runType,
        threadAssignments,
        threadGroups,
        threadOrderIds,
        trashedThreadIds,
      }),
    [
      agentRuns,
      agentRunsInitialLoadComplete,
      agentRunsLoadError,
      chatId,
      draftThread,
      engineConfigId,
      engineConfigs,
      externalAgentConfigs,
      historyEntries,
      masterSearchInput,
      pinnedThreadIds,
      runType,
      threadAssignments,
      threadGroups,
      threadOrderIds,
      trashedThreadIds,
    ],
  );

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const exists = threadGroups.some((group) => group.id === editingGroupId);
    if (!exists) {
      setEditingGroupId(null);
    }
  }, [editingGroupId, threadGroups]);

  const pinnedSortableGroupDndIds = useMemo(() => {
    return pinnedSortableGroupIds.map((groupId) => toThreadGroupDndId(groupId));
  }, [pinnedSortableGroupIds]);
  const unpinnedSortableGroupDndIds = useMemo(() => {
    return unpinnedSortableGroupIds.map((groupId) =>
      toThreadGroupDndId(groupId),
    );
  }, [unpinnedSortableGroupIds]);
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
          primaryDelta <= PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX &&
          secondaryDelta <= PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX
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
  const handleSelectGroup = useCallback(
    (groupId: string | null) => {
      onSelectedGroupChange?.(groupId);
    },
    [onSelectedGroupChange],
  );
  const handleFinishEditingGroup = useCallback(() => {
    setEditingGroupId(null);
  }, []);
  const handleToggleThreadAgentBadges = useCallback(() => {
    setShowThreadAgentBadges((prev) => !prev);
  }, []);

  return (
    <ProjectChatHistoryPanel
      chatId={chatId}
      inline={inline}
      selectedGroupId={selectedGroupId}
      editingGroupId={editingGroupId}
      activeThreadDragId={activeThreadDragId}
      threadDragHoverGroupId={threadDragHoverGroupId}
      headerPortalTarget={headerPortalTarget}
      projectConfigId={projectConfigId}
      threadListScrollRef={threadListScrollRef}
      masterSearchInput={masterSearchInput}
      setMasterSearchInput={setMasterSearchInput}
      hasMasterSearch={hasMasterSearch}
      masterSearchCounterText={masterSearchCounterText}
      masterSearchMatchCount={masterSearchMatchCount}
      searchableGroupSections={searchableGroupSections}
      pinnedSearchableGroupSections={pinnedSearchableGroupSections}
      unpinnedSearchableGroupSections={unpinnedSearchableGroupSections}
      ungroupedEntries={ungroupedEntries}
      pinnedSortableGroupDndIds={pinnedSortableGroupDndIds}
      unpinnedSortableGroupDndIds={unpinnedSortableGroupDndIds}
      viewedThreadIdsSet={viewedThreadIdsSet}
      pinnedThreadIdsSet={pinnedThreadIdsSet}
      groupSortableEnabledById={groupSortableEnabledById}
      threadsSortableEnabled={threadsSortableEnabled}
      masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
      activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
      showThreadAgentBadges={showThreadAgentBadges}
      threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
      activeThreadWaitingForResponse={activeThreadWaitingForResponse}
      placeholderText={placeholderText}
      canUndoDeletedThreadOrGroup={canUndoDeletedThreadOrGroup}
      threadDndSensors={threadDndSensors}
      threadDndContext={threadDndContext}
      onStepMasterSearch={handleStepMasterSearch}
      onToggleThreadAgentBadges={handleToggleThreadAgentBadges}
      onRestoreDeletedThreadOrGroup={handleRestoreDeletedThreadOrGroup}
      onCreateGroup={handleCreateGroup}
      onStartEditingGroup={setEditingGroupId}
      onFinishEditingGroup={handleFinishEditingGroup}
      onRenameGroup={handleRenameGroup}
      onToggleGroupPinned={handleToggleGroupPinned}
      onToggleThreadPinned={handleToggleThreadPinned}
      onDeleteGroup={handleDeleteGroup}
      onDeleteThread={handleDeleteThread}
      onSelectThread={handleSelectThread}
      onSelectGroup={handleSelectGroup}
      onStartThreadInGroup={handleStartThreadInGroup}
      onStartNewThread={handleStartNewThread}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    />
  );
}
