import { PointerSensor } from "@dnd-kit/dom";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import {
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "forks/dnd-kit/adapter";
import { createPortal } from "react-dom";
import {
  MdAdd,
  MdCategory,
  MdChevronLeft,
  MdChevronRight,
  MdRestore,
} from "react-icons/md";
import { RiChatNewFill } from "react-icons/ri";
import {
  ThreadGroupFolder,
  ThreadUngroupedFolder,
} from "./projectChatHistorySections";
import {
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
  toThreadGroupDndId,
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryShared";

type ProjectChatHistoryPanelProps = {
  activeMasterSearchMatchThreadId: string | null;
  activeMasterSearchMatchThreadIdCounterText: string;
  activeThreadDragId: string | null;
  activeThreadWaitingForResponse: boolean;
  canUndoDeletedThreadOrGroup: boolean;
  chatId: string | null | undefined;
  debugLabel: string;
  editingGroupId: string | null;
  emptyStateText: string;
  groupSortableEnabledById: Map<string, boolean>;
  groupsSortableEnabled: boolean;
  handleCreateGroup: () => void;
  handleDeleteGroup: (groupId: string) => void;
  handleDeleteThread: (threadId: string) => void;
  handleDragCancel: () => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragMove: (event: DragMoveEvent) => void;
  handleDragStart: (event: DragStartEvent) => void;
  handleRenameGroup: (groupId: string, nextName: string) => boolean;
  handleRestoreDeletedThreadOrGroup: () => void;
  handleSelectThread: (entry: ProjectChatHistoryEntry) => void;
  handleStartNewThread: () => void;
  handleStartThreadInGroup: (groupId: string) => void;
  handleStepMasterSearch: (direction: "previous" | "next") => void;
  handleToggleGroupPinned: (groupId: string) => void;
  handleToggleThreadPinned: (threadId: string) => void;
  hasAnyContent: boolean;
  hasMasterSearch: boolean;
  headerPortalTarget: HTMLDivElement | null;
  inline: boolean;
  masterSearchInput: string;
  masterSearchMatchCount: number;
  masterSearchMatchCountByChatId: Map<string, number>;
  onMasterSearchInputChange: (value: string) => void;
  onSelectedGroupChange?: (groupId: string | null) => void;
  pinnedSearchableGroupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupDndIds: Array<string>;
  pinnedThreadIdsSet: Set<string>;
  projectConfigId: string;
  searchableGroupSections: Array<ThreadGroupSection>;
  selectedGroupId: string | null;
  setEditingGroupId: (groupId: string | null) => void;
  setShowThreadAgentBadges: (
    value: boolean | ((current: boolean) => boolean),
  ) => void;
  showNoThreadsPlaceholder: boolean;
  showThreadAgentBadges: boolean;
  threadAgentBadgeLabelByChatId: Map<string, string>;
  threadDndContext: {
    isMovingFree: boolean;
    isSorting: boolean;
  };
  threadDndSensors: ReturnType<typeof PointerSensor.configure>;
  threadDragHoverGroupId: string | null;
  threadListScrollRef: React.RefObject<HTMLDivElement | null>;
  threadsSortableEnabled: boolean;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
  unpinnedSearchableGroupSections: Array<ThreadGroupSection>;
  unpinnedSortableGroupDndIds: Array<string>;
  viewedThreadIdsSet: Set<string>;
};

export function ProjectChatHistoryPanel(props: ProjectChatHistoryPanelProps) {
  const panelClasses = props.inline
    ? "flex h-full min-h-0 w-full min-w-0 flex-col border-r border-setta-200 bg-setta-50 dark:border-setta-800 dark:bg-setta-900/40"
    : "flex h-full min-h-0 flex-col";

  return (
    <section
      className={`${panelClasses} [&_button]:cursor-pointer`}
      data-testid="project-chat-threads-panel"
      data-inline={props.inline ? "true" : "false"}
    >
      <ProjectChatHistoryHeader {...props} />
      <ProjectChatHistoryBody {...props} />
    </section>
  );
}

function ProjectChatHistoryHeader(props: ProjectChatHistoryPanelProps) {
  const toolbar = <ProjectChatHistoryToolbar {...props} />;
  if (props.headerPortalTarget) {
    return createPortal(
      <div className="flex h-full w-full min-w-0 items-start px-2 pt-2 [&_button]:cursor-pointer">
        {toolbar}
      </div>,
      props.headerPortalTarget,
    );
  }
  return (
    <header className="border-b border-setta-200 px-3 py-2 dark:border-setta-800">
      {toolbar}
    </header>
  );
}

function ProjectChatHistoryToolbar({
  activeMasterSearchMatchThreadIdCounterText,
  canUndoDeletedThreadOrGroup,
  handleCreateGroup,
  handleRestoreDeletedThreadOrGroup,
  handleStepMasterSearch,
  hasMasterSearch,
  masterSearchInput,
  masterSearchMatchCount,
  onMasterSearchInputChange,
  setShowThreadAgentBadges,
  showThreadAgentBadges,
}: ProjectChatHistoryPanelProps) {
  const newGroupTooltipHandlers = getFloatingBoxHandlers({
    title: "New group",
    content: "Create a new thread group and rename it.",
  });
  const agentBadgeToggleTooltipHandlers = getFloatingBoxHandlers({
    title: showThreadAgentBadges ? "Hide thread badges" : "Show thread badges",
    content: showThreadAgentBadges
      ? "Hide the per-thread engine badge labels."
      : "Show the per-thread engine badge labels.",
  });
  const restoreThreadMutationTooltipHandlers = getFloatingBoxHandlers({
    title: "Undo last thread delete",
    content:
      "Undo the most recently deleted thread or thread group in this project.",
  });

  return (
    <div
      className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap @container"
      data-testid="project-chat-threads-toolbar"
    >
      <ProjectChatHistorySearch
        counterText={activeMasterSearchMatchThreadIdCounterText}
        hasMasterSearch={hasMasterSearch}
        inputValue={masterSearchInput}
        matchCount={masterSearchMatchCount}
        onChange={onMasterSearchInputChange}
        onStep={handleStepMasterSearch}
      />
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
        onClick={() => {
          setShowThreadAgentBadges((current) => !current);
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
}

function ProjectChatHistorySearch({
  counterText,
  hasMasterSearch,
  inputValue,
  matchCount,
  onChange,
  onStep,
}: {
  counterText: string;
  hasMasterSearch: boolean;
  inputValue: string;
  matchCount: number;
  onChange: (value: string) => void;
  onStep: (direction: "previous" | "next") => void;
}) {
  return (
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
        value={inputValue}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        placeholder="Search conversations"
        className={`w-full min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-5 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600 ${
          hasMasterSearch ? "pr-16" : "pr-2"
        }`}
      />
      {hasMasterSearch ? (
        <div className="absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
          <span className="min-w-[34px] px-0.5 text-center text-[10px] text-setta-400 dark:text-setta-500">
            {counterText}
          </span>
          <SearchStepButton
            ariaLabel="Previous conversation result"
            direction="previous"
            disabled={matchCount === 0}
            onStep={onStep}
          >
            <MdChevronLeft />
          </SearchStepButton>
          <SearchStepButton
            ariaLabel="Next conversation result"
            direction="next"
            disabled={matchCount === 0}
            onStep={onStep}
          >
            <MdChevronRight />
          </SearchStepButton>
        </div>
      ) : null}
    </search>
  );
}

function SearchStepButton({
  ariaLabel,
  children,
  direction,
  disabled,
  onStep,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  direction: "previous" | "next";
  disabled: boolean;
  onStep: (direction: "previous" | "next") => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
      onClick={() => onStep(direction)}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ProjectChatHistoryBody(props: ProjectChatHistoryPanelProps) {
  return (
    <div
      ref={props.threadListScrollRef}
      className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2"
    >
      {!props.hasAnyContent ? (
        <ProjectChatHistoryEmptyState
          emptyStateText={props.emptyStateText}
          onStartNewThread={props.handleStartNewThread}
          showNoThreadsPlaceholder={props.showNoThreadsPlaceholder}
        />
      ) : (
        <ProjectChatHistoryDragContent {...props} />
      )}
    </div>
  );
}

function ProjectChatHistoryEmptyState({
  emptyStateText,
  onStartNewThread,
  showNoThreadsPlaceholder,
}: {
  emptyStateText: string;
  onStartNewThread: () => void;
  showNoThreadsPlaceholder: boolean;
}) {
  if (!showNoThreadsPlaceholder) {
    return (
      <p className="text-center text-xs text-setta-400">{emptyStateText}</p>
    );
  }
  return (
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
  );
}

function ProjectChatHistoryDragContent(props: ProjectChatHistoryPanelProps) {
  return (
    <DragDropProvider
      sensors={
        Array.isArray(props.threadDndSensors)
          ? props.threadDndSensors
          : [props.threadDndSensors]
      }
      dndContext={props.threadDndContext}
      onDragStart={props.handleDragStart}
      onDragMove={props.handleDragMove}
      onDragEnd={props.handleDragEnd}
      onDragCancel={props.handleDragCancel}
      debugLabel={props.debugLabel}
    >
      <>
        <DragOperationShapeSync enabled />
        <ProjectChatHistoryGroupSections {...props} />
        {props.ungroupedEntries.length > 0 ? (
          <ThreadUngroupedFolder
            activeMasterSearchMatchThreadId={
              props.activeMasterSearchMatchThreadId
            }
            activeThreadWaitingForResponse={
              props.activeThreadWaitingForResponse
            }
            chatId={props.chatId}
            entries={props.ungroupedEntries}
            hasGroupsAbove={props.searchableGroupSections.length > 0}
            hasMasterSearch={props.hasMasterSearch}
            masterSearchMatchCountByChatId={
              props.masterSearchMatchCountByChatId
            }
            onDeleteThread={props.handleDeleteThread}
            onSelectGroup={(groupId) => props.onSelectedGroupChange?.(groupId)}
            onSelectThread={props.handleSelectThread}
            onToggleThreadPinned={props.handleToggleThreadPinned}
            pinnedThreadIdsSet={props.pinnedThreadIdsSet}
            showThreadAgentBadges={props.showThreadAgentBadges}
            threadAgentBadgeLabelByChatId={props.threadAgentBadgeLabelByChatId}
            threadSortableEnabled={props.threadsSortableEnabled}
            viewedThreadIdsSet={props.viewedThreadIdsSet}
          />
        ) : null}
      </>
    </DragDropProvider>
  );
}

function ProjectChatHistoryGroupSections(props: ProjectChatHistoryPanelProps) {
  if (props.searchableGroupSections.length === 0) {
    return null;
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <ThreadGroupDomainSection
        {...props}
        domain={PINNED_THREAD_DOMAIN}
        label="Pinned"
        sections={props.pinnedSearchableGroupSections}
        sortableIds={props.pinnedSortableGroupDndIds}
        showLabel={props.pinnedSearchableGroupSections.length > 0}
      />
      <ThreadGroupDomainSection
        {...props}
        domain={UNPINNED_THREAD_DOMAIN}
        label="Unpinned"
        sections={props.unpinnedSearchableGroupSections}
        sortableIds={props.unpinnedSortableGroupDndIds}
        showLabel={props.pinnedSearchableGroupSections.length > 0}
      />
    </div>
  );
}

function ThreadGroupDomainSection({
  activeMasterSearchMatchThreadId,
  activeThreadDragId,
  activeThreadWaitingForResponse,
  chatId,
  domain,
  editingGroupId,
  groupSortableEnabledById,
  handleDeleteGroup,
  handleDeleteThread,
  handleRenameGroup,
  handleSelectThread,
  handleStartThreadInGroup,
  handleToggleGroupPinned,
  handleToggleThreadPinned,
  hasMasterSearch,
  label,
  masterSearchMatchCountByChatId,
  onSelectedGroupChange,
  pinnedThreadIdsSet,
  projectConfigId,
  sections,
  selectedGroupId,
  setEditingGroupId,
  showLabel,
  showThreadAgentBadges,
  sortableIds,
  threadAgentBadgeLabelByChatId,
  threadDragHoverGroupId,
  threadsSortableEnabled,
  viewedThreadIdsSet,
}: ProjectChatHistoryPanelProps & {
  domain: typeof PINNED_THREAD_DOMAIN | typeof UNPINNED_THREAD_DOMAIN;
  label: string;
  sections: Array<ThreadGroupSection>;
  showLabel: boolean;
  sortableIds: Array<string>;
}) {
  if (sections.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1">
      {showLabel ? <ThreadGroupDomainLabel label={label} /> : null}
      <SortableContext
        id={`project-chat-thread-groups:${projectConfigId}:${domain}`}
        items={sortableIds}
        strategy={verticalListSortingStrategy}
        forceSorting
      >
        <div
          className="flex w-full flex-col gap-2"
          data-thread-group-domain={domain}
        >
          {sections.map((section) => (
            <ThreadGroupFolder
              key={section.id}
              activeMasterSearchMatchThreadId={activeMasterSearchMatchThreadId}
              activeThreadWaitingForResponse={activeThreadWaitingForResponse}
              chatId={chatId}
              groupDndId={toThreadGroupDndId(section.id)}
              groupSortableEnabled={
                groupSortableEnabledById.get(section.id) ?? false
              }
              hasMasterSearch={hasMasterSearch}
              isEditing={editingGroupId === section.id}
              isSelected={selectedGroupId === section.id}
              isThreadDragActive={activeThreadDragId !== null}
              isThreadDragHovering={threadDragHoverGroupId === section.id}
              masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
              onDeleteGroup={handleDeleteGroup}
              onDeleteThread={handleDeleteThread}
              onFinishEditing={() => setEditingGroupId(null)}
              onRenameGroup={handleRenameGroup}
              onSelectGroup={(groupId) => onSelectedGroupChange?.(groupId)}
              onSelectThread={handleSelectThread}
              onStartEditing={setEditingGroupId}
              onStartThreadInGroup={handleStartThreadInGroup}
              onToggleGroupPinned={handleToggleGroupPinned}
              onToggleThreadPinned={handleToggleThreadPinned}
              pinnedThreadIdsSet={pinnedThreadIdsSet}
              projectConfigId={projectConfigId}
              section={section}
              showThreadAgentBadges={showThreadAgentBadges}
              threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
              threadSortableEnabled={threadsSortableEnabled}
              viewedThreadIdsSet={viewedThreadIdsSet}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function ThreadGroupDomainLabel({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
      data-testid={`project-chat-${label.toLowerCase()}-groups-label`}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}
