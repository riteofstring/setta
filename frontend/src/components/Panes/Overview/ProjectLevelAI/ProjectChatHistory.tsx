import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  buildChatHistoryEntries,
  type ChatRunType,
} from "state/actions/chatHistory";
import { markProjectChatThreadViewed } from "state/actions/projectChatThreads";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import { ProjectChatHistoryContent } from "./ProjectChatHistoryContent";
import { ProjectChatHistoryToolbar } from "./ProjectChatHistoryToolbar";
import {
  useProjectChatHistorySearchNavigation,
  useProjectChatHistorySearchQueryState,
} from "./projectChatHistorySearchState";
import { buildProjectChatHistoryDisplayEntries } from "./projectChatHistoryViewModel";
import { useProjectChatHistoryCommandController } from "./useProjectChatHistoryCommandController";
import { useProjectChatHistoryDragController } from "./useProjectChatHistoryDragController";
import { useProjectChatHistoryPolling } from "./useProjectChatHistoryPolling";
import { useProjectChatHistorySurfaceState } from "./useProjectChatHistorySurfaceState";

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
  useProjectChatHistoryPolling({
    hasLoadError: Boolean(agentRunsLoadError),
    hasRunningHistoryEntry,
    selectedChatMissingFromHistory,
  });
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
    masterSearchInput,
    setMasterSearchInput,
    normalizedMasterSearchTerms,
    hasMasterSearch,
    masterSearchMatchCountByChatId,
    sortedEntries,
  } = useProjectChatHistorySearchQueryState({
    agentRuns,
    displayEntries,
    syntheticDraftThreadEntry,
  });
  const {
    viewedThreadIdsSet,
    pinnedThreadIdsSet,
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
  } = useProjectChatHistorySurfaceState({
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
    initialLoadComplete: agentRunsInitialLoadComplete,
    loadError: agentRunsLoadError,
  });
  const {
    activeMasterSearchMatchThreadId,
    masterSearchCounterText,
    masterSearchMatchCount,
    handleStepMasterSearch,
  } = useProjectChatHistorySearchNavigation({
    hasMasterSearch,
    normalizedMasterSearchTerms,
    orderedVisibleThreadIds,
    threadListScrollRef,
  });

  const {
    editingGroupId,
    setEditingGroupId,
    handleFinishEditing,
    showThreadAgentBadges,
    handleToggleThreadAgentBadges,
    canUndoDeletedThreadOrGroup,
    handleCreateGroup,
    handleSelectThread,
    handleSelectGroup,
    handleStartThreadInGroup,
    handleStartNewThread,
    handleRenameGroup,
    handleMoveThread,
    handleReorderGroups,
    handleToggleGroupPinned,
    handleToggleThreadPinned,
    handleDeleteThread,
    handleDeleteGroup,
    handleRestoreDeletedThreadOrGroup,
  } = useProjectChatHistoryCommandController({
    projectConfigId,
    threadGroups,
    selectedGroupId,
    onSelectedGroupChange,
    onStartNewThread,
    onStartNewThreadInGroup,
    closeOnSelect,
    onCloseThreadsView,
    setChatId,
    chatId,
    pinnedThreadIdsSet,
    threadOrderIds,
    orderedVisibleThreadIds,
    threadGroupById,
    threadPinnedById,
  });
  const {
    activeThreadDragId,
    threadDragHoverGroupId,
    threadDndSensors,
    threadDndContext,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useProjectChatHistoryDragController({
    groupSections,
    pinnedSortableGroupIds,
    unpinnedSortableGroupIds,
    groupsSortableEnabled,
    threadsSortableEnabled,
    pinnedThreadIdsSet,
    threadGroupById,
    threadPinnedById,
    onMoveThread: handleMoveThread,
    onReorderGroups: handleReorderGroups,
  });

  const panelClasses = inline
    ? "flex h-full min-h-0 w-full min-w-0 flex-col border-r border-setta-200 bg-setta-50 dark:border-setta-800 dark:bg-setta-900/40"
    : "flex h-full min-h-0 flex-col";
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
      onToggleThreadAgentBadges={handleToggleThreadAgentBadges}
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
        onFinishEditing={handleFinishEditing}
        onRenameGroup={handleRenameGroup}
        onToggleGroupPinned={handleToggleGroupPinned}
        onToggleThreadPinned={handleToggleThreadPinned}
        onDeleteGroup={handleDeleteGroup}
        onDeleteThread={handleDeleteThread}
        onSelectThread={handleSelectThread}
        onSelectGroup={handleSelectGroup}
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
