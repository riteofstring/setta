import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { loadAgentRuns } from "state/actions/ai";
import { type ChatRunType } from "state/actions/chatHistory";
import {
  canUndoLastProjectChatThreadStorageMutation,
  createProjectChatThreadGroup,
  deleteProjectChatThread,
  deleteProjectChatThreadGroup,
  markProjectChatThreadViewed,
  renameProjectChatThreadGroup,
  reorderProjectChatThreadGroups,
  reorderProjectChatThreads,
  setProjectChatThreadGroupAssignment,
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
  buildNextThreadOrder,
  getPointerClientPoint,
  resolveGroupIdFromPointerPosition,
  resolveProjectChatDragEndOutcome,
  resolveThreadDropTarget,
} from "./projectChatHistoryDrag";
import { useProjectChatHistoryModel } from "./projectChatHistoryModel";
import { ProjectChatHistoryPanel } from "./projectChatHistoryPanel";
import {
  DRAFT_THREAD_ENTRY_ID,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  getThreadIdFromDndId,
  type ProjectChatHistoryEntry,
  type ThreadDropTarget,
} from "./projectChatHistoryShared";

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
      (state) => ({
        agentRuns: state.agentRuns,
        agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
        agentRunsLoadError: state.agentRunsLoadError,
      }),
      shallow,
    );
  const { engineConfigs, externalAgentConfigs } = useAIStore(
    (state) => ({
      engineConfigs: state.engineConfigs,
      externalAgentConfigs: state.externalAgentConfigs,
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
    threadAssignments,
    threadGroups,
    threadOrderIds,
    viewedThreadIds,
    pinnedThreadIds,
    trashedThreadIds,
  } = useLocalStorage(
    (state) => ({
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
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
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  useEffect(() => {
    if (chatId) {
      markProjectChatThreadViewed(projectConfigId, chatId);
    }
  }, [chatId, projectConfigId]);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    if (!threadGroups.some((group) => group.id === editingGroupId)) {
      setEditingGroupId(null);
    }
  }, [editingGroupId, threadGroups]);

  const {
    activeMasterSearchMatchThreadId,
    emptyStateText,
    groupIdSet,
    groupSections,
    groupSortableEnabledById,
    groupsSortableEnabled,
    handleStepMasterSearch,
    hasAnyContent,
    hasMasterSearch,
    masterSearchCounterText,
    masterSearchMatchCount,
    masterSearchMatchCountByChatId,
    orderedVisibleThreadIds,
    pinnedSearchableGroupSections,
    pinnedSortableGroupIds,
    pinnedSortableGroupDndIds,
    pinnedThreadIdsSet,
    searchableGroupSections,
    showNoThreadsPlaceholder,
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
  } = useProjectChatHistoryModel({
    agentRuns,
    agentRunsInitialLoadComplete,
    agentRunsLoadError,
    chatId,
    draftThread,
    engineConfigId,
    engineConfigs,
    externalAgentConfigs,
    masterSearchInput,
    projectConfigId,
    runType,
    pinnedThreadIds,
    threadAssignments,
    threadGroups,
    threadListScrollRef,
    threadOrderIds,
    trashedThreadIds,
    viewedThreadIds,
  });

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
      if (entry.chatId === DRAFT_THREAD_ENTRY_ID) {
        setChatId(undefined);
        if (closeOnSelect) {
          onCloseThreadsView?.();
        }
        return;
      }
      setChatId(entry.chatId);
      markProjectChatThreadViewed(projectConfigId, entry.chatId);
      if (closeOnSelect) {
        onCloseThreadsView?.();
      }
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
      if (closeOnSelect) {
        onCloseThreadsView?.();
      }
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
    if (closeOnSelect) {
      onCloseThreadsView?.();
    }
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
    (groupId: string, nextName: string) =>
      renameProjectChatThreadGroup(projectConfigId, groupId, nextName),
    [projectConfigId],
  );
  const handleMoveThread = useCallback(
    (sourceThreadId: string, dropTarget: ThreadDropTarget) => {
      if (!sourceThreadId || dropTarget.targetThreadId === sourceThreadId) {
        return;
      }
      const sourceThreadPinned = pinnedThreadIdsSet.has(sourceThreadId);
      const sourceThreadPinDomain = sourceThreadPinned
        ? PINNED_THREAD_DOMAIN
        : UNPINNED_THREAD_DOMAIN;
      if (dropTarget.pinDomain !== sourceThreadPinDomain) {
        return;
      }
      const nextThreadOrder = buildNextThreadOrder({
        sourceThreadId,
        targetThreadId: dropTarget.targetThreadId,
        targetGroupId: dropTarget.groupId,
        placement: dropTarget.placement,
        sourceThreadPinned,
        preferredOrder: threadOrderIds,
        fallbackOrder: orderedVisibleThreadIds,
        threadGroupById,
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
      threadOrderIds,
      threadPinnedById,
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
    (event: {
      active: { id: string | number };
      activatorEvent: Event | null;
    }) => {
      latestThreadDropTargetRef.current = null;
      const sourceThreadId = getThreadIdFromDndId(String(event.active.id));
      const initialHoverGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: getPointerClientPoint(event.activatorEvent),
        pointerStart: getPointerClientPoint(event.activatorEvent),
        delta: { x: 0, y: 0 },
        groupIdSet,
      });
      setActiveThreadDragId(
        sourceThreadId && sourceThreadId !== DRAFT_THREAD_ENTRY_ID
          ? sourceThreadId
          : null,
      );
      setThreadDragHoverGroupId(
        sourceThreadId && sourceThreadId !== DRAFT_THREAD_ENTRY_ID
          ? initialHoverGroupId
          : null,
      );
      stopPointerTracking();
      const pointerStart = getPointerClientPoint(event.activatorEvent);
      dragPointerStartRef.current = pointerStart;
      dragPointerCurrentRef.current = pointerStart;
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
    (event: {
      active: { id: string | number };
      delta: { x: number; y: number };
      collisions?: unknown[];
      over?: { id: string | number } | null;
    }) => {
      const sourceThreadId = getThreadIdFromDndId(String(event.active.id));
      if (!sourceThreadId || sourceThreadId === DRAFT_THREAD_ENTRY_ID) {
        setThreadDragHoverGroupId(null);
        return;
      }
      setThreadDragHoverGroupId(
        resolveGroupIdFromPointerPosition({
          pointerCurrent: dragPointerCurrentRef.current,
          pointerStart: dragPointerStartRef.current,
          delta: event.delta,
          groupIdSet,
        }),
      );
      const dropTarget = resolveThreadDropTarget({
        event: event as never,
        sourceThreadId,
        groupIdSet,
        threadGroupById,
        threadPinnedById,
      });
      if (dropTarget) {
        latestThreadDropTargetRef.current = dropTarget;
      }
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
    (
      event: Parameters<typeof resolveProjectChatDragEndOutcome>[0]["event"],
    ) => {
      const pointerGroupId = resolveGroupIdFromPointerPosition({
        pointerCurrent: dragPointerCurrentRef.current,
        pointerStart: dragPointerStartRef.current,
        delta: event.delta,
        groupIdSet,
      });
      const outcome = resolveProjectChatDragEndOutcome({
        event,
        groupIdSet,
        groupSections,
        latestThreadDropTarget: latestThreadDropTargetRef.current,
        pinnedSortableGroupIds,
        pinnedThreadIdsSet,
        pointerCurrent: dragPointerCurrentRef.current,
        pointerGroupId,
        pointerStart: dragPointerStartRef.current,
        threadGroupById,
        threadPinnedById,
        unpinnedSortableGroupIds,
      });
      latestThreadDropTargetRef.current = null;
      dragPointerStartRef.current = null;
      dragPointerCurrentRef.current = null;
      setActiveThreadDragId(null);
      setThreadDragHoverGroupId(null);
      stopPointerTracking();
      if (outcome.kind === "move-thread") {
        handleMoveThread(outcome.sourceThreadId, outcome.dropTarget);
        return;
      }
      if (outcome.kind === "reorder-groups") {
        reorderProjectChatThreadGroups(projectConfigId, [
          ...(outcome.sourceGroupPinned
            ? outcome.nextOrderedGroupIds
            : pinnedSortableGroupIds),
          ...(outcome.sourceGroupPinned
            ? unpinnedSortableGroupIds
            : outcome.nextOrderedGroupIds),
        ]);
      }
    },
    [
      groupIdSet,
      groupSections,
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
    (groupId: string) =>
      toggleProjectChatThreadGroupPinned(projectConfigId, groupId),
    [projectConfigId],
  );
  const handleToggleThreadPinned = useCallback(
    (threadId: string) =>
      toggleProjectChatThreadPinned(projectConfigId, threadId),
    [projectConfigId],
  );
  const handleDeleteThread = useCallback(
    (threadId: string) => {
      if (!deleteProjectChatThread(projectConfigId, threadId)) {
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
      if (!deleteProjectChatThreadGroup(projectConfigId, groupId)) {
        return;
      }
      if (selectedGroupId === groupId) {
        onSelectedGroupChange?.(null);
      }
    },
    [onSelectedGroupChange, projectConfigId, selectedGroupId],
  );
  const handleRestoreDeletedThreadOrGroup = useCallback(
    () => undoLastProjectChatThreadStorageMutation(projectConfigId),
    [projectConfigId],
  );
  const canUndoDeletedThreadOrGroup =
    canUndoLastProjectChatThreadStorageMutation(projectConfigId);

  return (
    <ProjectChatHistoryPanel
      activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
      activeMasterSearchMatchThreadIdCounterText={masterSearchCounterText}
      activeThreadDragId={activeThreadDragId}
      activeThreadWaitingForResponse={activeThreadWaitingForResponse}
      canUndoDeletedThreadOrGroup={canUndoDeletedThreadOrGroup}
      chatId={chatId}
      debugLabel="project-chat-threads"
      editingGroupId={editingGroupId}
      emptyStateText={emptyStateText}
      groupSortableEnabledById={groupSortableEnabledById}
      groupsSortableEnabled={groupsSortableEnabled}
      handleCreateGroup={handleCreateGroup}
      handleDeleteGroup={handleDeleteGroup}
      handleDeleteThread={handleDeleteThread}
      handleDragCancel={handleDragCancel}
      handleDragEnd={handleDragEnd}
      handleDragMove={handleDragMove as never}
      handleDragStart={handleDragStart as never}
      handleRenameGroup={handleRenameGroup}
      handleRestoreDeletedThreadOrGroup={handleRestoreDeletedThreadOrGroup}
      handleSelectThread={handleSelectThread}
      handleStartNewThread={handleStartNewThread}
      handleStartThreadInGroup={handleStartThreadInGroup}
      handleStepMasterSearch={handleStepMasterSearch}
      handleToggleGroupPinned={handleToggleGroupPinned}
      handleToggleThreadPinned={handleToggleThreadPinned}
      hasAnyContent={hasAnyContent}
      hasMasterSearch={hasMasterSearch}
      headerPortalTarget={headerPortalTarget}
      inline={inline}
      masterSearchInput={masterSearchInput}
      masterSearchMatchCount={masterSearchMatchCount}
      masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
      onMasterSearchInputChange={setMasterSearchInput}
      onSelectedGroupChange={onSelectedGroupChange}
      pinnedSearchableGroupSections={pinnedSearchableGroupSections}
      pinnedSortableGroupDndIds={pinnedSortableGroupDndIds}
      pinnedThreadIdsSet={pinnedThreadIdsSet}
      projectConfigId={projectConfigId}
      searchableGroupSections={searchableGroupSections}
      selectedGroupId={selectedGroupId}
      setEditingGroupId={setEditingGroupId}
      setShowThreadAgentBadges={setShowThreadAgentBadges}
      showNoThreadsPlaceholder={showNoThreadsPlaceholder}
      showThreadAgentBadges={showThreadAgentBadges}
      threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
      threadDndContext={threadDndContext}
      threadDndSensors={threadDndSensors}
      threadDragHoverGroupId={threadDragHoverGroupId}
      threadListScrollRef={threadListScrollRef}
      threadsSortableEnabled={threadsSortableEnabled}
      ungroupedEntries={ungroupedEntries}
      unpinnedSearchableGroupSections={unpinnedSearchableGroupSections}
      unpinnedSortableGroupDndIds={unpinnedSortableGroupDndIds}
      viewedThreadIdsSet={viewedThreadIdsSet}
    />
  );
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
