import type {
  ApprovalAnswer,
  ApprovalRequest,
  ApprovalQuestion,
  ChatMessage,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import { ArrowDown, Check, ChevronUp, Search, X } from "lucide-react";
import {
  memo,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { BrailleSpinner } from "./ascii-spinner";
import { MessageActions, MessageTimestamp, UserMessageEditor } from "./chat-message-actions";
import { MarkdownText } from "./markdown-text";
import { RunActivityRows } from "./chat-run-activity";
import { StructuredInputApproval } from "./structured-input-approval";
import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  searchOpen?: boolean;
  setSearchOpen?: (open: boolean) => void;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
  transcript: TranscriptTurn[];
  updateUserMessage: (messageId: string, text: string) => Promise<void>;
}

interface TranscriptIndexes {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  turns: TranscriptTurn[];
}

type TranscriptTimelineItem =
  | { kind: "message"; message: ChatMessage; ordinal: number }
  | { kind: "turn"; ordinal: number; turn: TranscriptTurn };

function transcriptIndexes(props: {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  transcript: TranscriptTurn[];
}): TranscriptIndexes {
  return {
    messageIds: props.messageIds,
    messagesById: props.messagesById,
    runItemIdsByRunId: props.runItemIdsByRunId,
    runItemOutputIdsByRunItemId: props.runItemOutputIdsByRunItemId,
    runItemOutputsById: props.runItemOutputsById,
    runItemsById: props.runItemsById,
    turns: props.transcript,
  };
}

function transcriptTimelineItems(indexes: TranscriptIndexes): TranscriptTimelineItem[] {
  const turnMessageIds = new Set<string>();
  const items: TranscriptTimelineItem[] = indexes.turns.map((turn) => {
    turnMessageIds.add(turn.triggerMessage.id);
    if (turn.assistantMessage) {
      turnMessageIds.add(turn.assistantMessage.id);
    }
    for (const message of turn.steeringMessages) {
      turnMessageIds.add(message.id);
    }
    return { kind: "turn", ordinal: turn.triggerMessage.ordinal, turn };
  });
  for (const messageId of indexes.messageIds) {
    const message = indexes.messagesById[messageId];
    if (
      !message ||
      message.runId !== "" ||
      turnMessageIds.has(message.id) ||
      !isVisibleMessage(message)
    ) {
      continue;
    }
    items.push({ kind: "message", message, ordinal: message.ordinal });
  }
  return items.toSorted((left, right) => {
    if (left.ordinal === right.ordinal) {
      return timelineItemID(left).localeCompare(timelineItemID(right));
    }
    return left.ordinal - right.ordinal;
  });
}

function timelineItemID(item: TranscriptTimelineItem) {
  return item.kind === "turn" ? item.turn.run.id : item.message.id;
}

const messageRowClassByRole = {
  assistant: "mx-auto flex w-full max-w-2xl min-w-0 justify-start px-3 py-1.5",
  command: "mx-auto flex w-full max-w-2xl min-w-0 justify-start px-3 py-1.5",
  developer: "mx-auto flex w-full max-w-2xl min-w-0 justify-start px-3 py-1.5",
  system: "mx-auto flex w-full max-w-2xl min-w-0 justify-start px-3 py-1.5",
  tool: "mx-auto flex w-full max-w-2xl min-w-0 justify-start px-3 py-1.5",
  user: "mx-auto flex w-full max-w-2xl min-w-0 justify-end px-3 py-1.5",
} satisfies Record<MessageRole, string>;

const deliveryLabelByDelivery = {
  goal: "Goal",
  queued: "Queued",
  steering: "Steering",
} satisfies Record<Exclude<MessageDelivery, "normal">, string>;

const messageStatusLabelByStatus = {
  cancelled: "cancelled",
  complete: null,
  error: "error",
  pending: null,
  streaming: null,
} satisfies Record<MessageStatus, string | null>;

const assistantMessageContainerClass =
  "min-w-0 max-w-full overflow-hidden text-[13px] leading-5 break-words text-foreground";

const assistantMessageContainerClassByRole = {
  assistant: assistantMessageContainerClass,
  command:
    "min-w-0 max-w-full overflow-hidden border-l border-emerald-500/40 pl-3 text-[13px] leading-5 break-words text-emerald-100",
  developer: assistantMessageContainerClass,
  system: assistantMessageContainerClass,
  tool: assistantMessageContainerClass,
} satisfies Record<Exclude<MessageRole, "user">, string>;

const userMessageContainerClassByDelivery = {
  goal: "max-w-[78%] overflow-hidden rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-[13px] leading-5 break-words text-emerald-100",
  normal:
    "min-w-0 max-w-[calc(100%-3.5rem)] overflow-hidden rounded-sm bg-muted px-2 py-1 text-[13px] leading-5 break-words text-foreground",
  queued:
    "min-w-0 max-w-[calc(100%-3.5rem)] overflow-hidden rounded-sm border border-dashed border-border bg-background px-2 py-1 text-[13px] leading-5 break-words text-muted-foreground",
  steering:
    "min-w-0 max-w-[calc(100%-3.5rem)] overflow-hidden rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-[13px] leading-5 break-words text-foreground",
} satisfies Record<MessageDelivery, string>;

type SubmitApproval = ChatTranscriptProps["submitApproval"];

const transcriptPinnedThresholdPx = 16;
const jumpToLatestRevealThresholdPx = 96;

export function ChatTranscript({
  activeRun,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messageIds,
  messagesById,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
  searchOpen = false,
  setSearchOpen = () => {},
  submitApproval,
  transcript: backendTranscript,
  updateUserMessage,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [pinned, setPinned] = useState(true);
  const transcript = useMemo(
    () =>
      transcriptIndexes({
        messageIds,
        messagesById,
        runItemIdsByRunId,
        runItemOutputIdsByRunItemId,
        runItemOutputsById,
        runItemsById,
        transcript: backendTranscript,
      }),
    [
      messageIds,
      messagesById,
      runItemIdsByRunId,
      runItemOutputIdsByRunItemId,
      runItemOutputsById,
      runItemsById,
      backendTranscript,
    ],
  );
  const timeline = useMemo(() => transcriptTimelineItems(transcript), [transcript]);
  const firstItemIndex = timeline[0]?.ordinal ?? 0;
  const search = useTranscriptSearch({
    messagesById,
    messageIds,
    open: searchOpen,
    setOpen: setSearchOpen,
    timeline,
    virtuosoRef,
  });

  useEffect(() => {
    if (!pinned) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [activeRun, pinned, timeline.length, transcript.runItemOutputsById, transcript.runItemsById]);

  function updatePinnedFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    if (distanceFromBottom <= transcriptPinnedThresholdPx) {
      setPinned(true);
      return;
    }
    if (distanceFromBottom >= jumpToLatestRevealThresholdPx) {
      setPinned(false);
    }
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    updatePinnedFromScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (["Home", "PageUp"].includes(event.key)) {
      setPinned(false);
    }
  }

  async function loadOlderAndPreserveScroll() {
    await loadOlder();
  }

  if (timeline.length === 0) {
    return <EmptyChatTranscript activeRun={activeRun} submitApproval={submitApproval} />;
  }

  return (
    <div
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      onKeyDownCapture={handleKeyDown}
      onScrollCapture={handleScroll}
    >
      <ChatSearchBar search={search} />
      <Virtuoso
        atBottomStateChange={(atBottom) => {
          if (atBottom) {
            setPinned(true);
          }
        }}
        className="h-full min-h-0 min-w-0 overflow-x-hidden bg-background pt-4 pb-2"
        components={{
          Footer: () => <TranscriptFooter activeRun={activeRun} submitApproval={submitApproval} />,
          Header: () => (
            <TranscriptHeader hasMoreOlder={hasMoreOlder} loadOlder={loadOlderAndPreserveScroll} />
          ),
        }}
        data={timeline}
        data-testid="chat-transcript-scroller"
        firstItemIndex={firstItemIndex}
        followOutput={pinned ? "auto" : false}
        increaseViewportBy={{ bottom: 800, top: 400 }}
        initialItemCount={Math.min(timeline.length, 30)}
        itemContent={(_, item) => {
          if (item.kind === "message") {
            return (
              <MessageRow
                loadRunItemOutput={loadRunItemOutput}
                activeSearchMessageId={search.activeMessageId}
                message={item.message}
                updateUserMessage={updateUserMessage}
                runItemIdsByRunId={transcript.runItemIdsByRunId}
                runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
                runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
                runItemOutputsById={transcript.runItemOutputsById}
                runItemsById={transcript.runItemsById}
              />
            );
          }
          return (
            <TranscriptTurnRow
              loadRunItemOutput={loadRunItemOutput}
              activeSearchMessageId={search.activeMessageId}
              updateUserMessage={updateUserMessage}
              runItemIdsByRunId={transcript.runItemIdsByRunId}
              runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
              runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
              runItemOutputsById={transcript.runItemOutputsById}
              runItemsById={transcript.runItemsById}
              turn={item.turn}
            />
          );
        }}
        overscan={200}
        ref={virtuosoRef}
      />
      <JumpToLatestButton pinned={pinned} setPinned={setPinned} virtuosoRef={virtuosoRef} />
    </div>
  );
}

function EmptyChatTranscript({
  activeRun,
  submitApproval,
}: {
  activeRun: Run | null;
  submitApproval: SubmitApproval;
}) {
  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <div
        className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-background px-3 pt-4 pb-2"
        data-testid="chat-transcript-scroller"
      >
        <div
          className="mx-auto w-full max-w-2xl py-16 text-center text-xs text-muted-foreground"
          data-testid="empty-chat"
        >
          Start a conversation for this workspace.
        </div>
        <PendingApproval activeRun={activeRun} submitApproval={submitApproval} />
      </div>
    </div>
  );
}

type TranscriptHeaderProps = { hasMoreOlder: boolean; loadOlder: () => Promise<void> };

function TranscriptHeader({ hasMoreOlder, loadOlder }: TranscriptHeaderProps) {
  if (!hasMoreOlder) {
    return null;
  }
  return (
    <div className="mb-2 flex justify-center">
      <Button
        className="border-border bg-background text-foreground hover:bg-accent"
        onClick={() => void loadOlder()}
        variant="secondary"
      >
        <ChevronUp className="h-4 w-4" />
        Older
      </Button>
    </div>
  );
}

type TranscriptFooterProps = { activeRun: Run | null; submitApproval: SubmitApproval };

function TranscriptFooter({ activeRun, submitApproval }: TranscriptFooterProps) {
  if (!activeRun?.pendingApproval) {
    return null;
  }
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-2">
      <PendingApproval activeRun={activeRun} submitApproval={submitApproval} />
    </div>
  );
}

function PendingApproval({
  activeRun,
  submitApproval,
}: {
  activeRun: Run | null;
  submitApproval: SubmitApproval;
}) {
  if (!activeRun?.pendingApproval) {
    return null;
  }
  return (
    <ApprovalCard
      approval={activeRun.pendingApproval}
      key={activeRun.pendingApproval.id}
      submitApproval={submitApproval}
    />
  );
}

function JumpToLatestButton({
  pinned,
  setPinned,
  virtuosoRef,
}: {
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  virtuosoRef: { current: VirtuosoHandle | null };
}) {
  if (pinned) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-4 flex justify-center">
      <div className="flex w-full max-w-2xl justify-end">
        <Button
          aria-label="Jump to latest"
          className="pointer-events-auto h-7 w-7 rounded-sm border-border bg-muted/95 px-0 text-foreground shadow-lg shadow-black/30 hover:bg-accent hover:text-foreground"
          onClick={() => {
            virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
            setPinned(true);
          }}
          variant="secondary"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface TranscriptSearchController {
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

function useTranscriptSearch({
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
  timeline: TranscriptTimelineItem[];
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
    const item = timelineItemForMessage(timeline, activeMessageId);
    if (!item) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "center", index: item.ordinal });
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

function transcriptSearchMatches(messages: Array<ChatMessage | undefined>, query: string) {
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

function timelineItemForMessage(timeline: TranscriptTimelineItem[], messageId: string) {
  return (
    timeline.find((item) => {
      if (item.kind === "message") {
        return item.message.id === messageId;
      }
      return transcriptTurnHasMessage(item.turn, messageId);
    }) ?? null
  );
}

function transcriptTurnHasMessage(turn: TranscriptTurn, messageId: string) {
  return (
    (isVisibleMessage(turn.triggerMessage) && turn.triggerMessage.id === messageId) ||
    turn.assistantMessage?.id === messageId ||
    turn.steeringMessages.some((message) => message.id === messageId)
  );
}

function isVisibleMessage(message: ChatMessage) {
  return message.delivery !== "goal";
}

function ChatSearchBar({ search }: { search: TranscriptSearchController }) {
  if (!search.open) {
    return null;
  }

  const resultLabel =
    search.query.trim() === ""
      ? "0/0"
      : `${search.matchCount === 0 ? 0 : search.activeIndex + 1}/${search.matchCount}`;

  return (
    <div className="pointer-events-none absolute top-2 right-3 left-3 z-20 flex justify-end">
      <div className="pointer-events-auto flex h-7 w-full max-w-xs min-w-0 items-center gap-1 rounded-sm border border-border/90 bg-muted/95 px-1.5 text-foreground shadow-xl shadow-black/40 backdrop-blur">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-0"
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
        <span className="min-w-8 text-right text-[11px] text-muted-foreground">{resultLabel}</span>
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
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:text-muted-foreground"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const TranscriptTurnRow = memo(function TranscriptTurnRow({
  activeSearchMessageId,
  turn,
  updateUserMessage,
  loadRunItemOutput,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  activeSearchMessageId: string | null;
  turn: TranscriptTurn;
  updateUserMessage: (messageId: string, text: string) => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}) {
  return (
    <div
      className="min-w-0"
      data-run-id={turn.run.id}
      data-testid="chat-transcript-turn"
      data-turn-status={turn.run.status}
    >
      {isVisibleMessage(turn.triggerMessage) ? (
        <MessageRow
          loadRunItemOutput={loadRunItemOutput}
          activeSearchMessageId={activeSearchMessageId}
          message={turn.triggerMessage}
          updateUserMessage={updateUserMessage}
          runItemIdsByRunId={runItemIdsByRunId}
          runItemOutputIdsByRunItemId={runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
          runItemOutputsById={runItemOutputsById}
          runItemsById={runItemsById}
        />
      ) : null}
      {turn.steeringMessages.map((message) => (
        <MessageRow
          key={message.id}
          loadRunItemOutput={loadRunItemOutput}
          activeSearchMessageId={activeSearchMessageId}
          message={message}
          updateUserMessage={updateUserMessage}
          runItemIdsByRunId={runItemIdsByRunId}
          runItemOutputIdsByRunItemId={runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
          runItemOutputsById={runItemOutputsById}
          runItemsById={runItemsById}
        />
      ))}
      {turn.assistantMessage ? (
        <MessageRow
          loadRunItemOutput={loadRunItemOutput}
          activeSearchMessageId={activeSearchMessageId}
          message={turn.assistantMessage}
          updateUserMessage={updateUserMessage}
          runItemIdsByRunId={runItemIdsByRunId}
          runItemOutputIdsByRunItemId={runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
          runItemOutputsById={runItemOutputsById}
          runItemsById={runItemsById}
        />
      ) : null}
    </div>
  );
});

const MessageRow = memo(function MessageRow({
  activeSearchMessageId,
  message,
  updateUserMessage,
  loadRunItemOutput,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  activeSearchMessageId: string | null;
  message: ChatMessage;
  updateUserMessage: (messageId: string, text: string) => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}) {
  const itemRows = activityItemsForMessage(message, runItemIdsByRunId, runItemsById);
  const text = chatMessageText(message);
  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(text);
    }
  }, [editing, text]);

  async function saveEdit() {
    const nextText = draft.trim();
    if (!nextText || nextText === text.trim()) {
      setDraft(text);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateUserMessage(message.id, nextText);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={messageRowClass(message, message.id === activeSearchMessageId)}
      data-chat-message="true"
      data-message-delivery={message.delivery}
      data-message-id={message.id}
      data-message-role={message.role}
      data-testid={messageRowTestId(message)}
    >
      <div className={messageShellClass(message, editing)}>
        {editing && message.role === "user" ? (
          <UserMessageEditor
            draft={draft}
            onCancel={() => {
              setDraft(text);
              setEditing(false);
            }}
            onChange={setDraft}
            onSave={() => void saveEdit()}
            saving={saving}
          />
        ) : (
          <div className={messageActionRowClass(message)}>
            <div className={messageContainerClass(message)}>
              <MessageContent message={message} />
              <UserDeliveryBadge message={message} />
              <MessageStatus message={message} />
              {itemRows.length > 0 ? (
                <RunActivityRows
                  items={itemRows}
                  loadRunItemOutput={loadRunItemOutput}
                  outputIdsByRunItemId={runItemOutputIdsByRunItemId}
                  outputPagesByRunItemId={runItemOutputPagesByRunItemId}
                  outputsById={runItemOutputsById}
                />
              ) : null}
            </div>
            <MessageActions
              canEdit={message.role === "user"}
              onEdit={() => {
                setDraft(text);
                setEditing(true);
              }}
              text={text}
            />
          </div>
        )}
        <MessageTimestamp message={message} />
      </div>
    </div>
  );
});

function messageRowClass(message: ChatMessage, activeSearchMatch: boolean) {
  return cn(
    messageRowClassByRole[message.role],
    activeSearchMatch && "rounded-sm bg-primary/5 ring-1 ring-primary/50",
  );
}

function messageRowTestId(message: ChatMessage) {
  if (message.role === "assistant") {
    return "chat-assistant-turn-row";
  }
  if (message.role === "command") {
    return "chat-command-result-row";
  }
  if (message.delivery === "queued") {
    return "chat-queued-turn-row";
  }
  return "chat-message-row";
}

function MessageContent({ message }: { message: ChatMessage }) {
  const text = chatMessageText(message);
  switch (message.role) {
    case "user":
      return <div className="whitespace-pre-wrap">{text}</div>;
    case "command":
      return <div className="whitespace-pre-wrap">{text}</div>;
    case "assistant":
      if (assistantMessageIsWaiting(message)) {
        return (
          <BrailleSpinner className="text-muted-foreground" label="Assistant response running" />
        );
      }
      return <MarkdownText text={text} />;
    case "developer":
    case "system":
    case "tool":
      return <MarkdownText text={text} />;
    default:
      return assertNever(message.role);
  }
}

function chatMessageText(message: ChatMessage) {
  return message.parts.map((part) => part.text).join("");
}

function assistantMessageIsWaiting(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    chatMessageText(message) === "" &&
    (message.status === "pending" || message.status === "streaming")
  );
}

function UserDeliveryBadge({ message }: { message: ChatMessage }) {
  if (message.role !== "user" || message.delivery === "normal") {
    return null;
  }
  return (
    <div className="mt-2 text-xs font-medium opacity-80">{deliveryLabel(message.delivery)}</div>
  );
}

function MessageStatus({ message }: { message: ChatMessage }) {
  const label = messageStatusLabelByStatus[message.status];
  if (label === null) {
    return null;
  }
  return <div className="mt-3 text-xs font-medium text-status-critical">{label}</div>;
}

function activityItemsForMessage(
  message: ChatMessage,
  runItemIdsByRunId: Record<string, string[]>,
  runItemsById: Record<string, RunItem>,
) {
  if (message.role === "user" || message.runId === "") {
    return [];
  }
  return (runItemIdsByRunId[message.runId] ?? [])
    .map((itemId) => runItemsById[itemId])
    .filter((item): item is RunItem => item !== undefined && item.type !== "agent_message");
}

function messageShellClass(message: ChatMessage, editing = false) {
  if (message.role === "user") {
    if (editing) {
      return "group/message flex w-full max-w-[82%] min-w-0 flex-col items-end overflow-hidden";
    }
    return "group/message flex max-w-[82%] min-w-0 flex-col items-end overflow-hidden";
  }
  return "group/message flex max-w-[88%] min-w-0 flex-col items-start overflow-visible";
}

function messageActionRowClass(message: ChatMessage) {
  if (message.role === "user") {
    return "flex max-w-full min-w-0 flex-row-reverse items-start gap-1.5 overflow-hidden";
  }
  return "flex max-w-full min-w-0 items-start gap-1.5";
}

function messageContainerClass(message: ChatMessage) {
  return message.role === "user"
    ? userMessageContainerClassByDelivery[message.delivery]
    : assistantMessageContainerClassByRole[message.role];
}

function deliveryLabel(delivery: Exclude<MessageDelivery, "normal">) {
  return deliveryLabelByDelivery[delivery];
}

function ApprovalCard({
  approval,
  submitApproval,
}: {
  approval: ApprovalRequest;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}) {
  return (
    <section
      className="min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-sm break-words text-foreground"
      data-testid="approval-card"
    >
      <div className="font-semibold">{approval.title}</div>
      {approval.body ? <div className="mt-1 text-muted-foreground">{approval.body}</div> : null}
      {approval.command ? (
        <pre className="mt-3 max-w-full overflow-x-auto rounded-sm border border-border bg-popover p-2 text-xs text-foreground">
          {approval.command}
        </pre>
      ) : null}
      {approval.filePath ? (
        <div className="mt-2 break-all font-mono text-xs">{approval.filePath}</div>
      ) : null}
      {approval.permission ? (
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded-sm border border-border bg-popover p-2 text-xs text-foreground">
          {approval.permission}
        </pre>
      ) : null}
      {approval.question ? <div className="mt-2">{approval.question}</div> : null}
      <ApprovalControls approval={approval} submitApproval={submitApproval} />
    </section>
  );
}

function ApprovalControls({
  approval,
  submitApproval,
}: {
  approval: ApprovalRequest;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}) {
  switch (approval.kind) {
    case "user_input":
      return (
        <UserInputApproval
          questions={approval.questions}
          submitApproval={(answers, cancelled) =>
            submitApproval(approval.id, !cancelled, "", answers, cancelled)
          }
        />
      );
    case "command":
    case "file_change":
    case "permission":
      return <DecisionApproval approvalId={approval.id} submitApproval={submitApproval} />;
    case "structured_input":
      if (approval.structuredInput === null) {
        return (
          <div className="mt-3 font-medium text-status-critical">
            Approval request is missing structured input metadata.
          </div>
        );
      }
      return (
        <StructuredInputApproval
          input={approval.structuredInput}
          submitApproval={(approved, answers, cancelled) =>
            submitApproval(approval.id, approved, "", answers, cancelled)
          }
        />
      );
    default:
      return assertNever(approval.kind);
  }
}

function DecisionApproval({
  approvalId,
  submitApproval,
}: {
  approvalId: string;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <Button
        className="border-border bg-secondary text-foreground hover:bg-card"
        onClick={() => void submitApproval(approvalId, true, "", [], false)}
        variant="primary"
      >
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button
        className="border-border bg-background text-foreground hover:bg-accent"
        onClick={() => void submitApproval(approvalId, false, "", [], false)}
        variant="secondary"
      >
        <X className="h-4 w-4" />
        Deny
      </Button>
    </div>
  );
}

function UserInputApproval({
  questions,
  submitApproval,
}: {
  questions: ApprovalQuestion[];
  submitApproval: (answers: ApprovalAnswer[], cancelled: boolean) => Promise<void>;
}) {
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<string, string>>({});
  if (questions.length === 0) {
    return (
      <div className="mt-3 font-medium text-status-critical">
        Approval request is missing questions.
      </div>
    );
  }
  const complete = questions.every(
    (question) => answerValue(answersByQuestion, question.id) !== "",
  );
  const answers = questions.map((question) => ({
    answers: [answerValue(answersByQuestion, question.id)],
    questionId: question.id,
    value: null,
  }));

  return (
    <div className="mt-3 space-y-3">
      {questions.map((question) => {
        const answer = answerValue(answersByQuestion, question.id);
        return (
          <div className="space-y-2" key={question.id}>
            {question.header ? <div className="font-medium">{question.header}</div> : null}
            <div>{question.question}</div>
            {question.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <Button
                    className={
                      answer === option
                        ? "border-border bg-secondary text-foreground hover:bg-card"
                        : "border-border bg-background text-foreground hover:bg-accent"
                    }
                    key={option}
                    onClick={() => setQuestionAnswer(setAnswersByQuestion, question.id, option)}
                    type="button"
                    variant={answer === option ? "primary" : "secondary"}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : null}
            <input
              className="w-full rounded-sm border border-border bg-popover px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              onChange={(event) =>
                setQuestionAnswer(setAnswersByQuestion, question.id, event.target.value)
              }
              type={question.isSecret ? "password" : "text"}
              value={answer}
            />
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button
          className="border-border bg-secondary text-foreground hover:bg-card"
          disabled={!complete}
          onClick={() => void submitApproval(answers, false)}
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Answer
        </Button>
        <Button
          className="border-border bg-background text-foreground hover:bg-accent"
          onClick={() => void submitApproval([], true)}
          type="button"
          variant="secondary"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function answerValue(answersByQuestion: Record<string, string>, questionID: string) {
  return answersByQuestion[questionID]?.trim() ?? "";
}

function setQuestionAnswer(
  setAnswersByQuestion: (next: (current: Record<string, string>) => Record<string, string>) => void,
  questionID: string,
  answer: string,
) {
  setAnswersByQuestion((current) => ({ ...current, [questionID]: answer }));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled generated value: ${JSON.stringify(value)}`);
}
