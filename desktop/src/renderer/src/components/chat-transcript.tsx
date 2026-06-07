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
import { ArrowDown, ChevronUp } from "lucide-react";
import {
  memo,
  type KeyboardEvent,
  type UIEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { Button } from "./ui/button";
import { MessageActions, MessageTimestamp } from "./chat-message-actions";
import { chatMessageText } from "./chat-message-text";
import { MarkdownText } from "./markdown-text";
import { RunActivityRows } from "./chat-run-activity";
import { ApprovalCard, type SubmitApproval } from "./chat-transcript-approvals";
import { BrailleSpinner } from "./ascii-spinner";
import {
  isVisibleMessage,
  transcriptTimelineRows,
  type TranscriptTimelineRow,
} from "./chat-transcript-timeline";
import { ChatSearchBar, useTranscriptSearch } from "./chat-transcript-search";
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
  goal: "max-w-full overflow-hidden rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-[13px] leading-5 break-words text-emerald-100",
  normal:
    "max-w-full overflow-hidden rounded-sm bg-muted px-3 py-2 text-[13px] leading-5 break-words text-foreground",
  queued:
    "max-w-full overflow-hidden rounded-sm border border-dashed border-border bg-background px-3 py-2 text-[13px] leading-5 break-words text-muted-foreground",
  steering:
    "max-w-full overflow-hidden rounded-sm border border-blue-400/40 bg-blue-950/30 px-3 py-2 text-[13px] leading-5 break-words text-blue-100",
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
  const timestampMessageIds = useMemo(() => timestampMessageIdsForTimeline(timeline), [timeline]);
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
        className="h-full min-h-0 min-w-0 bg-background px-3 pt-4 pb-2"
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
                showTimestamp={timestampMessageIds.has(item.message.id)}
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
              timestampMessageIds={timestampMessageIds}
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
        className="h-full min-h-0 min-w-0 overflow-y-auto bg-background px-3 pt-4 pb-2"
        data-testid="chat-transcript-scroller"
      >
        <div
          className="mx-auto w-full max-w-3xl py-16 text-center text-xs text-muted-foreground"
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

const TranscriptTurnRow = memo(function TranscriptTurnRow({
  activeSearchMessageId,
  turn,
  loadRunItemOutput,
  rowActions,
  timestampMessageIds,
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
  timestampMessageIds: Set<string>;
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
          showTimestamp={timestampMessageIds.has(turn.triggerMessage.id)}
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
          showTimestamp={timestampMessageIds.has(turn.assistantMessage.id)}
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
  showTimestamp,
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
  showTimestamp: boolean;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}) {
  const itemRows = activityItemsForMessage(message, runItemIdsByRunId, runItemsById);
  const text = chatMessageText(message);
  const [editMode, setEditMode] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(text);
  const queuedEditable = isQueuedEditableMessage(message);
  const pendingSteering = isPendingSteeringMessage(message, rowActions.activeRun);
  const rowBusy = messageRowBusy(message, rowActions);

  useEffect(() => {
    if (!queuedEditable) {
      setEditMode(false);
      setConfirmRemove(false);
    }
  }, [queuedEditable]);

  useEffect(() => {
    if (!editMode) {
      setDraft(text);
    }
  }, [editMode, text]);

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
  const activityRows =
    itemRows.length > 0 ? (
      <RunActivityRows
        items={itemRows}
        loadRunItemOutput={loadRunItemOutput}
        outputIdsByRunItemId={runItemOutputIdsByRunItemId}
        outputPagesByRunItemId={runItemOutputPagesByRunItemId}
        outputsById={runItemOutputsById}
      />
    ) : null;
  const messageBody = (
    <>
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
    </>
  );

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
      <div className={messageShellClass(message)}>
        <div className={messageActionRowClass(message)}>
          <div
            className={messageContainerClass(message)}
            data-testid={messageContentTestId(message)}
          >
            {messageBody}
          </div>
          {editMode ? null : <MessageActions showRetry={canRetryByForking(message)} text={text} />}
        </div>
        {message.role === "user" ? null : activityRows}
        {showTimestamp ? <MessageTimestamp message={message} /> : null}
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

function timestampMessageIdsForTimeline(timeline: TranscriptTimelineRow[]) {
  const messages = visibleMessagesForTimeline(timeline);
  const timestampMessageIds = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const nextMessage = messages[index + 1] ?? null;
    if (!nextMessage || timestampGroupKey(message) !== timestampGroupKey(nextMessage)) {
      timestampMessageIds.add(message.id);
    }
  }
  return timestampMessageIds;
}

function visibleMessagesForTimeline(timeline: TranscriptTimelineRow[]) {
  const messages: ChatMessage[] = [];
  for (const row of timeline) {
    if (row.kind === "message") {
      messages.push(row.message);
      continue;
    }
    if (isVisibleMessage(row.turn.triggerMessage)) {
      messages.push(row.turn.triggerMessage);
    }
    if (row.turn.assistantMessage && isVisibleMessage(row.turn.assistantMessage)) {
      messages.push(row.turn.assistantMessage);
    }
  }
  return messages;
}

function timestampGroupKey(message: ChatMessage) {
  return message.role === "user" ? "user" : "ai";
}

function messageShellClass(message: ChatMessage) {
  if (message.role === "user") {
    return "group/message flex max-w-[82%] min-w-0 flex-col items-end overflow-visible";
  }
  return "group/message flex max-w-[88%] min-w-0 flex-col items-start overflow-visible";
}

function messageActionRowClass(message: ChatMessage) {
  if (message.role === "user") {
    return "flex max-w-full min-w-0 flex-row-reverse items-start gap-1.5 overflow-visible";
  }
  return "flex max-w-full min-w-0 items-start gap-1.5 overflow-visible";
}

function canRetryByForking(message: ChatMessage) {
  return (
    message.delivery === "normal" &&
    message.status === "complete" &&
    (message.role === "assistant" || message.role === "user")
  );
}

function messageRowBusy(message: ChatMessage, rowActions: TranscriptRowActions) {
  return (
    (rowActions.operation === "editingQueued" &&
      rowActions.editingQueuedMessageId === message.id) ||
    (rowActions.operation === "removingQueued" && rowActions.removingQueuedMessageId === message.id)
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
      if (text === "" && message.status === "streaming") {
        return (
          <div className="flex h-5 items-center">
            <BrailleSpinner label="Assistant is thinking" />
          </div>
        );
      }
      return <MarkdownText text={assistantMessageText(text, message.status)} />;
    default:
      return assertNever(message.role);
  }
}

function assistantMessageText(text: string, status: MessageStatus) {
  if (text !== "") {
    return text;
  }
  switch (status) {
    case "streaming":
      return "";
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
    .filter((item): item is RunItem => item !== undefined);
}

function messageContainerClass(message: ChatMessage) {
  return message.role === "user"
    ? userMessageContainerClassByDelivery[message.delivery]
    : assistantMessageContainerClassByRole[message.role];
}

function messageContentTestId(message: ChatMessage) {
  return `chat-${message.role}-message-content`;
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
