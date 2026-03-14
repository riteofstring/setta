import {
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import { type ComponentProps, type RefObject } from "react";
import { MdAdd } from "react-icons/md";
import { RiChatNewFill } from "react-icons/ri";
import {
  PINNED_THREAD_DOMAIN,
  toThreadGroupDndId,
  UNPINNED_THREAD_DOMAIN,
} from "./projectChatHistoryDragUtils";
import { ProjectChatHistoryGroupFolder } from "./ProjectChatHistoryGroupFolder";
import { ProjectChatHistoryUngroupedFolder } from "./ProjectChatHistoryUngroupedFolder";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type DragDropProviderProps = ComponentProps<typeof DragDropProvider>;

export function ProjectChatHistoryContent({
  hasAnyContent,
  showNoThreadsPlaceholder,
  emptyStateText,
  onStartNewThread,
  threadListScrollRef,
  threadDndSensors,
  threadDndContext,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  searchableGroupSections,
  pinnedSearchableGroupSections,
  unpinnedSearchableGroupSections,
  pinnedSortableGroupDndIds,
  unpinnedSortableGroupDndIds,
  projectConfigId,
  chatId,
  viewedThreadIdsSet,
  pinnedThreadIdsSet,
  groupSortableEnabledById,
  threadsSortableEnabled,
  selectedGroupId,
  editingGroupId,
  activeThreadDragId,
  threadDragHoverGroupId,
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
  ungroupedEntries,
  deleteGroupTooltipContent,
  deleteThreadTooltipContent,
}: {
  hasAnyContent: boolean;
  showNoThreadsPlaceholder: boolean;
  emptyStateText: string;
  onStartNewThread: () => void;
  threadListScrollRef: RefObject<HTMLDivElement | null>;
  threadDndSensors: DragDropProviderProps["sensors"];
  threadDndContext: DragDropProviderProps["dndContext"];
  onDragStart: DragDropProviderProps["onDragStart"];
  onDragMove: DragDropProviderProps["onDragMove"];
  onDragEnd: DragDropProviderProps["onDragEnd"];
  onDragCancel: DragDropProviderProps["onDragCancel"];
  searchableGroupSections: Array<ThreadGroupSection>;
  pinnedSearchableGroupSections: Array<ThreadGroupSection>;
  unpinnedSearchableGroupSections: Array<ThreadGroupSection>;
  pinnedSortableGroupDndIds: Array<string>;
  unpinnedSortableGroupDndIds: Array<string>;
  projectConfigId: string;
  chatId: string | null | undefined;
  viewedThreadIdsSet: Set<string>;
  pinnedThreadIdsSet: Set<string>;
  groupSortableEnabledById: Map<string, boolean>;
  threadsSortableEnabled: boolean;
  selectedGroupId: string | null;
  editingGroupId: string | null;
  activeThreadDragId: string | null;
  threadDragHoverGroupId: string | null;
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
  activeThreadWaitingForResponse: boolean;
  ungroupedEntries: Array<ProjectChatHistoryEntry>;
  deleteGroupTooltipContent: string;
  deleteThreadTooltipContent: string;
}) {
  return (
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
          <p className="text-center text-xs text-setta-400">{emptyStateText}</p>
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
                          <ProjectChatHistoryGroupFolder
                            key={section.id}
                            section={section}
                            groupDndId={toThreadGroupDndId(section.id)}
                            chatId={chatId}
                            projectConfigId={projectConfigId}
                            viewedThreadIdsSet={viewedThreadIdsSet}
                            pinnedThreadIdsSet={pinnedThreadIdsSet}
                            groupSortableEnabled={
                              groupSortableEnabledById.get(section.id) ?? false
                            }
                            threadSortableEnabled={threadsSortableEnabled}
                            isSelected={selectedGroupId === section.id}
                            isEditing={editingGroupId === section.id}
                            isThreadDragActive={activeThreadDragId !== null}
                            isThreadDragHovering={
                              threadDragHoverGroupId === section.id
                            }
                            deleteGroupTooltipContent={
                              deleteGroupTooltipContent
                            }
                            deleteThreadTooltipContent={
                              deleteThreadTooltipContent
                            }
                            onStartEditing={onStartEditing}
                            onFinishEditing={onFinishEditing}
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
                          <ProjectChatHistoryGroupFolder
                            key={section.id}
                            section={section}
                            groupDndId={toThreadGroupDndId(section.id)}
                            chatId={chatId}
                            projectConfigId={projectConfigId}
                            viewedThreadIdsSet={viewedThreadIdsSet}
                            pinnedThreadIdsSet={pinnedThreadIdsSet}
                            groupSortableEnabled={
                              groupSortableEnabledById.get(section.id) ?? false
                            }
                            threadSortableEnabled={threadsSortableEnabled}
                            isSelected={selectedGroupId === section.id}
                            isEditing={editingGroupId === section.id}
                            isThreadDragActive={activeThreadDragId !== null}
                            isThreadDragHovering={
                              threadDragHoverGroupId === section.id
                            }
                            deleteGroupTooltipContent={
                              deleteGroupTooltipContent
                            }
                            deleteThreadTooltipContent={
                              deleteThreadTooltipContent
                            }
                            onStartEditing={onStartEditing}
                            onFinishEditing={onFinishEditing}
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
              </div>
            ) : null}

            {ungroupedEntries.length > 0 ? (
              <ProjectChatHistoryUngroupedFolder
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
                masterSearchMatchCountByChatId={masterSearchMatchCountByChatId}
                activeMasterSearchMatchThreadId={
                  activeMasterSearchMatchThreadId
                }
                showThreadAgentBadges={showThreadAgentBadges}
                threadAgentBadgeLabelByChatId={threadAgentBadgeLabelByChatId}
                activeThreadWaitingForResponse={activeThreadWaitingForResponse}
                deleteTooltipContent={deleteThreadTooltipContent}
              />
            ) : null}
          </>
        </DragDropProvider>
      )}
    </div>
  );
}
