import { useSortableListItem as useDisplacementSortableListItem } from "components/Pages/Project/ViewModeDnd";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  SortableContext,
  useDroppable,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiEdit3, FiTrash2 } from "react-icons/fi";
import { MdPushPin } from "react-icons/md";
import { RiChatNewFill } from "react-icons/ri";
import { RxDragHandleDots2 } from "react-icons/rx";
import { TbFolder, TbFolderOpen } from "react-icons/tb";
import { toggleProjectChatThreadGroupCollapsed } from "state/actions/projectChatThreadGroupOrdering";
import { getProjectChatDeleteRecoveryTooltipContent } from "./projectChatHistoryCopy";
import {
  toThreadDndId,
  toThreadSectionDropTargetId,
} from "./projectChatHistoryDnd";
import {
  isThreadEntryActive,
  ThreadDropZone,
  ThreadEntryLine,
} from "./projectChatHistoryThreadEntry";
import {
  isDraftThreadEntry,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

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

export function ThreadGroupFolder({
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
  activeThreadWaitingForResponse?: boolean;
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

export function ThreadUngroupedFolder({
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

function normalizeThreadGroupNameForEditing(name: string): string | null {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized;
}

export function buildDefaultThreadGroupName(groupNames: Array<string>): string {
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
