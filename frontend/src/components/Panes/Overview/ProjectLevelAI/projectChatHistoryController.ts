import {
  createProjectChatThreadGroup,
  deleteProjectChatThread,
  deleteProjectChatThreadGroup,
  markProjectChatThreadViewed,
  reorderProjectChatThreads,
  setProjectChatThreadGroupAssignment,
} from "state/actions/projectChatThreads";
import {
  buildDefaultThreadGroupName,
  buildNextThreadOrder,
  DRAFT_THREAD_ENTRY_ID,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ThreadDropTarget,
} from "./projectChatHistoryDragUtils";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

export function createProjectChatHistoryGroup({
  projectConfigId,
  existingGroupNames,
  onSelectedGroupChange,
  setEditingGroupId,
}: {
  projectConfigId: string;
  existingGroupNames: Array<string>;
  onSelectedGroupChange?: (groupId: string | null) => void;
  setEditingGroupId: (groupId: string | null) => void;
}): void {
  const groupName = buildDefaultThreadGroupName(existingGroupNames);
  const groupId = createProjectChatThreadGroup(projectConfigId, groupName);
  if (!groupId) {
    return;
  }
  onSelectedGroupChange?.(groupId);
  setEditingGroupId(groupId);
}

export function selectProjectChatHistoryEntry({
  entry,
  closeOnSelect,
  onCloseThreadsView,
  projectConfigId,
  setChatId,
}: {
  entry: ProjectChatHistoryEntry;
  closeOnSelect: boolean;
  onCloseThreadsView?: () => void;
  projectConfigId: string;
  setChatId: (nextChatId: string | null | undefined) => void;
}): void {
  if (entry.chatId === DRAFT_THREAD_ENTRY_ID) {
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
}

export function startProjectChatHistoryThreadInGroup({
  groupId,
  onSelectedGroupChange,
  onStartNewThreadInGroup,
  setChatId,
  closeOnSelect,
  onCloseThreadsView,
}: {
  groupId: string;
  onSelectedGroupChange?: (groupId: string | null) => void;
  onStartNewThreadInGroup?: (groupId: string) => void;
  setChatId: (nextChatId: string | null | undefined) => void;
  closeOnSelect: boolean;
  onCloseThreadsView?: () => void;
}): void {
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
}

export function startProjectChatHistoryThread({
  onStartNewThread,
  selectedGroupId,
  onStartNewThreadInGroup,
  startThreadInGroup,
  setChatId,
  closeOnSelect,
  onCloseThreadsView,
}: {
  onStartNewThread?: () => void;
  selectedGroupId: string | null;
  onStartNewThreadInGroup?: (groupId: string) => void;
  startThreadInGroup: (groupId: string) => void;
  setChatId: (nextChatId: string | null | undefined) => void;
  closeOnSelect: boolean;
  onCloseThreadsView?: () => void;
}): void {
  if (onStartNewThread) {
    onStartNewThread();
    return;
  }
  if (selectedGroupId && onStartNewThreadInGroup) {
    startThreadInGroup(selectedGroupId);
    return;
  }
  setChatId(undefined);
  if (!closeOnSelect) {
    return;
  }
  onCloseThreadsView?.();
}

export function moveProjectChatHistoryThread({
  sourceThreadId,
  dropTarget,
  pinnedThreadIdsSet,
  threadOrderIds,
  orderedVisibleThreadIds,
  threadGroupById,
  threadPinnedById,
  projectConfigId,
  onSelectedGroupChange,
}: {
  sourceThreadId: string;
  dropTarget: ThreadDropTarget;
  pinnedThreadIdsSet: Set<string>;
  threadOrderIds: Array<string>;
  orderedVisibleThreadIds: Array<string>;
  threadGroupById: Map<string, string | null>;
  threadPinnedById: Map<string, boolean>;
  projectConfigId: string;
  onSelectedGroupChange?: (groupId: string | null) => void;
}): void {
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
}

export function deleteProjectChatHistoryThread({
  projectConfigId,
  threadId,
  chatId,
  setChatId,
}: {
  projectConfigId: string;
  threadId: string;
  chatId: string | null | undefined;
  setChatId: (nextChatId: string | null | undefined) => void;
}): void {
  const deleted = deleteProjectChatThread(projectConfigId, threadId);
  if (!deleted) {
    return;
  }
  if (chatId === threadId) {
    setChatId(undefined);
  }
}

export function deleteProjectChatHistoryGroup({
  projectConfigId,
  groupId,
  selectedGroupId,
  onSelectedGroupChange,
}: {
  projectConfigId: string;
  groupId: string;
  selectedGroupId: string | null;
  onSelectedGroupChange?: (groupId: string | null) => void;
}): void {
  const deleted = deleteProjectChatThreadGroup(projectConfigId, groupId);
  if (!deleted) {
    return;
  }
  if (selectedGroupId === groupId) {
    onSelectedGroupChange?.(null);
  }
}
