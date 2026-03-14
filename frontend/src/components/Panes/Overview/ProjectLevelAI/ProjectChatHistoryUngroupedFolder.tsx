import {
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { useMemo } from "react";
import {
  PINNED_THREAD_DOMAIN,
  toThreadDndId,
  UNPINNED_THREAD_DOMAIN,
} from "./projectChatHistoryDragUtils";
import { ProjectChatHistoryThreadEntry } from "./ProjectChatHistoryThreadEntry";
import {
  isDraftProjectChatHistoryEntry,
  isProjectChatHistoryEntryActive,
  ProjectChatHistoryThreadDropZone,
} from "./projectChatHistoryThreadListShared";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

export function ProjectChatHistoryUngroupedFolder({
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
  deleteTooltipContent,
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
  deleteTooltipContent: string;
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
      <div
        className="flex w-full items-center gap-1 rounded px-0.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-300"
        data-testid="project-chat-ungrouped-label"
      >
        <span className="truncate">Ungrouped</span>
      </div>
      <div className="ml-2 mt-1 flex flex-col gap-1 border-l border-setta-200/70 pl-2 dark:border-setta-700/70">
        {pinnedEntries.length > 0 ? (
          <section className="flex flex-col gap-1">
            <div
              className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-setta-400 dark:text-setta-500"
              data-testid="project-chat-thread-pinned-section-label"
            >
              <span>Pinned</span>
            </div>
            <ProjectChatHistoryThreadDropZone
              groupId={null}
              pinDomain={PINNED_THREAD_DOMAIN}
            >
              <SortableContext
                id="project-chat-threads:ungrouped:pinned"
                items={pinnedSortableThreadItemIds}
                strategy={verticalListSortingStrategy}
                forceSorting
              >
                {pinnedEntries.map((entry) => (
                  <ProjectChatHistoryThreadEntry
                    key={entry.chatId}
                    entry={entry}
                    threadGroupId={null}
                    pinDomain={PINNED_THREAD_DOMAIN}
                    sortableEnabled={threadSortableEnabled}
                    isActive={isProjectChatHistoryEntryActive(entry, chatId)}
                    isViewed={
                      isDraftProjectChatHistoryEntry(entry) ||
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
                    isDraft={isDraftProjectChatHistoryEntry(entry)}
                    showAgentBadges={showThreadAgentBadges}
                    agentBadgeLabel={
                      threadAgentBadgeLabelByChatId.get(entry.chatId) ?? null
                    }
                    activeThreadWaitingForResponse={
                      activeThreadWaitingForResponse
                    }
                    deleteTooltipContent={deleteTooltipContent}
                    onTogglePinned={onToggleThreadPinned}
                    onDelete={onDeleteThread}
                    onSelect={(selectedEntry) => {
                      onSelectGroup(null);
                      onSelectThread(selectedEntry);
                    }}
                  />
                ))}
              </SortableContext>
            </ProjectChatHistoryThreadDropZone>
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
            <ProjectChatHistoryThreadDropZone
              groupId={null}
              pinDomain={UNPINNED_THREAD_DOMAIN}
            >
              <SortableContext
                id="project-chat-threads:ungrouped:unpinned"
                items={unpinnedSortableThreadItemIds}
                strategy={verticalListSortingStrategy}
                forceSorting
              >
                {unpinnedEntries.map((entry) => (
                  <ProjectChatHistoryThreadEntry
                    key={entry.chatId}
                    entry={entry}
                    threadGroupId={null}
                    pinDomain={UNPINNED_THREAD_DOMAIN}
                    sortableEnabled={threadSortableEnabled}
                    isActive={isProjectChatHistoryEntryActive(entry, chatId)}
                    isViewed={
                      isDraftProjectChatHistoryEntry(entry) ||
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
                    isDraft={isDraftProjectChatHistoryEntry(entry)}
                    showAgentBadges={showThreadAgentBadges}
                    agentBadgeLabel={
                      threadAgentBadgeLabelByChatId.get(entry.chatId) ?? null
                    }
                    activeThreadWaitingForResponse={
                      activeThreadWaitingForResponse
                    }
                    deleteTooltipContent={deleteTooltipContent}
                    onTogglePinned={onToggleThreadPinned}
                    onDelete={onDeleteThread}
                    onSelect={(selectedEntry) => {
                      onSelectGroup(null);
                      onSelectThread(selectedEntry);
                    }}
                  />
                ))}
              </SortableContext>
            </ProjectChatHistoryThreadDropZone>
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
