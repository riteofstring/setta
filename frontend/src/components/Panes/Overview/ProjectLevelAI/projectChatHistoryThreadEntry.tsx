import { useSortableListItem as useDisplacementSortableListItem } from "components/Pages/Project/ViewModeDnd";
import {
  BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useDroppable } from "forks/dnd-kit/adapter";
import {
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdPushPin } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { getProjectChatDeleteRecoveryTooltipContent } from "./projectChatHistoryCopy";
import { toThreadDndId, toThreadDropTargetId } from "./projectChatHistoryDnd";
import {
  isDraftThreadEntry,
  type ProjectChatHistoryEntry,
  type ThreadPinDomain,
} from "./projectChatHistoryViewModel";

function useSortableListItem(
  id: string,
  disabled: boolean,
  direction: "vertical" | "horizontal" = "vertical",
) {
  return useDisplacementSortableListItem(id, disabled, direction);
}

export function isThreadEntryActive(
  entry: ProjectChatHistoryEntry,
  chatId: string | null | undefined,
): boolean {
  if (isDraftThreadEntry(entry)) {
    return chatId === null || chatId === undefined;
  }
  return entry.chatId === chatId;
}

export function ThreadEntryLine({
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
  activeThreadWaitingForResponse?: boolean;
  onTogglePinned: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onSelect: (entry: ProjectChatHistoryEntry) => void;
}) {
  const sortable = useSortableListItem(
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
        content: getProjectChatDeleteRecoveryTooltipContent("thread"),
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
  const leadingStatusVisibilityClass = showThreadDragCursor
    ? "opacity-100 pointer-events-auto group-focus-within/thread-entry:pointer-events-none group-focus-within/thread-entry:opacity-0 group-hover/thread-entry:pointer-events-none group-hover/thread-entry:opacity-0"
    : "opacity-100 pointer-events-auto";
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
        className={`flex min-w-0 flex-1 items-center rounded px-0 py-1 text-left ${rowRightPaddingClass}`}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => onThreadEntryKeyDown(event, entry, onSelect)}
      >
        <span className="relative -ml-px mr-px inline-flex h-4 w-3 shrink-0 items-center justify-center">
          <span
            ref={
              showThreadDragCursor ? sortable.setActivatorNodeRef : undefined
            }
            className={`absolute inset-0 inline-flex h-4 w-3 items-center justify-center rounded transition-[color,opacity] ${
              showThreadDragCursor
                ? "pointer-events-none cursor-grab touch-none text-setta-400 opacity-0 hover:text-setta-600 active:cursor-grabbing group-focus-within/thread-entry:pointer-events-auto group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:pointer-events-auto group-hover/thread-entry:opacity-100 dark:text-setta-500 dark:hover:text-setta-300"
                : "pointer-events-none text-setta-300 opacity-0 group-focus-within/thread-entry:opacity-100 group-hover/thread-entry:opacity-100 dark:text-setta-700"
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
          {showWorkingIndicator ? (
            <BrailleSpinner
              className={`absolute inset-0 m-auto ${BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME} text-blue-500 transition-opacity dark:text-blue-300 ${leadingStatusVisibilityClass}`}
              data-testid={"project-chat-thread-working-indicator"}
              aria-hidden="true"
              {...(workingIndicatorTooltipHandlers ?? {})}
            />
          ) : showUnreadIndicator ? (
            <span
              className={`absolute inset-0 m-auto h-2 w-2 rounded-full bg-blue-500 transition-opacity ${leadingStatusVisibilityClass}`}
              data-testid="project-chat-thread-unread-dot"
              {...(unreadIndicatorTooltipHandlers ?? {})}
            />
          ) : null}
        </span>
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

export function ThreadDropZone({
  groupId,
  pinDomain,
  children,
}: {
  groupId: string | null;
  pinDomain: ThreadPinDomain;
  children: ReactNode;
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
      className={`flex flex-col ${isOver ? "rounded border border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
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
