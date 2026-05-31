import type { ConversationListItem, Run } from "@generated/backend";
import { GitBranch, Pin, Trash2 } from "lucide-react";

import { cn } from "../lib/utils";
import { BrailleSpinner } from "./ascii-spinner";

interface ConversationRowProps {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  deleteConversation: (conversationId: string) => Promise<void>;
  item: ConversationListItem;
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
  deleteConversation,
  item,
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
              "justify-self-end text-right text-[11px] text-zinc-500 transition-opacity",
              pinned ? "opacity-0 group-hover/chat:opacity-100" : "group-hover/chat:opacity-0",
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
        deleteConversation={deleteConversation}
        onTogglePinned={onTogglePinned}
        pinned={pinned}
        title={item.conversation.title}
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

function ConversationRowActions({
  busy,
  conversationId,
  deleteConversation,
  onTogglePinned,
  pinned,
  title,
}: {
  busy: boolean;
  conversationId: string;
  deleteConversation: (conversationId: string) => Promise<void>;
  onTogglePinned: (conversationId: string) => void;
  pinned: boolean;
  title: string;
}) {
  return (
    <div
      className={cn(
        "absolute top-1 right-2 flex h-5 items-center gap-0.5 opacity-0 transition-opacity group-hover/chat:opacity-100 group-focus-within/chat:opacity-100",
        pinned && "opacity-100",
      )}
    >
      <button
        aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
        aria-pressed={pinned}
        className={cn(
          "grid h-5 w-5 place-items-center rounded-sm text-zinc-500 hover:bg-zinc-700/80 hover:text-zinc-100",
          pinned && "text-zinc-300",
        )}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePinned(conversationId);
        }}
        title={pinned ? `Unpin ${title}` : `Pin ${title}`}
        type="button"
      >
        <span className="sr-only">{pinned ? `Unpin ${title}` : `Pin ${title}`}</span>
        <Pin className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label={`Delete ${title}`}
        className="grid h-5 w-5 place-items-center rounded-sm text-zinc-500 hover:bg-red-950/60 hover:text-red-200"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          void deleteConversation(conversationId);
        }}
        title={`Delete ${title}`}
        type="button"
      >
        <span className="sr-only">{`Delete ${title}`}</span>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ConversationStatusIndicator({ running, unread }: { running: boolean; unread: boolean }) {
  return (
    <span className="grid h-4 w-[18px] place-items-center overflow-hidden">
      {running ? (
        <BrailleSpinner
          className="w-[18px] text-[11px] text-zinc-400"
          label="Chat response running"
        />
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
