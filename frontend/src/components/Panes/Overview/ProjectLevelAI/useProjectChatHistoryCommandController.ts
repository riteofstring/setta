import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  canUndoLastProjectChatThreadStorageMutation,
  renameProjectChatThreadGroup,
  reorderProjectChatThreadGroups,
  toggleProjectChatThreadGroupPinned,
  toggleProjectChatThreadPinned,
  undoLastProjectChatThreadStorageMutation,
} from "state/actions/projectChatThreads";
import {
  createProjectChatHistoryGroup,
  deleteProjectChatHistoryGroup,
  deleteProjectChatHistoryThread,
  moveProjectChatHistoryThread,
  selectProjectChatHistoryEntry,
  startProjectChatHistoryThread,
  startProjectChatHistoryThreadInGroup,
} from "./projectChatHistoryController";
import { type ThreadDropTarget } from "./projectChatHistoryDragUtils";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroup,
} from "./projectChatHistoryViewModel";

export function useProjectChatHistoryCommandController({
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
}: {
  projectConfigId: string;
  threadGroups: Array<ThreadGroup>;
  selectedGroupId: string | null;
  onSelectedGroupChange?: (groupId: string | null) => void;
  onStartNewThread?: () => void;
  onStartNewThreadInGroup?: (groupId: string) => void;
  closeOnSelect: boolean;
  onCloseThreadsView?: () => void;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  chatId: string | null | undefined;
  pinnedThreadIdsSet: Set<string>;
  threadOrderIds: Array<string>;
  orderedVisibleThreadIds: Array<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
}) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showThreadAgentBadges, setShowThreadAgentBadges] = useState(true);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }
    const exists = threadGroups.some((group) => group.id === editingGroupId);
    if (!exists) {
      setEditingGroupId(null);
    }
  }, [editingGroupId, threadGroups]);

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

  const handleSelectGroup = useCallback(
    (groupId: string | null) => {
      onSelectedGroupChange?.(groupId);
    },
    [onSelectedGroupChange],
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

  const handleReorderGroups = useCallback(
    (nextOrderedGroupIds: Array<string>) => {
      reorderProjectChatThreadGroups(projectConfigId, nextOrderedGroupIds);
    },
    [projectConfigId],
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

  const handleToggleThreadAgentBadges = useCallback(() => {
    setShowThreadAgentBadges((prev) => !prev);
  }, []);

  const handleFinishEditing = useCallback(() => {
    setEditingGroupId(null);
  }, []);

  return {
    editingGroupId,
    setEditingGroupId,
    handleFinishEditing,
    showThreadAgentBadges,
    handleToggleThreadAgentBadges,
    canUndoDeletedThreadOrGroup:
      canUndoLastProjectChatThreadStorageMutation(projectConfigId),
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
  };
}
