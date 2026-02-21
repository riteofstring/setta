import {
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  SortableListProvider,
  useSortableListItem,
} from "components/Pages/Project/ViewModeDnd";
import { RxDragHandleDots2 } from "react-icons/rx";
import { TbFolder, TbFolderOpen } from "react-icons/tb";
import { loadAgentRuns } from "state/actions/ai";
import {
  createProjectChatThreadGroup,
  markProjectChatThreadViewed,
  reorderProjectChatThreadGroups,
  toggleProjectChatThreadGroupCollapsed,
} from "state/actions/projectChatThreads";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import { useAIStore, useLocalStorage, useProjectState } from "state/definitions";
import { shallow } from "zustand/shallow";

type ProjectChatHistoryEntry = ReturnType<typeof buildChatHistoryEntries>[number];

type ThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
};

type ThreadGroupSection = ThreadGroup & {
  entries: Array<ProjectChatHistoryEntry>;
};

export function ProjectChatHistory({
  chatId,
  setChatId,
  runType,
  engineConfigId,
  inline = false,
  closeOnSelect = true,
}: {
  chatId: string | null | undefined;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  runType: ChatRunType | null;
  engineConfigId: string | null;
  inline?: boolean;
  closeOnSelect?: boolean;
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
  const { threadGroups, threadAssignments, viewedThreadIds } = useLocalStorage(
    (state) => ({
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      viewedThreadIds:
        state.viewedProjectChatThreadIdsByProjectConfigId[projectConfigId] ??
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

  const compatibility = useMemo<ChatHistoryCompatibility | null>(() => {
    if (!runType) {
      return null;
    }
    return {
      runType,
      engineConfigId,
    };
  }, [engineConfigId, runType]);

  const historyEntries = useMemo(() => {
    return buildChatHistoryEntries(agentRuns, {
      unscopedOnly: true,
      compatibility,
    });
  }, [agentRuns, compatibility]);

  const sortedEntries = useMemo(() => {
    return [...historyEntries].sort(
      (a, b) => b.lastUpdatedMs - a.lastUpdatedMs,
    );
  }, [historyEntries]);

  const viewedThreadIdsSet = useMemo(() => {
    return new Set(viewedThreadIds);
  }, [viewedThreadIds]);

  const { groupSections, ungroupedEntries } = useMemo(() => {
    const groupsById = new Map<string, ThreadGroup>();
    threadGroups.forEach((group) => {
      groupsById.set(group.id, group);
    });

    const entriesByGroupId = new Map<string, Array<ProjectChatHistoryEntry>>();
    const nextUngroupedEntries: Array<ProjectChatHistoryEntry> = [];

    for (const entry of sortedEntries) {
      const groupId = threadAssignments[entry.chatId] ?? null;
      if (!groupId || !groupsById.has(groupId)) {
        nextUngroupedEntries.push(entry);
        continue;
      }
      const groupEntries = entriesByGroupId.get(groupId);
      if (groupEntries) {
        groupEntries.push(entry);
      } else {
        entriesByGroupId.set(groupId, [entry]);
      }
    }

    return {
      groupSections: threadGroups.map((group) => ({
        ...group,
        entries: entriesByGroupId.get(group.id) ?? [],
      })),
      ungroupedEntries: nextUngroupedEntries,
    };
  }, [sortedEntries, threadAssignments, threadGroups]);

  const sortableGroupIds = useMemo(() => {
    return groupSections.map((section) => section.id);
  }, [groupSections]);

  const groupsSortableEnabled = sortableGroupIds.length > 1;

  const placeholderText = useMemo(() => {
    return getPlaceholderText(
      agentRunsInitialLoadComplete,
      agentRunsLoadError,
      sortedEntries.length,
    );
  }, [agentRunsInitialLoadComplete, agentRunsLoadError, sortedEntries.length]);

  const handleCreateGroup = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const groupName = window.prompt("Name this thread group");
    if (groupName === null) {
      return;
    }
    createProjectChatThreadGroup(projectConfigId, groupName);
  }, [projectConfigId]);

  const handleSelectThread = useCallback(
    (entry: ProjectChatHistoryEntry) => {
      setChatId(entry.chatId);
      markProjectChatThreadViewed(projectConfigId, entry.chatId);
      if (!closeOnSelect) {
        return;
      }
      useAIStore.setState({ viewThreads: false });
    },
    [closeOnSelect, projectConfigId, setChatId],
  );

  const handleReorderGroups = useCallback(
    (nextOrderedIds: Array<string>) => {
      reorderProjectChatThreadGroups(projectConfigId, nextOrderedIds);
    },
    [projectConfigId],
  );

  const panelClasses = inline
    ? "flex h-full min-h-0 w-full min-w-0 flex-col border-r border-setta-200 bg-setta-50 dark:border-setta-800 dark:bg-setta-900/40"
    : "flex h-full min-h-0 flex-col";

  const hasAnyContent = groupSections.length > 0 || ungroupedEntries.length > 0;

  return (
    <section
      className={panelClasses}
      data-testid="project-chat-threads-panel"
      data-inline={inline ? "true" : "false"}
    >
      <header className="flex items-center justify-between border-b border-setta-200 px-3 py-2 dark:border-setta-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300">
          Threads
        </h3>
        <button
          type="button"
          className="rounded border border-setta-200 bg-white px-2 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300"
          onClick={handleCreateGroup}
        >
          New Group
        </button>
      </header>

      <div className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
        {!hasAnyContent ? (
          <p className="text-center text-xs text-setta-400">{placeholderText}</p>
        ) : (
          <>
            {groupSections.length > 0 ? (
              <SortableListProvider
                id={`project-chat-thread-groups-${projectConfigId}`}
                items={sortableGroupIds}
                direction="vertical"
                enabled={groupsSortableEnabled}
                onReorder={handleReorderGroups}
              >
                <div className="flex w-full flex-col gap-2">
                  {groupSections.map((section) => (
                    <ThreadGroupFolder
                      key={section.id}
                      section={section}
                      chatId={chatId}
                      projectConfigId={projectConfigId}
                      viewedThreadIdsSet={viewedThreadIdsSet}
                      sortableEnabled={groupsSortableEnabled}
                      onSelectThread={handleSelectThread}
                    />
                  ))}
                </div>
              </SortableListProvider>
            ) : null}

            {ungroupedEntries.length > 0 ? (
              <ThreadUngroupedFolder
                entries={ungroupedEntries}
                chatId={chatId}
                viewedThreadIdsSet={viewedThreadIdsSet}
                onSelectThread={handleSelectThread}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function ThreadGroupFolder({
  section,
  chatId,
  projectConfigId,
  viewedThreadIdsSet,
  sortableEnabled,
  onSelectThread,
}: {
  section: ThreadGroupSection;
  chatId: string | null | undefined;
  projectConfigId: string;
  viewedThreadIdsSet: Set<string>;
  sortableEnabled: boolean;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
}) {
  const sortable = useSortableListItem(section.id, !sortableEnabled, "vertical");
  const folderIcon = section.collapsed ? (
    <TbFolder size={14} className="text-setta-400" />
  ) : (
    <TbFolderOpen size={14} className="text-setta-400" />
  );

  function stopDragClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function stopDragPointerDown(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={sortable.style}
      className="flex flex-col gap-1"
      data-testid="project-chat-thread-group-row"
      data-group-id={section.id}
    >
      <button
        type="button"
        className="group/thread-folder flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-setta-500 hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={() => {
          toggleProjectChatThreadGroupCollapsed(projectConfigId, section.id);
        }}
      >
        <span
          ref={sortable.setActivatorNodeRef}
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
            sortableEnabled
              ? "cursor-grab touch-none text-setta-400 active:cursor-grabbing dark:text-setta-500"
              : "text-setta-700/30 dark:text-setta-500/30"
          }`}
          {...sortable.attributes}
          {...sortable.listeners}
          onPointerDown={stopDragPointerDown}
          onClick={stopDragClick}
          data-testid="project-chat-thread-group-drag-handle"
          aria-label={`Drag ${section.name} group`}
        >
          <RxDragHandleDots2 className="h-3.5 w-3.5" />
        </span>
        {folderIcon}
        <span className="truncate">{section.name}</span>
      </button>

      {!section.collapsed && section.entries.length > 0
        ? section.entries.map((entry) => (
            <ThreadEntryLine
              key={entry.chatId}
              entry={entry}
              isActive={entry.chatId === chatId}
              isViewed={
                viewedThreadIdsSet.has(entry.chatId) || entry.chatId === chatId
              }
              onSelect={onSelectThread}
            />
          ))
        : null}

      {!section.collapsed && section.entries.length === 0 ? (
        <p className="ml-3 text-[11px] text-setta-400 dark:text-setta-500">
          No threads in this group.
        </p>
      ) : null}
    </section>
  );
}

function ThreadUngroupedFolder({
  entries,
  chatId,
  viewedThreadIdsSet,
  onSelectThread,
}: {
  entries: Array<ProjectChatHistoryEntry>;
  chatId: string | null | undefined;
  viewedThreadIdsSet: Set<string>;
  onSelectThread: (entry: ProjectChatHistoryEntry) => void;
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex w-full items-center gap-1 rounded px-0.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300">
        <span className="inline-flex h-4 w-2 shrink-0" aria-hidden="true" />
        <TbFolderOpen size={14} className="text-setta-400" />
        <span className="truncate">Ungrouped</span>
      </div>
      {entries.map((entry) => (
        <ThreadEntryLine
          key={entry.chatId}
          entry={entry}
          isActive={entry.chatId === chatId}
          isViewed={viewedThreadIdsSet.has(entry.chatId) || entry.chatId === chatId}
          onSelect={onSelectThread}
        />
      ))}
    </section>
  );
}

function ThreadEntryLine({
  entry,
  isActive,
  isViewed,
  onSelect,
}: {
  entry: ProjectChatHistoryEntry;
  isActive: boolean;
  isViewed: boolean;
  onSelect: (entry: ProjectChatHistoryEntry) => void;
}) {
  const showWorkingIndicator = entry.waitingForResponse;
  const showUnreadIndicator = !showWorkingIndicator && !isViewed;

  const rowClassName = isActive
    ? "border border-blue-500 bg-blue-600 text-white shadow-sm dark:bg-blue-700"
    : "border border-transparent text-setta-700 hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800";

  const statusIndicatorClass = showWorkingIndicator
    ? "h-2 w-2 animate-pulse rounded-full bg-amber-400"
    : "h-2 w-2 rounded-full bg-blue-500";

  return (
    <button
      type="button"
      className={`ml-3 flex w-[calc(100%-0.75rem)] items-center rounded px-1.5 py-1 text-left transition-colors ${rowClassName}`}
      onClick={() => onSelect(entry)}
      onKeyDown={(event) => onThreadEntryKeyDown(event, entry, onSelect)}
      data-testid="project-chat-thread-entry"
    >
      {showWorkingIndicator || showUnreadIndicator ? (
        <span
          className={`${statusIndicatorClass} mr-1 shrink-0`}
          data-testid={
            showWorkingIndicator
              ? "project-chat-thread-working-indicator"
              : "project-chat-thread-unread-dot"
          }
          title={showWorkingIndicator ? "Working" : "Unread completed thread"}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
        {entry.label}
      </span>
    </button>
  );
}

function onThreadEntryKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  entry: ProjectChatHistoryEntry,
  onSelect: (entry: ProjectChatHistoryEntry) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect(entry);
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
