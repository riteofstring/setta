import type { ConversationListItem, Run } from "@generated/backend";
import { AlertTriangle, Pin, PinOff, Trash2 } from "lucide-react";
import { type FocusEvent, type RefObject, useLayoutEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { AsciiSpinner } from "./ascii-spinner";
import { SidebarIconButton } from "./sidebar-header-actions";

const hoverCardViewportInset = 8;

interface ConversationRowProps {
  activeRun: Run | null;
  busy: boolean;
  corruptionLabel: string | null;
  deleteConversation: () => Promise<void>;
  item: ConversationListItem;
  selectConversation: (conversationId: string) => Promise<void>;
  selected: boolean;
  setConversationPinned: () => Promise<void>;
  unread: boolean;
}

export function ConversationRow({
  activeRun,
  busy,
  corruptionLabel,
  deleteConversation,
  item,
  selectConversation,
  selected,
  setConversationPinned,
  unread,
}: ConversationRowProps) {
  const running =
    item.activeRunId !== "" || activeRunMatchesConversation(activeRun, item.conversation.id);
  const pinned = item.pinnedAt !== "";
  const responseAge = formatConversationAge(item.conversation.updatedAt);
  const hoverCard = useConversationHoverCard({
    corruptionLabel,
    title: item.conversation.title,
  });

  return (
    <div
      className="relative min-w-0"
      onBlur={hoverCard.closeIfFocusLeaves}
      onFocus={hoverCard.open}
      onMouseEnter={hoverCard.open}
      onMouseLeave={hoverCard.close}
      ref={hoverCard.rowRef}
    >
      <div
        className={cn(
          "group/conversation-row grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-accent/70 hover:text-foreground",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <button
          className="grid h-7 min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 px-2 text-left"
          data-conversation-id={item.conversation.id}
          data-testid="conversation-list-item"
          disabled={busy}
          onClick={() => void selectConversation(item.conversation.id)}
          type="button"
        >
          <ConversationStatusIndicator
            corruptionLabel={corruptionLabel}
            pinned={pinned}
            running={running}
            unread={unread && !selected}
          />
          <span className="truncate text-xs" title={item.conversation.title}>
            {item.conversation.title}
          </span>
          {responseAge ? (
            <time
              className="justify-self-end text-right text-[11px] text-muted-foreground transition-opacity group-hover/conversation-row:opacity-0 group-focus-within/conversation-row:opacity-0"
              dateTime={item.conversation.updatedAt}
              title={item.conversation.updatedAt}
            >
              {responseAge}
            </time>
          ) : null}
        </button>
        <div className="mr-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/conversation-row:opacity-100 group-focus-within/conversation-row:opacity-100">
          <SidebarIconButton
            disabled={busy}
            label={pinned ? "Unpin chat" : "Pin chat"}
            onClick={() => void setConversationPinned()}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </SidebarIconButton>
          <SidebarIconButton
            disabled={busy || running}
            label="Delete chat"
            onClick={() => void deleteConversation()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </SidebarIconButton>
        </div>
      </div>
      <ConversationHoverCard
        cardRef={hoverCard.cardRef}
        corruptionLabel={corruptionLabel}
        open={hoverCard.visible}
        title={item.conversation.title}
        top={hoverCard.top}
      />
    </div>
  );
}

function ConversationHoverCard({
  cardRef,
  corruptionLabel,
  open,
  title,
  top,
}: {
  cardRef: RefObject<HTMLDivElement | null>;
  corruptionLabel: string | null;
  open: boolean;
  title: string;
  top: number;
}) {
  if (!corruptionLabel) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 max-h-[calc(100vh-16px)] min-w-52 max-w-72 overflow-y-auto overscroll-contain rounded-sm border border-border bg-popover/95 px-2 py-1.5 text-xs text-popover-foreground shadow-xl shadow-black/35 backdrop-blur",
        !open && "hidden",
      )}
      data-testid="conversation-hover-card"
      ref={cardRef}
      style={{ left: "calc(var(--sidebar-width, 220px) + 8px)", top }}
    >
      <div className="truncate text-xs font-medium">{title}</div>
      <ConversationCorruptionDetails label={corruptionLabel} />
    </div>
  );
}

function ConversationCorruptionDetails({ label }: { label: string }) {
  return (
    <div className="mt-1.5 grid min-w-0 grid-cols-[14px_minmax(0,1fr)] gap-1.5 text-status-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-status-warning">Malformed chat data</div>
        <div className="break-words text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function useConversationHoverCard({
  corruptionLabel,
  title,
}: {
  corruptionLabel: string | null;
  title: string;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [top, setTop] = useState(hoverCardViewportInset);

  useLayoutEffect(() => {
    if (!visible || !corruptionLabel) {
      return;
    }

    function updatePosition() {
      const row = rowRef.current;
      const card = cardRef.current;
      if (!row || !card) {
        return;
      }
      setTop(clampedHoverCardTop(row.getBoundingClientRect(), card.getBoundingClientRect().height));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [corruptionLabel, title, visible]);

  function closeIfFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setVisible(false);
    }
  }

  return {
    cardRef,
    close: () => setVisible(false),
    closeIfFocusLeaves,
    open: () => setVisible(corruptionLabel !== null),
    rowRef,
    top,
    visible,
  };
}

function activeRunMatchesConversation(activeRun: Run | null, conversationId: string) {
  return (
    activeRun?.conversationId === conversationId &&
    (activeRun.status === "queued" || activeRun.status === "running")
  );
}

function clampedHoverCardTop(rowRect: DOMRect, cardHeight: number) {
  const maxTop = Math.max(
    hoverCardViewportInset,
    window.innerHeight - cardHeight - hoverCardViewportInset,
  );
  return Math.min(Math.max(hoverCardViewportInset, rowRect.top), maxTop);
}

function ConversationStatusIndicator({
  corruptionLabel,
  pinned,
  running,
  unread,
}: {
  corruptionLabel: string | null;
  pinned: boolean;
  running: boolean;
  unread: boolean;
}) {
  return (
    <span
      className="grid h-4 w-[18px] place-items-center overflow-hidden"
      title={corruptionLabel ?? undefined}
    >
      {corruptionLabel ? (
        <AlertTriangle
          aria-label={corruptionLabel}
          className="h-3.5 w-3.5 text-status-warning"
          data-testid="conversation-corruption-status"
          role="status"
        />
      ) : running ? (
        <AsciiSpinner
          className="w-[18px] text-[7px] text-muted-foreground"
          label="Chat response running"
        />
      ) : unread ? (
        <span
          aria-label="Unread assistant response"
          className="h-1.5 w-1.5 rounded-full bg-primary"
          role="status"
        />
      ) : pinned ? (
        <Pin aria-label="Pinned chat" className="h-3 w-3 text-muted-foreground" role="status" />
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
