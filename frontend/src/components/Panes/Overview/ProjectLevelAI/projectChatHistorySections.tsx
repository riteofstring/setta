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
import { toggleProjectChatThreadGroupCollapsed } from "state/actions/projectChatThreads";
import { partitionEntriesByPinned } from "./projectChatHistoryDerived";
import {
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  getProjectChatDeleteRecoveryTooltipContent,
  isDraftThreadEntry,
  isThreadEntryActive,
  normalizeThreadGroupNameForEditing,
  toThreadDndId,
  toThreadDropTargetId,
  toThreadSectionDropTargetId,
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
  type ThreadPinDomain,
} from "./projectChatHistoryShared";
import { ThreadEntryLine } from "./ProjectChatHistoryThreadEntryLine";

type SharedThreadListProps = {
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
};

type ThreadGroupFolderProps = SharedThreadListProps & {
  section: ThreadGroupSection;
  groupDndId: string;
  projectConfigId: string;
  groupSortableEnabled: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isThreadDragActive: boolean;
  isThreadDragHovering: boolean;
  onStartEditing: (groupId: string | null) => void;
  onFinishEditing: () => void;
  onRenameGroup: (groupId: string, nextName: string) => boolean;
  onToggleGroupPinned: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onStartThreadInGroup: (groupId: string) => void;
};

type ThreadUngroupedFolderProps = SharedThreadListProps & {
  entries: Array<ProjectChatHistoryEntry>;
  hasGroupsAbove: boolean;
};

export function ThreadGroupFolder(props: ThreadGroupFolderProps) {
  const {
    activeMasterSearchMatchThreadId,
    activeThreadWaitingForResponse,
    chatId,
    groupDndId,
    groupSortableEnabled,
    hasMasterSearch,
    isEditing,
    isSelected,
    isThreadDragActive,
    isThreadDragHovering,
    masterSearchMatchCountByChatId,
    onDeleteGroup,
    onDeleteThread,
    onFinishEditing,
    onRenameGroup,
    onSelectGroup,
    onSelectThread,
    onStartEditing,
    onStartThreadInGroup,
    onToggleGroupPinned,
    onToggleThreadPinned,
    pinnedThreadIdsSet,
    projectConfigId,
    section,
    showThreadAgentBadges,
    threadAgentBadgeLabelByChatId,
    threadSortableEnabled,
    viewedThreadIdsSet,
  } = props;
  const sortable = useDisplacementSortableListItem(
    groupDndId,
    !groupSortableEnabled,
    "vertical",
  );
  const groupSectionDropTarget = useDroppable({
    id: toThreadSectionDropTargetId(section.id),
    data: {
      type: "project-chat-thread-section-drop-target",
      groupId: section.id,
    },
  });
  const entryPartitions = usePartitionedThreadEntries({
    entries: section.entries,
    pinnedThreadIdsSet,
  });
  const [draftName, setDraftName] = useState(section.name);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftName(section.name);
  }, [section.name]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    editInputRef.current?.focus();
    editInputRef.current?.select();
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
        className={`rounded ${buildGroupDropSurfaceClassName({
          isThreadDragActive,
          isThreadDragHovering,
          isOver: groupSectionDropTarget.isOver,
        })}`}
        data-testid="project-chat-thread-group-drop-surface"
        data-drop-highlight={
          groupSectionDropTarget.isOver ||
          (isThreadDragActive && isThreadDragHovering)
            ? "true"
            : "false"
        }
        data-drop-active={groupSectionDropTarget.isOver ? "true" : "false"}
      >
        <ThreadGroupHeader
          commitRename={commitRename}
          draftName={draftName}
          editInputRef={editInputRef}
          groupSortableEnabled={groupSortableEnabled}
          isEditing={isEditing}
          isSelected={isSelected}
          onCancelRename={cancelRename}
          onChangeDraftName={setDraftName}
          onDeleteGroup={onDeleteGroup}
          onSelectGroup={onSelectGroup}
          onStartEditing={onStartEditing}
          onStartThreadInGroup={onStartThreadInGroup}
          onToggleGroupPinned={onToggleGroupPinned}
          projectConfigId={projectConfigId}
          section={section}
          setActivatorNodeRef={sortable.setActivatorNodeRef}
          sortableListeners={
            groupSortableEnabled ? { ...sortable.listeners } : {}
          }
        />
        {!section.collapsed ? (
          <div
            className="ml-1 flex flex-col gap-1 border-l border-setta-200/70 pl-1 dark:border-setta-700/70"
            data-testid="project-chat-thread-group-entries"
          >
            <ThreadEntrySections
              activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
              activeThreadWaitingForResponse={activeThreadWaitingForResponse}
              chatId={chatId}
              emptyText="No threads in this group."
              entriesByPinDomain={entryPartitions}
              groupId={section.id}
              hasMasterSearch={hasMasterSearch}
              masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
              onDeleteThread={onDeleteThread}
              onSelectGroup={onSelectGroup}
              onSelectThread={onSelectThread}
              onToggleThreadPinned={onToggleThreadPinned}
              pinnedThreadIdsSet={pinnedThreadIdsSet}
              selectGroupId={section.id}
              showThreadAgentBadges={showThreadAgentBadges}
              threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
              threadSortableEnabled={threadSortableEnabled}
              viewedThreadIdsSet={viewedThreadIdsSet}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ThreadUngroupedFolder({
  entries,
  hasGroupsAbove,
  ...threadListProps
}: ThreadUngroupedFolderProps) {
  const entryPartitions = usePartitionedThreadEntries({
    entries,
    pinnedThreadIdsSet: threadListProps.pinnedThreadIdsSet,
  });

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
        <ThreadEntrySections
          {...threadListProps}
          emptyText={null}
          entriesByPinDomain={entryPartitions}
          groupId={null}
          selectGroupId={null}
        />
      </div>
    </section>
  );
}

function ThreadGroupHeader({
  commitRename,
  draftName,
  editInputRef,
  groupSortableEnabled,
  isEditing,
  isSelected,
  onCancelRename,
  onChangeDraftName,
  onDeleteGroup,
  onSelectGroup,
  onStartEditing,
  onStartThreadInGroup,
  onToggleGroupPinned,
  projectConfigId,
  section,
  setActivatorNodeRef,
  sortableListeners,
}: {
  commitRename: () => void;
  draftName: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  groupSortableEnabled: boolean;
  isEditing: boolean;
  isSelected: boolean;
  onCancelRename: () => void;
  onChangeDraftName: (value: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string | null) => void;
  onStartEditing: (groupId: string | null) => void;
  onStartThreadInGroup: (groupId: string) => void;
  onToggleGroupPinned: (groupId: string) => void;
  projectConfigId: string;
  section: ThreadGroupSection;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  sortableListeners: Record<string, unknown>;
}) {
  return (
    <div className="group relative flex w-full items-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800">
      {isEditing ? (
        <EditableThreadGroupHeader
          commitRename={commitRename}
          draftName={draftName}
          editInputRef={editInputRef}
          onCancelRename={onCancelRename}
          onChangeDraftName={onChangeDraftName}
          section={section}
          setActivatorNodeRef={setActivatorNodeRef}
        />
      ) : (
        <StaticThreadGroupHeader
          groupSortableEnabled={groupSortableEnabled}
          isSelected={isSelected}
          onSelectGroup={onSelectGroup}
          projectConfigId={projectConfigId}
          section={section}
          setActivatorNodeRef={setActivatorNodeRef}
          sortableListeners={sortableListeners}
        />
      )}
      <ThreadGroupActionButtons
        onDeleteGroup={onDeleteGroup}
        onStartEditing={onStartEditing}
        onStartThreadInGroup={onStartThreadInGroup}
        onToggleGroupPinned={onToggleGroupPinned}
        section={section}
      />
    </div>
  );
}

function EditableThreadGroupHeader({
  commitRename,
  draftName,
  editInputRef,
  onCancelRename,
  onChangeDraftName,
  section,
  setActivatorNodeRef,
}: {
  commitRename: () => void;
  draftName: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onCancelRename: () => void;
  onChangeDraftName: (value: string) => void;
  section: ThreadGroupSection;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) {
  return (
    <div
      key="group-edit-row"
      className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5"
    >
      <span
        ref={setActivatorNodeRef}
        className="h-0 w-0 overflow-hidden"
        aria-hidden="true"
      />
      <ThreadGroupFolderIcon collapsed={section.collapsed} />
      <input
        ref={editInputRef}
        type="text"
        value={draftName}
        className="h-6 min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 text-[11px] font-semibold normal-case tracking-normal text-setta-800 outline-none ring-blue-400 focus:ring-2 dark:border-blue-500 dark:bg-setta-900 dark:text-setta-100"
        onChange={(event) => onChangeDraftName(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) =>
          handleThreadGroupEditKeyDown(event, onCancelRename)
        }
        data-testid="project-chat-thread-group-name-input"
      />
    </div>
  );
}

function StaticThreadGroupHeader({
  groupSortableEnabled,
  isSelected,
  onSelectGroup,
  projectConfigId,
  section,
  setActivatorNodeRef,
  sortableListeners,
}: {
  groupSortableEnabled: boolean;
  isSelected: boolean;
  onSelectGroup: (groupId: string | null) => void;
  projectConfigId: string;
  section: ThreadGroupSection;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  sortableListeners: Record<string, unknown>;
}) {
  const handleSelect = () => {
    onSelectGroup(section.id);
    toggleProjectChatThreadGroupCollapsed(projectConfigId, section.id);
  };
  return (
    <div
      key="group-select-row"
      className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 pr-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-focus-within:pr-[5.5rem] group-hover:pr-[5.5rem]"
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(event) => handleThreadGroupSelectKeyDown(event, handleSelect)}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 text-left"
        data-testid="project-chat-thread-group-select"
      >
        <span
          ref={setActivatorNodeRef}
          className={buildThreadGroupDragHandleClassName(groupSortableEnabled)}
          data-testid="project-chat-thread-group-drag-handle"
          aria-label={groupSortableEnabled ? "Drag thread group" : undefined}
          onClick={stopPropagation}
          {...sortableListeners}
        >
          <ThreadGroupHandleIcon
            collapsed={section.collapsed}
            groupSortableEnabled={groupSortableEnabled}
          />
        </span>
        <span
          className={`truncate ${isSelected ? "text-blue-700 dark:text-blue-300" : ""}`}
        >
          {section.name}
        </span>
      </div>
    </div>
  );
}

function ThreadGroupActionButtons({
  onDeleteGroup,
  onStartEditing,
  onStartThreadInGroup,
  onToggleGroupPinned,
  section,
}: {
  onDeleteGroup: (groupId: string) => void;
  onStartEditing: (groupId: string | null) => void;
  onStartThreadInGroup: (groupId: string) => void;
  onToggleGroupPinned: (groupId: string) => void;
  section: ThreadGroupSection;
}) {
  const actionHandlers = useThreadGroupActionHandlers(section);
  return (
    <div className="pointer-events-none absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:text-setta-500 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
        aria-label="New chat in thread group"
        onPointerDown={stopPropagation}
        onClick={(event) => {
          stopPropagation(event);
          onStartThreadInGroup(section.id);
        }}
        data-testid="project-chat-thread-group-new-chat-button"
        {...actionHandlers.newChatTooltipHandlers}
      >
        <RiChatNewFill size={12} />
      </button>
      <button
        type="button"
        className={buildGroupPinButtonClassName(section.pinned ?? false)}
        aria-label={section.pinned ? "Unpin thread group" : "Pin thread group"}
        onPointerDown={stopPropagation}
        onClick={(event) => {
          stopPropagation(event);
          onToggleGroupPinned(section.id);
        }}
        data-testid="project-chat-thread-group-pin-button"
        {...actionHandlers.groupPinTooltipHandlers}
      >
        <MdPushPin size={13} />
      </button>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-setta-200 hover:text-setta-700 dark:text-setta-500 dark:hover:bg-setta-700 dark:hover:text-setta-200"
        aria-label="Edit thread group name"
        onPointerDown={stopPropagation}
        onClick={(event) => {
          stopPropagation(event);
          onStartEditing(section.id);
        }}
        data-testid="project-chat-thread-group-edit-button"
        {...actionHandlers.groupEditTooltipHandlers}
      >
        <FiEdit3 size={12} />
      </button>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-setta-500 dark:hover:bg-red-950/50 dark:hover:text-red-300"
        aria-label="Delete thread group"
        onPointerDown={stopPropagation}
        onClick={(event) => {
          stopPropagation(event);
          onDeleteGroup(section.id);
        }}
        data-testid="project-chat-thread-group-delete-button"
        {...actionHandlers.groupDeleteTooltipHandlers}
      >
        <FiTrash2 size={12} />
      </button>
    </div>
  );
}

function ThreadEntrySections({
  activeMasterSearchMatchThreadId,
  activeThreadWaitingForResponse,
  chatId,
  emptyText,
  entriesByPinDomain,
  groupId,
  hasMasterSearch,
  masterSearchMatchCountByChatId,
  onDeleteThread,
  onSelectGroup,
  onSelectThread,
  onToggleThreadPinned,
  pinnedThreadIdsSet,
  selectGroupId,
  showThreadAgentBadges,
  threadAgentBadgeLabelByChatId,
  threadSortableEnabled,
  viewedThreadIdsSet,
}: SharedThreadListProps & {
  emptyText: string | null;
  entriesByPinDomain: {
    pinnedEntries: Array<ProjectChatHistoryEntry>;
    unpinnedEntries: Array<ProjectChatHistoryEntry>;
  };
  groupId: string | null;
  selectGroupId: string | null;
}) {
  const { pinnedEntries, unpinnedEntries } = entriesByPinDomain;
  const hasPinnedEntries = pinnedEntries.length > 0;
  const hasAnyEntries = hasPinnedEntries || unpinnedEntries.length > 0;

  return (
    <>
      <ThreadEntrySection
        activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
        activeThreadWaitingForResponse={activeThreadWaitingForResponse}
        chatId={chatId}
        entries={pinnedEntries}
        groupId={groupId}
        hasLabel={hasPinnedEntries}
        hasMasterSearch={hasMasterSearch}
        label="Pinned"
        masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
        onDeleteThread={onDeleteThread}
        onSelectGroup={onSelectGroup}
        onSelectThread={onSelectThread}
        onToggleThreadPinned={onToggleThreadPinned}
        pinDomain={PINNED_THREAD_DOMAIN}
        pinnedThreadIdsSet={pinnedThreadIdsSet}
        selectGroupId={selectGroupId}
        showThreadAgentBadges={showThreadAgentBadges}
        threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
        threadSortableEnabled={threadSortableEnabled}
        viewedThreadIdsSet={viewedThreadIdsSet}
      />
      <ThreadEntrySection
        activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
        activeThreadWaitingForResponse={activeThreadWaitingForResponse}
        chatId={chatId}
        emptyText={
          hasPinnedEntries && unpinnedEntries.length === 0
            ? "No unpinned threads."
            : null
        }
        entries={unpinnedEntries}
        groupId={groupId}
        hasLabel={hasPinnedEntries}
        hasMasterSearch={hasMasterSearch}
        label="Unpinned"
        masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
        onDeleteThread={onDeleteThread}
        onSelectGroup={onSelectGroup}
        onSelectThread={onSelectThread}
        onToggleThreadPinned={onToggleThreadPinned}
        pinDomain={UNPINNED_THREAD_DOMAIN}
        pinnedThreadIdsSet={pinnedThreadIdsSet}
        selectGroupId={selectGroupId}
        showThreadAgentBadges={showThreadAgentBadges}
        threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
        threadSortableEnabled={threadSortableEnabled}
        viewedThreadIdsSet={viewedThreadIdsSet}
      />
      {!hasAnyEntries && emptyText ? (
        <p className="py-1 text-[11px] text-setta-400 dark:text-setta-500">
          {emptyText}
        </p>
      ) : null}
    </>
  );
}

function ThreadEntrySection({
  activeMasterSearchMatchThreadId,
  activeThreadWaitingForResponse,
  chatId,
  emptyText = null,
  entries,
  groupId,
  hasLabel,
  hasMasterSearch,
  label,
  masterSearchMatchCountByChatId,
  onDeleteThread,
  onSelectGroup,
  onSelectThread,
  onToggleThreadPinned,
  pinDomain,
  pinnedThreadIdsSet,
  selectGroupId,
  showThreadAgentBadges,
  threadAgentBadgeLabelByChatId,
  threadSortableEnabled,
  viewedThreadIdsSet,
}: SharedThreadListProps & {
  emptyText?: string | null;
  entries: Array<ProjectChatHistoryEntry>;
  groupId: string | null;
  hasLabel: boolean;
  label: string;
  pinDomain: ThreadPinDomain;
  selectGroupId: string | null;
}) {
  if (entries.length === 0 && !emptyText && !hasLabel) {
    return null;
  }
  const sortableIds = useMemo(
    () => entries.map((entry) => toThreadDndId(entry.chatId)),
    [entries],
  );

  return (
    <section className="flex flex-col gap-1">
      {hasLabel ? <ThreadSectionLabel label={label} /> : null}
      {entries.length > 0 ? (
        <ThreadDropZone groupId={groupId} pinDomain={pinDomain}>
          <SortableContext
            id={buildThreadSortableContextId(groupId, pinDomain)}
            items={sortableIds}
            strategy={verticalListSortingStrategy}
            forceSorting
          >
            {entries.map((entry) => (
              <ThreadEntryLine
                key={entry.chatId}
                activeThreadWaitingForResponse={activeThreadWaitingForResponse}
                agentBadgeLabel={
                  threadAgentBadgeLabelByChatId.get(entry.chatId) ?? null
                }
                entry={entry}
                isActive={isThreadEntryActive(entry, chatId)}
                isDraft={isDraftThreadEntry(entry)}
                isPinned={pinnedThreadIdsSet.has(entry.chatId)}
                isSearchMatchActive={
                  activeMasterSearchMatchThreadId === entry.chatId
                }
                isViewed={
                  isDraftThreadEntry(entry) ||
                  viewedThreadIdsSet.has(entry.chatId) ||
                  entry.chatId === chatId
                }
                onDelete={onDeleteThread}
                onSelect={(selectedEntry) => {
                  onSelectGroup(selectGroupId);
                  onSelectThread(selectedEntry);
                }}
                onTogglePinned={onToggleThreadPinned}
                pinDomain={pinDomain}
                searchMatchCount={
                  hasMasterSearch
                    ? masterSearchMatchCountByChatId.get(entry.chatId) ?? 0
                    : null
                }
                showAgentBadges={showThreadAgentBadges}
                sortableEnabled={threadSortableEnabled}
                threadGroupId={groupId}
              />
            ))}
          </SortableContext>
        </ThreadDropZone>
      ) : null}
      {entries.length === 0 && emptyText ? (
        <p
          className="px-1 py-1 text-[11px] text-setta-400 dark:text-setta-500"
          data-testid="project-chat-thread-unpinned-empty-state"
        >
          {emptyText}
        </p>
      ) : null}
    </section>
  );
}

function ThreadSectionLabel({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
      data-testid={`project-chat-thread-${label.toLowerCase()}-section-label`}
    >
      <span>{label}</span>
    </div>
  );
}

function ThreadDropZone({
  groupId,
  pinDomain,
  children,
}: {
  groupId: string | null;
  pinDomain: ThreadPinDomain;
  children: React.ReactNode;
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
      className={`flex flex-col ${
        isOver
          ? "rounded border border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20"
          : ""
      }`}
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

function usePartitionedThreadEntries({
  entries,
  pinnedThreadIdsSet,
}: {
  entries: Array<ProjectChatHistoryEntry>;
  pinnedThreadIdsSet: Set<string>;
}) {
  return useMemo(
    () => partitionEntriesByPinned({ entries, pinnedThreadIdsSet }),
    [entries, pinnedThreadIdsSet],
  );
}

function useThreadGroupActionHandlers(section: ThreadGroupSection) {
  return useMemo(
    () => ({
      groupDeleteTooltipHandlers: getFloatingBoxHandlers({
        title: "Delete thread group",
        content: getProjectChatDeleteRecoveryTooltipContent("group"),
      }),
      groupEditTooltipHandlers: getFloatingBoxHandlers({
        title: "Edit thread group name",
        content: "Rename this group in place.",
      }),
      groupPinTooltipHandlers: getFloatingBoxHandlers({
        title: section.pinned ? "Unpin thread group" : "Pin thread group",
        content: section.pinned
          ? "Move this group back to the unpinned section."
          : "Keep this group at the top in the pinned section.",
      }),
      newChatTooltipHandlers: getFloatingBoxHandlers({
        title: "New chat",
        content: "Start a new chat in this group.",
      }),
    }),
    [section.pinned],
  );
}

function buildThreadSortableContextId(
  groupId: string | null,
  pinDomain: ThreadPinDomain,
): string {
  return `project-chat-threads:${groupId ?? "ungrouped"}:${pinDomain}`;
}

function buildGroupDropSurfaceClassName({
  isThreadDragActive,
  isThreadDragHovering,
  isOver,
}: {
  isThreadDragActive: boolean;
  isThreadDragHovering: boolean;
  isOver: boolean;
}) {
  if (!(isOver || (isThreadDragActive && isThreadDragHovering))) {
    return "";
  }
  return isOver
    ? "border border-blue-500/60 bg-blue-100/70 dark:bg-blue-900/35"
    : "border border-dashed border-blue-400/60 bg-blue-50/70 dark:bg-blue-950/20";
}

function buildThreadGroupDragHandleClassName(enabled: boolean): string {
  return `inline-flex h-4 w-4 shrink-0 items-center justify-center ${
    enabled
      ? "cursor-grab touch-none text-setta-400 active:cursor-grabbing"
      : "text-setta-400"
  }`;
}

function buildGroupPinButtonClassName(isPinned: boolean): string {
  return `inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
    isPinned
      ? "text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
      : "text-setta-400 hover:bg-setta-200 dark:text-setta-500 dark:hover:bg-setta-700"
  }`;
}

function handleThreadGroupEditKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  onCancelRename: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onCancelRename();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function handleThreadGroupSelectKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  onSelect: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

function ThreadGroupHandleIcon({
  collapsed,
  groupSortableEnabled,
}: {
  collapsed: boolean;
  groupSortableEnabled: boolean;
}) {
  const folderIcon = <ThreadGroupFolderIcon collapsed={collapsed} />;
  if (!groupSortableEnabled) {
    return folderIcon;
  }
  return (
    <>
      <span className="inline-flex group-hover:hidden">{folderIcon}</span>
      <span className="hidden group-hover:inline-flex">
        <RxDragHandleDots2 size={13} />
      </span>
    </>
  );
}

function ThreadGroupFolderIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <TbFolder size={14} className="text-setta-400" />
  ) : (
    <TbFolderOpen size={14} className="text-setta-400" />
  );
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}
