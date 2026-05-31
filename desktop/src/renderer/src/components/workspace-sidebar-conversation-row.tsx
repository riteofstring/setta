import type { ConversationListItem, Run } from "@generated/backend";
import { GitBranch, Pin, Trash2 } from "lucide-react";

import { cn } from "../lib/utils";
import { AsciiSpinner } from "./ascii-spinner";

interface ConversationRowProps {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  item: ConversationListItem;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onTogglePinned: (conversationId: string) => void;
  pinned: boolean;
  selectConversation: (conversationId: string) => Promise<void>;
  selected: boolean;
  unread: boolean;
}

export function ConversationRow({
  activeRun,
  branchLabel,
  busy,
  item,
  onDeleteConversation,
  onTogglePinned,
  pinned,
  selectConversation,
  selected,
  unread,
}: ConversationRowProps) {
  const running =
    item.activeRunId !== "" ||
    (activeRun?.conversationId === item.conversation.id &&
      (activeRun.status === "queued" || activeRun.status === "running"));
  const responseAge = formatConversationAge(item.conversation.updatedAt);

  return (
    <div className="group/chat relative min-w-0">
      <button
        className={cn(
          "grid h-7 w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-sm px-2 text-left hover:bg-zinc-800/70 hover:text-zinc-100",
          selected ? "text-zinc-100" : "text-zinc-300",
        )}
        data-testid="conversation-list-item"
        disabled={busy}
        onClick={() => void selectConversation(item.conversation.id)}
        type="button"
      >
        <ConversationStatusIndicator running={running} unread={unread && !selected} />
        <span className="truncate text-xs">{item.conversation.title}</span>
        {responseAge ? (
          <time
            className={cn(
              "justify-self-end text-right text-[11px] text-zinc-500 opacity-100 transition-opacity duration-75 ease-out group-hover/chat:opacity-0 group-focus-within/chat:opacity-0",
              pinned && "opacity-0",
            )}
            dateTime={item.conversation.updatedAt}
            title={item.conversation.updatedAt}
          >
            {responseAge}
          </time>
        ) : null}
      </button>
      <ConversationRowActions
        busy={busy}
        conversationId={item.conversation.id}
        deleteConversation={onDeleteConversation}
        pinned={pinned}
        title={item.conversation.title}
        togglePinned={onTogglePinned}
      />
      <div
        className="pointer-events-none fixed z-50 hidden min-w-52 max-w-72 rounded-sm border border-zinc-700/80 bg-zinc-900/95 px-2 py-1.5 text-xs text-zinc-100 shadow-xl shadow-zinc-950/50 backdrop-blur group-hover/chat:block"
        data-testid="conversation-hover-card"
        style={{ left: "calc(var(--sidebar-width, 220px) + 8px)" }}
      >
        <div className="truncate text-xs font-medium">{item.conversation.title}</div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-zinc-300">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{branchLabel}</span>
        </div>
      </div>
    </div>
  );
}

function ConversationStatusIndicator({ running, unread }: { running: boolean; unread: boolean }) {
  return (
    <span className="grid h-4 w-[18px] place-items-center overflow-hidden">
      {running ? (
        <AsciiSpinner className="w-[18px] text-[7px] text-zinc-400" label="Chat response running" />
      ) : unread ? (
        <span
          aria-label="Unread assistant response"
          className="h-1.5 w-1.5 rounded-full bg-zinc-500"
          role="status"
        />
      ) : null}
    </span>
  );
}

function ConversationRowActions({
  busy,
  conversationId,
  deleteConversation,
  pinned,
  title,
  togglePinned,
}: {
  busy: boolean;
  conversationId: string;
  deleteConversation: (conversationId: string) => Promise<void>;
  pinned: boolean;
  title: string;
  togglePinned: (conversationId: string) => void;
}) {
  const pinLabel = pinned ? `Unpin ${title}` : `Pin ${title}`;
  return (
    <div className="absolute top-1 right-2 flex h-5 items-center gap-0.5">
      <button
        aria-label={pinLabel}
        className={cn(
          "pointer-events-none grid h-5 w-5 place-items-center rounded-sm text-zinc-500 opacity-0 outline-none transition-opacity duration-75 ease-out hover:bg-zinc-700/80 hover:text-zinc-100 focus-visible:bg-zinc-700/80 focus-visible:text-zinc-100 group-hover/chat:pointer-events-auto group-hover/chat:opacity-100 group-focus-within/chat:pointer-events-auto group-focus-within/chat:opacity-100",
          pinned ? "pointer-events-auto opacity-100 text-zinc-300" : "",
        )}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          togglePinned(conversationId);
        }}
        title={pinned ? "Unpin chat" : "Pin chat"}
        type="button"
      >
        <Pin className={cn("h-3.5 w-3.5", pinned ? "fill-zinc-300" : "")} />
      </button>
      <button
        aria-label={`Delete ${title}`}
        className="pointer-events-none grid h-5 w-5 place-items-center rounded-sm text-zinc-500 opacity-0 outline-none transition-opacity duration-75 ease-out hover:bg-zinc-700/80 hover:text-red-300 focus-visible:bg-zinc-700/80 focus-visible:text-red-300 group-hover/chat:pointer-events-auto group-hover/chat:opacity-100 group-focus-within/chat:pointer-events-auto group-focus-within/chat:opacity-100"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          void deleteConversation(conversationId);
        }}
        title="Delete chat"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function formatConversationAge(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return "now";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 14) {
    return `${elapsedDays}d`;
  }
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 8) {
    return `${elapsedWeeks}w`;
  }
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedDays < 365) {
    return `${Math.max(1, elapsedMonths)}mo`;
  }
  return `${Math.floor(elapsedDays / 365)}y`;
}
