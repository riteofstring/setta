import type {
  ChatMessage,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import { ArrowDown, ChevronUp, Search, X } from "lucide-react";
import {
  memo,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { MarkdownText } from "./markdown-text";
import { RunActivityRows } from "./chat-run-activity";
import { ApprovalCard, type SubmitApproval } from "./chat-transcript-approvals";
import {
  isVisibleMessage,
  timelineRowForMessage,
  transcriptTimelineRows,
  type TranscriptTimelineRow,
} from "./chat-transcript-timeline";
import {
  canSaveQueuedEdit,
  isPendingSteeringMessage,
  isQueuedEditableMessage,
  MessageRowActions,
  QueuedMessageEditor,
  type TranscriptRowActions,
} from "./chat-transcript-row-actions";
import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  editingQueuedMessageId: string | null;
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
  operation: string | null;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  searchOpen?: boolean;
  sendSteeringImmediately: (prompt?: string) => Promise<void>;
  setSearchOpen?: (open: boolean) => void;
  submitApproval: SubmitApproval;
  transcript: TranscriptTurn[];
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

const messageRowClassByRole = {
  assistant: "mx-auto flex w-full max-w-3xl min-w-0 justify-start py-1.5",
  command: "mx-auto flex w-full max-w-3xl min-w-0 justify-start py-1.5",
  developer: "mx-auto flex w-full max-w-3xl min-w-0 justify-start py-1.5",
  system: "mx-auto flex w-full max-w-3xl min-w-0 justify-start py-1.5",
  tool: "mx-auto flex w-full max-w-3xl min-w-0 justify-start py-1.5",
  user: "mx-auto flex w-full max-w-3xl min-w-0 justify-end py-1.5",
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
  "max-w-[84%] min-w-0 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] leading-5 break-words text-zinc-100";

const assistantMessageContainerClassByRole = {
  assistant: assistantMessageContainerClass,
  command:
    "max-w-[84%] min-w-0 overflow-hidden rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-[13px] leading-5 break-words text-emerald-100",
  developer: assistantMessageContainerClass,
  system: assistantMessageContainerClass,
  tool: assistantMessageContainerClass,
} satisfies Record<Exclude<MessageRole, "user">, string>;

const userMessageContainerClassByDelivery = {
  goal: "max-w-[78%] overflow-hidden rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-[13px] leading-5 break-words text-emerald-100",
  normal:
    "max-w-[78%] overflow-hidden rounded-sm bg-zinc-800 px-3 py-2 text-[13px] leading-5 break-words text-zinc-100",
  queued:
    "max-w-[78%] overflow-hidden rounded-sm border border-dashed border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] leading-5 break-words text-zinc-300",
  steering:
    "max-w-[78%] overflow-hidden rounded-sm border border-blue-400/40 bg-blue-950/30 px-3 py-2 text-[13px] leading-5 break-words text-blue-100",
} satisfies Record<MessageDelivery, string>;

export function ChatTranscript({
  activeRun,
  editQueuedMessage,
  editingQueuedMessageId,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messageIds,
  messagesById,
  operation,
  removeQueuedMessage,
  removingQueuedMessageId,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
  searchOpen = false,
  sendSteeringImmediately,
  setSearchOpen = () => {},
  submitApproval,
  transcript: backendTranscript,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollTopRef = useRef(0);
  const visibleStartIndexRef = useRef(0);
  const [pinned, setPinned] = useState(true);
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<{
    key: string;
    previousFirstKey: string | null;
    previousLength: number;
  } | null>(null);
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
  const timeline = useMemo(() => transcriptTimelineRows(transcript), [transcript]);
  const search = useTranscriptSearch({
    messagesById,
    messageIds,
    open: searchOpen,
    setOpen: setSearchOpen,
    timeline,
    virtuosoRef,
  });
  const rowActions: TranscriptRowActions = {
    activeRun,
    editQueuedMessage,
    editingQueuedMessageId,
    operation,
    removeQueuedMessage,
    removingQueuedMessageId,
    sendSteeringImmediately,
  };

  useEffect(() => {
    if (!pinned) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [activeRun, pinned, timeline.length, transcript.runItemOutputsById, transcript.runItemsById]);

  useEffect(() => {
    if (!pendingScrollAnchor) {
      return;
    }
    const currentFirstKey = timeline[0]?.key ?? null;
    if (
      currentFirstKey === pendingScrollAnchor.previousFirstKey &&
      timeline.length <= pendingScrollAnchor.previousLength
    ) {
      return;
    }
    const index = timeline.findIndex((row) => row.key === pendingScrollAnchor.key);
    setPendingScrollAnchor(null);
    if (index === -1) {
      return;
    }
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ align: "start", index });
    });
  }, [pendingScrollAnchor, timeline, virtuosoRef]);

  function updatePinnedFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    if (distanceFromBottom <= 8) {
      setPinned(true);
    }
    scrollTopRef.current = scrollTop;
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    updatePinnedFromScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY < 0) {
      setPinned(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (["ArrowUp", "Home", "PageUp"].includes(event.key)) {
      setPinned(false);
    }
  }

  async function loadOlderAndPreserveScroll() {
    const anchorKey = timeline[visibleStartIndexRef.current]?.key ?? timeline[0]?.key ?? null;
    const previousFirstKey = timeline[0]?.key ?? null;
    const previousLength = timeline.length;
    setPinned(false);
    await loadOlder();
    if (anchorKey) {
      setPendingScrollAnchor({ key: anchorKey, previousFirstKey, previousLength });
    }
  }

  if (timeline.length === 0) {
    return <EmptyChatTranscript activeRun={activeRun} submitApproval={submitApproval} />;
  }

  return (
    <div
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      onKeyDownCapture={handleKeyDown}
      onScrollCapture={handleScroll}
      onWheelCapture={handleWheel}
    >
      <ChatSearchBar search={search} />
      <Virtuoso
        atBottomStateChange={(atBottom) => {
          if (atBottom) {
            setPinned(true);
          }
        }}
        className="h-full min-h-0 min-w-0 bg-zinc-900 px-3 pt-4 pb-2"
        components={{
          Footer: () => <TranscriptFooter activeRun={activeRun} submitApproval={submitApproval} />,
          Header: () => (
            <TranscriptHeader hasMoreOlder={hasMoreOlder} loadOlder={loadOlderAndPreserveScroll} />
          ),
        }}
        data={timeline}
        data-testid="chat-transcript-scroller"
        computeItemKey={(_, item) => item.key}
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
                rowActions={rowActions}
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
              runItemIdsByRunId={transcript.runItemIdsByRunId}
              runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
              runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
              runItemOutputsById={transcript.runItemOutputsById}
              runItemsById={transcript.runItemsById}
              turn={item.turn}
              rowActions={rowActions}
            />
          );
        }}
        overscan={200}
        rangeChanged={(range) => {
          visibleStartIndexRef.current = range.startIndex;
        }}
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
        className="h-full min-h-0 min-w-0 overflow-y-auto bg-zinc-900 px-3 pt-4 pb-2"
        data-testid="chat-transcript-scroller"
      >
        <div
          className="mx-auto w-full max-w-3xl py-16 text-center text-xs text-zinc-500"
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
        className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
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
    <div className="mx-auto w-full max-w-3xl py-2">
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
    <Button
      aria-label="Jump to latest"
      className="absolute bottom-4 right-6 shadow-sm"
      onClick={() => {
        virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
        setPinned(true);
      }}
      variant="secondary"
    >
      <ArrowDown className="h-4 w-4" />
    </Button>
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
      <div className="pointer-events-auto flex h-7 w-full max-w-xs min-w-0 items-center gap-1 rounded-sm border border-zinc-700/90 bg-zinc-800/95 px-1.5 text-zinc-100 shadow-xl shadow-black/40 backdrop-blur">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
        <Input
          className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:border-0"
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
        <span className="min-w-8 text-right text-[11px] text-zinc-500">{resultLabel}</span>
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
      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:text-zinc-600"
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
  loadRunItemOutput,
  rowActions,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  activeSearchMessageId: string | null;
  turn: TranscriptTurn;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  rowActions: TranscriptRowActions;
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
          rowActions={rowActions}
          runItemIdsByRunId={runItemIdsByRunId}
          runItemOutputIdsByRunItemId={runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
          runItemOutputsById={runItemOutputsById}
          runItemsById={runItemsById}
        />
      ) : null}
      {turn.assistantMessage ? (
        <MessageRow
          loadRunItemOutput={loadRunItemOutput}
          activeSearchMessageId={activeSearchMessageId}
          message={turn.assistantMessage}
          rowActions={rowActions}
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
  loadRunItemOutput,
  rowActions,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  activeSearchMessageId: string | null;
  message: ChatMessage;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  rowActions: TranscriptRowActions;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}) {
  const itemRows = activityItemsForMessage(message, runItemIdsByRunId, runItemsById);
  const [editMode, setEditMode] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(chatMessageText(message));
  const queuedEditable = isQueuedEditableMessage(message);
  const pendingSteering = isPendingSteeringMessage(message, rowActions.activeRun);
  const rowBusy =
    (rowActions.operation === "editingQueued" &&
      rowActions.editingQueuedMessageId === message.id) ||
    (rowActions.operation === "removingQueued" &&
      rowActions.removingQueuedMessageId === message.id);

  useEffect(() => {
    if (!queuedEditable) {
      setEditMode(false);
      setConfirmRemove(false);
    }
  }, [queuedEditable]);

  useEffect(() => {
    if (!editMode) {
      setDraft(chatMessageText(message));
    }
  }, [editMode, message]);

  async function saveQueuedEdit() {
    if (!canSaveQueuedEdit(message, draft, rowBusy)) {
      return;
    }
    await rowActions.editQueuedMessage(message.id, draft);
    setEditMode(false);
  }

  async function removeQueued() {
    if (rowBusy) {
      return;
    }
    await rowActions.removeQueuedMessage(message.id);
    setConfirmRemove(false);
  }

  return (
    <div
      className={messageRowClass(message, message.id === activeSearchMessageId)}
      data-chat-message="true"
      data-message-delivery={message.delivery}
      data-message-id={message.id}
      data-message-role={message.role}
      data-search-active={message.id === activeSearchMessageId ? "true" : "false"}
      data-testid={messageRowTestId(message)}
    >
      <div className={messageContainerClass(message)}>
        <MessageRowActions
          confirmRemove={confirmRemove}
          draft={draft}
          editMode={editMode}
          message={message}
          pendingSteering={pendingSteering}
          queuedEditable={queuedEditable}
          rowActions={rowActions}
          rowBusy={rowBusy}
          saveQueuedEdit={saveQueuedEdit}
          setConfirmRemove={setConfirmRemove}
          setDraft={setDraft}
          setEditMode={setEditMode}
          removeQueued={removeQueued}
        />
        {editMode ? (
          <QueuedMessageEditor
            draft={draft}
            message={message}
            rowBusy={rowBusy}
            saveQueuedEdit={saveQueuedEdit}
            setDraft={setDraft}
            setEditMode={setEditMode}
          />
        ) : (
          <MessageContent message={message} />
        )}
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
    </div>
  );
});

function messageRowClass(message: ChatMessage, activeSearchMatch: boolean) {
  return cn(
    messageRowClassByRole[message.role],
    activeSearchMatch && "rounded-sm bg-blue-400/5 ring-1 ring-blue-400/50",
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
    case "developer":
    case "system":
    case "tool":
      return <MarkdownText text={assistantMessageText(text, message.status)} />;
    default:
      return assertNever(message.role);
  }
}

function chatMessageText(message: ChatMessage) {
  return message.parts.map((part) => part.text).join("");
}

function assistantMessageText(text: string, status: MessageStatus) {
  if (text !== "") {
    return text;
  }
  switch (status) {
    case "streaming":
      return "...";
    case "cancelled":
    case "complete":
    case "error":
    case "pending":
      return "";
    default:
      return assertNever(status);
  }
}

function UserDeliveryBadge({ message }: { message: ChatMessage }) {
  if (message.role !== "user" || message.delivery === "normal") {
    return null;
  }
  return <div className="mt-2 text-xs font-medium opacity-80">{deliveryLabel(message)}</div>;
}

function MessageStatus({ message }: { message: ChatMessage }) {
  const label = messageStatusLabelByStatus[message.status];
  if (label === null) {
    return null;
  }
  return <div className="mt-3 text-xs font-medium text-red-400">{label}</div>;
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
    .filter((item): item is RunItem => item !== undefined);
}

function messageContainerClass(message: ChatMessage) {
  return message.role === "user"
    ? userMessageContainerClassByDelivery[message.delivery]
    : assistantMessageContainerClassByRole[message.role];
}

function deliveryLabel(message: ChatMessage) {
  if (message.delivery === "normal") {
    return "";
  }
  if (message.delivery === "steering" && message.status === "pending") {
    return "Steering pending";
  }
  return deliveryLabelByDelivery[message.delivery];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled generated value: ${JSON.stringify(value)}`);
}
