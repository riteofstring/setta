import type { ChatMessage } from "@generated/backend";
import { ArrowDown, ChevronUp, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { chatMessageText } from "./chat-message-text";
import {
  isVisibleMessage,
  timelineRowForMessage,
  type TranscriptTimelineRow,
} from "./chat-transcript-timeline";
import { chatReadableColumnAttributes, chatReadableColumnClass } from "./chat-layout";
import { Input } from "./ui/input";

export interface TranscriptSearchController {
  activeIndex: number;
  activeMessageId: string | null;
  close: () => void;
  inputRef: { current: HTMLInputElement | null };
  matchCount: number;
  next: () => void;
  open: boolean;
  previous: () => void;
  query: string;
  setQuery: (query: string) => void;
}

export function useTranscriptSearch({
  messagesById,
  messageIds,
  open,
  setOpen,
  timeline,
  virtuosoRef,
}: {
  messagesById: Record<string, ChatMessage>;
  messageIds: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
  timeline: TranscriptTimelineRow[];
  virtuosoRef: { current: VirtuosoHandle | null };
}): TranscriptSearchController {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQueryValue] = useState("");
  const matches = useMemo(
    () =>
      transcriptSearchMatches(
        messageIds.map((messageId) => messagesById[messageId]),
        query,
      ),
    [messageIds, messagesById, query],
  );
  const activeMessageId = matches[activeIndex]?.messageId ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open]);

  useEffect(() => {
    if (activeIndex < matches.length) {
      return;
    }
    setActiveIndex(Math.max(0, matches.length - 1));
  }, [activeIndex, matches.length]);

  useEffect(() => {
    if (!activeMessageId) {
      return;
    }
    const row = timelineRowForMessage(timeline, activeMessageId);
    if (!row) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "center", index: row.index });
  }, [activeMessageId, timeline, virtuosoRef]);

  function move(direction: "next" | "previous") {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const offset = direction === "next" ? 1 : -1;
      return (current + offset + matches.length) % matches.length;
    });
  }

  return {
    activeIndex,
    activeMessageId,
    close: () => setOpen(false),
    inputRef,
    matchCount: matches.length,
    next: () => move("next"),
    open,
    previous: () => move("previous"),
    query,
    setQuery: (nextQuery) => {
      setQueryValue(nextQuery);
      setActiveIndex(0);
    },
  };
}

export function transcriptSearchMatches(messages: Array<ChatMessage | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return [];
  }
  return messages
    .filter((message): message is ChatMessage => message !== undefined)
    .filter(isVisibleMessage)
    .filter((message) => chatMessageText(message).toLowerCase().includes(normalizedQuery))
    .map((message) => ({ messageId: message.id }));
}

export function ChatSearchBar({ search }: { search: TranscriptSearchController }) {
  if (!search.open) {
    return null;
  }

  const resultLabel =
    search.query.trim() === ""
      ? "0/0"
      : `${search.matchCount === 0 ? 0 : search.activeIndex + 1}/${search.matchCount}`;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-2 z-20 flex justify-center">
      <div
        {...chatReadableColumnAttributes}
        className={`${chatReadableColumnClass} flex justify-end`}
      >
        <div className="pointer-events-auto flex h-7 w-full max-w-xs min-w-0 items-center gap-1 rounded-sm border border-border bg-popover/95 px-1.5 text-popover-foreground shadow-xl shadow-black/40 backdrop-blur">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs text-popover-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-0"
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                search.close();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) {
                  search.previous();
                  return;
                }
                search.next();
              }
            }}
            placeholder="Search chat"
            ref={search.inputRef}
            value={search.query}
          />
          <span className="min-w-8 text-right text-[11px] text-muted-foreground">
            {resultLabel}
          </span>
          <SearchNavButton
            disabled={search.matchCount === 0}
            label="Previous result"
            onClick={search.previous}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </SearchNavButton>
          <SearchNavButton
            disabled={search.matchCount === 0}
            label="Next result"
            onClick={search.next}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </SearchNavButton>
          <SearchNavButton label="Close chat search" onClick={search.close}>
            <X className="h-3.5 w-3.5" />
          </SearchNavButton>
        </div>
      </div>
    </div>
  );
}

function SearchNavButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:text-muted-foreground/50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
