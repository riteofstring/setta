import { useSortableListItem as useDisplacementSortableListItem } from "components/Pages/Project/ViewModeDnd";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdPushPin } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import {
  type ThreadPinDomain,
  toThreadDndId,
} from "./projectChatHistoryDragUtils";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

export function ProjectChatHistoryThreadEntry({
  entry,
  threadGroupId,
  pinDomain,
  sortableEnabled,
  isActive,
  isViewed,
  searchMatchCount,
  isSearchMatchActive,
  isPinned,
  isDraft,
  showAgentBadges,
  agentBadgeLabel,
  activeThreadWaitingForResponse,
  deleteTooltipContent,
  onTogglePinned,
  onDelete,
  onSelect,
}: {
  entry: ProjectChatHistoryEntry;
  threadGroupId: string | null;
  pinDomain: ThreadPinDomain;
  sortableEnabled: boolean;
  isActive: boolean;
  isViewed: boolean;
  searchMatchCount: number | null;
  isSearchMatchActive: boolean;
  isPinned: boolean;
  isDraft: boolean;
  showAgentBadges: boolean;
  agentBadgeLabel: string | null;
  activeThreadWaitingForResponse: boolean;
  deleteTooltipContent: string;
  onTogglePinned: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onSelect: (entry: ProjectChatHistoryEntry) => void;
}) {
  const sortable = useDisplacementSortableListItem(
    toThreadDndId(entry.chatId),
    !sortableEnabled || isDraft,
    "vertical",
  );
  const showWorkingIndicator = isActive
    ? activeThreadWaitingForResponse
    : entry.waitingForResponse;
  const showUnreadIndicator = !showWorkingIndicator && !isViewed;
  const rowClassName = isActive
    ? "border border-blue-400/90 bg-blue-50/70 text-setta-800 hover:border-blue-500/90 hover:bg-blue-50/90 dark:border-blue-700/80 dark:bg-blue-950/45 dark:text-setta-50 dark:hover:border-blue-600/80 dark:hover:bg-blue-950/55"
    : isSearchMatchActive
      ? "border border-blue-300/70 bg-blue-50/45 text-setta-700 hover:border-blue-400/80 hover:bg-blue-50/70 dark:border-blue-700/60 dark:bg-blue-950/25 dark:text-setta-100 dark:hover:border-blue-600/70 dark:hover:bg-blue-950/35"
      : "border border-transparent text-setta-700 hover:border-setta-200 hover:bg-white dark:text-setta-200 dark:hover:border-setta-700 dark:hover:bg-setta-800";
  const hasSearchMatchCount =
    searchMatchCount !== null && searchMatchCount > 0 && !isDraft;
  const hasAgentBadge = Boolean(agentBadgeLabel && agentBadgeLabel.trim());
  const showAgentBadge = showAgentBadges && hasAgentBadge;
  const rowRightPaddingClass = showAgentBadge
    ? isDraft
      ? "pr-[3.9rem]"
      : "pr-[3.9rem] group-focus-within/thread-entry:pr-[2.8rem] group-hover/thread-entry:pr-[2.8rem]"
    : isDraft
      ? "pr-0"
      : "pr-0 group-focus-within/thread-entry:pr-[2.8rem] group-hover/thread-entry:pr-[2.8rem]";
  const agentBadgeVisibilityClass = isDraft
    ? ""
    : "group-focus-within/thread-entry:opacity-0 group-hover/thread-entry:opacity-0";
  const pinTooltipHandlers = isDraft
    ? null
    : getFloatingBoxHandlers({
        title: isPinned ? "Unpin thread" : "Pin thread",
        content: isPinned
          ? "Move this chat back to unpinned."
          : "Keep this chat at the top of its section.",
      });
  const deleteTooltipHandlers = isDraft
    ? null
    : getFloatingBoxHandlers({
        title: "Delete chat",
        content: deleteTooltipContent,
      });
  const workingIndicatorTooltipHandlers = showWorkingIndicator
    ? getFloatingBoxHandlers({
        title: "Working",
        content: "This chat currently has in-progress activity.",
      })
    : null;
  const unreadIndicatorTooltipHandlers = showUnreadIndicator
    ? getFloatingBoxHandlers({
        title: "Unread",
        content: "This chat has completed updates you have not opened yet.",
      })
    : null;
  const threadDragInteractions =
    !isDraft && sortableEnabled ? { ...sortable.listeners } : {};
  const showThreadDragCursor = !isDraft && sortableEnabled;

  const handleThreadRowClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button")) {
      return;
    }
    onSelect(entry);
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={sortable.style}
      className={`group/thread-entry relative flex min-w-0 max-w-full items-center gap-1 self-stretch rounded transition-colors ${rowClassName}`}
      data-testid={
        isDraft
          ? "project-chat-thread-draft-entry"
          : "project-chat-thread-entry"
      }
      data-thread-id={entry.chatId}
      data-thread-group-id={threadGroupId ?? "ungrouped"}
      data-thread-pin-domain={pinDomain}
      onClick={handleThreadRowClick}
    >
      <div
        className={`ml-0.5 flex min-w-0 flex-1 items-center rounded px-0.5 py-1 text-left ${rowRightPaddingClass}`}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => onThreadEntryKeyDown(event, entry, onSelect)}
      >
        <span
          ref={showThreadDragCursor ? sortable.setActivatorNodeRef : undefined}
          className={`mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${
            showThreadDragCursor
              ? "cursor-grab touch-none text-setta-400 hover:text-setta-600 active:cursor-grabbing dark:text-setta-500 dark:hover:text-setta-300"
              : "text-transparent"
          }`}
          data-testid="project-chat-thread-drag-handle"
          aria-label={showThreadDragCursor ? "Drag thread" : undefined}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          {...threadDragInteractions}
        >
          <RxDragHandleDots2 size={12} />
        </span>
        {showWorkingIndicator || showUnreadIndicator ? (
          <span className="mr-0.5 inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            {showWorkingIndicator ? (
              <i
                className="gg-spinner !scale-[0.6] text-blue-500 dark:text-blue-300"
                data-testid="project-chat-thread-working-indicator"
                aria-hidden="true"
                {...(workingIndicatorTooltipHandlers ?? {})}
              />
            ) : (
              <span
                className="h-2 w-2 rounded-full bg-blue-500"
                data-testid="project-chat-thread-unread-dot"
                {...(unreadIndicatorTooltipHandlers ?? {})}
              />
            )}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
          {entry.label}
        </span>
        {hasSearchMatchCount ? (
          <span
            className={`ml-1 inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-sm px-1 py-[1px] text-[9px] font-semibold leading-none ${
              isActive
                ? "bg-blue-200/80 text-blue-800 dark:bg-blue-900/70 dark:text-blue-100"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/55 dark:text-blue-200"
            }`}
            data-testid="project-chat-thread-search-match-count"
          >
            {searchMatchCount}
          </span>
        ) : null}
      </div>
      {showAgentBadge ? (
        <span
          className={`pointer-events-none absolute right-0.5 top-1/2 inline-flex max-w-[3.9rem] -translate-y-1/2 items-center justify-center truncate rounded border border-setta-200/80 bg-setta-100/90 px-[2px] py-[1px] text-[8px] font-semibold uppercase leading-none tracking-[-0.06em] text-setta-600 transition-opacity dark:border-setta-700/80 dark:bg-setta-800/90 dark:text-setta-200 ${agentBadgeVisibilityClass}`}
          data-testid="project-chat-thread-agent-badge"
        >
          {agentBadgeLabel}
        </span>
      ) : null}
      {!isDraft ? (
        <div className="pointer-events-none absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/thread-entry:pointer-events-auto group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:pointer-events-auto group-hover/thread-entry:opacity-100">
          <button
            type="button"
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
              isPinned
                ? "text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                : "text-setta-400 hover:bg-setta-200 dark:text-setta-500 dark:hover:bg-setta-700"
            }`}
            aria-label={isPinned ? "Unpin thread" : "Pin thread"}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinned(entry.chatId);
            }}
            data-testid="project-chat-thread-pin-button"
            {...(pinTooltipHandlers ?? {})}
          >
            <MdPushPin size={12} />
          </button>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-setta-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-setta-500 dark:hover:bg-red-950/50 dark:hover:text-red-300"
            aria-label="Delete thread"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(entry.chatId);
            }}
            data-testid="project-chat-thread-delete-button"
            {...(deleteTooltipHandlers ?? {})}
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function onThreadEntryKeyDown(
  event: KeyboardEvent<HTMLElement>,
  entry: ProjectChatHistoryEntry,
  onSelect: (entry: ProjectChatHistoryEntry) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect(entry);
}
