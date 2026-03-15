import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import {
  useMemo,
  type ComponentProps,
  type Dispatch,
  type RefObject,
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
import { toThreadGroupDndId } from "./projectChatHistoryDnd";
import {
  ThreadGroupFolder,
  ThreadUngroupedFolder,
} from "./projectChatHistoryThreadFolders";
import {
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type ProjectChatHistoryDndProps = ComponentProps<typeof DragDropProvider>;

export function ProjectChatHistoryPanel({
  chatId,
  inline = false,
  selectedGroupId,
  editingGroupId,
  activeThreadDragId,
  threadDragHoverGroupId,
  headerPortalTarget = null,
  projectConfigId,
  threadListScrollRef,
  masterSearchInput,
  setMasterSearchInput,
  hasMasterSearch,
  masterSearchCounterText,
  masterSearchMatchCount,
  searchableGroupSections,
  pinnedSearchableGroupSections,
  unpinnedSearchableGroupSections,
  ungroupedEntries,
  pinnedSortableGroupDndIds,
  unpinnedSortableGroupDndIds,
  viewedThreadIdsSet,
  pinnedThreadIdsSet,
  groupSortableEnabledById,
  threadsSortableEnabled,
  masterSearchMatchCountByChatId,
  activeMasterSearchMatchThreadId,
  showThreadAgentBadges,
  threadAgentBadgeLabelByChatId,
  activeThreadWaitingForResponse,
  placeholderText,
  canUndoDeletedThreadOrGroup,
  threadDndSensors,
  threadDndContext,
  onStepMasterSearch,
  onToggleThreadAgentBadges,
  onRestoreDeletedThreadOrGroup,
  onCreateGroup,
  onStartEditingGroup,
  onFinishEditingGroup,
  onRenameGroup,
  onToggleGroupPinned,
  onToggleThreadPinned,
  onDeleteGroup,
  onDeleteThread,
  onSelectThread,
  onSelectGroup,
  onStartThreadInGroup,
  onStartNewThread,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  chatId: string | null | undefined;
  inline?: boolean;
  selectedGroupId: string | null;
  editingGroupId: string | null;
  activeThreadDragId: string | null;
  threadDragHoverGroupId: string | null;
  headerPortalTarget?: HTMLDivElement | null;
  projectConfigId: string;
  threadListScrollRef: RefObject<HTMLDivElement | null>;
  masterSearchInput: string;
  setMasterSearchInput: Dispatch<SetStateAction<string>>;
  hasMasterSearch: boolean;
  masterSearchCounterText: string;
  masterSearchMatchCount: number;
  searchableGroupSections: Array<ThreadGroupSection>;
  pinnedSearchableGroupSections: Array<ThreadGroupSection>;
  unpinnedSearchableGroupSections: Array<ThreadGroupSection>;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
  pinnedSortableGroupDndIds: Array<string>;
  unpinnedSortableGroupDndIds: Array<string>;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  groupSortableEnabledById: Map<string, boolean>;
  threadsSortableEnabled: boolean;
  masterSearchMatchCountByChatId: Map<string, number>;
  activeMasterSearchMatchThreadId: string | null;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  activeThreadWaitingForResponse: boolean;
  placeholderText: string;
  canUndoDeletedThreadOrGroup: boolean;
  threadDndSensors: ProjectChatHistoryDndProps["sensors"];
  threadDndContext: ProjectChatHistoryDndProps["dndContext"];
  onStepMasterSearch: (direction: "previous" | "next") => void;
  onToggleThreadAgentBadges: () => void;
  onRestoreDeletedThreadOrGroup: () => void;
  onCreateGroup: () => void;
  onStartEditingGroup: (groupId: string | null) => void;
  onFinishEditingGroup: () => void;
  onRenameGroup: (groupId: string, nextName: string) => boolean;
  onToggleGroupPinned: (groupId: string) => void;
  onToggleThreadPinned: (threadId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
  onSelectGroup: (groupId: string | null) => void;
  onStartThreadInGroup: (groupId: string) => void;
  onStartNewThread: () => void;
  onDragStart: ProjectChatHistoryDndProps["onDragStart"];
  onDragMove: ProjectChatHistoryDndProps["onDragMove"];
  onDragEnd: ProjectChatHistoryDndProps["onDragEnd"];
  onDragCancel: ProjectChatHistoryDndProps["onDragCancel"];
}) {
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
              onClick={() => onStepMasterSearch("previous")}
              disabled={masterSearchMatchCount === 0}
            >
              <MdChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next conversation result"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
              onClick={() => onStepMasterSearch("next")}
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
        onClick={onToggleThreadAgentBadges}
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
        onClick={onRestoreDeletedThreadOrGroup}
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
        onClick={onCreateGroup}
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
                    onClick={onStartNewThread}
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
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
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
                              onStartEditing={onStartEditingGroup}
                              onFinishEditing={onFinishEditingGroup}
                              onRenameGroup={onRenameGroup}
                              onToggleGroupPinned={onToggleGroupPinned}
                              onToggleThreadPinned={onToggleThreadPinned}
                              onDeleteGroup={onDeleteGroup}
                              onDeleteThread={onDeleteThread}
                              onSelectThread={onSelectThread}
                              onSelectGroup={onSelectGroup}
                              onStartThreadInGroup={onStartThreadInGroup}
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
                              onStartEditing={onStartEditingGroup}
                              onFinishEditing={onFinishEditingGroup}
                              onRenameGroup={onRenameGroup}
                              onToggleGroupPinned={onToggleGroupPinned}
                              onToggleThreadPinned={onToggleThreadPinned}
                              onDeleteGroup={onDeleteGroup}
                              onDeleteThread={onDeleteThread}
                              onSelectThread={onSelectThread}
                              onSelectGroup={onSelectGroup}
                              onStartThreadInGroup={onStartThreadInGroup}
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
                  onToggleThreadPinned={onToggleThreadPinned}
                  onDeleteThread={onDeleteThread}
                  onSelectThread={onSelectThread}
                  onSelectGroup={onSelectGroup}
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
