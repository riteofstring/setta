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
import { ArrowDown, Check, ChevronUp, X } from "lucide-react";
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
import { MarkdownText } from "./markdown-text";
import { RunActivityRows } from "./chat-run-activity";
import { StructuredInputApproval } from "./structured-input-approval";
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
  messageIds?: string[];
  messages: ChatMessage[];
  messagesById?: Record<string, ChatMessage>;
  runItemIdsByRunId?: Record<string, string[]>;
  runItemOutputIdsByRunItemId?: Record<string, string[]>;
  runItemOutputPagesByRunItemId?: Record<string, RunItemOutputPageState>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById?: Record<string, RunItemOutput>;
  runItems: RunItem[];
  runItemsById?: Record<string, RunItem>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
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

type TranscriptTimelineItem =
  | { kind: "message"; message: ChatMessage; ordinal: number }
  | { kind: "turn"; ordinal: number; turn: TranscriptTurn };

function transcriptIndexes(props: {
  messageIds: string[] | undefined;
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage> | undefined;
  runItemIdsByRunId: Record<string, string[]> | undefined;
  runItemOutputIdsByRunItemId: Record<string, string[]> | undefined;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput> | undefined;
  runItems: RunItem[];
  runItemsById: Record<string, RunItem> | undefined;
  transcript: TranscriptTurn[];
}): TranscriptIndexes {
  const messageIndex = messageIndexes(props.messages, props.messageIds, props.messagesById);
  return {
    ...messageIndex,
    ...runItemIndexes(props.runItems, props.runItemIdsByRunId, props.runItemsById),
    ...runItemOutputIndexes(
      props.runItemOutputs,
      props.runItemOutputIdsByRunItemId,
      props.runItemOutputsById,
    ),
    turns: hydrateTranscriptTurns(props.transcript, messageIndex.messagesById),
  };
}

function messageIndexes(
  messages: ChatMessage[],
  messageIds: string[] | undefined,
  messagesById: Record<string, ChatMessage> | undefined,
) {
  if (messageIds && messagesById) {
    return { messageIds, messagesById };
  }
  const ordered = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const fallbackById: Record<string, ChatMessage> = {};
  for (const message of ordered) {
    fallbackById[message.id] = message;
  }
  return {
    messageIds: ordered.map((message) => message.id),
    messagesById: fallbackById,
  };
}

function hydrateTranscriptTurns(
  turns: TranscriptTurn[],
  messagesById: Record<string, ChatMessage>,
): TranscriptTurn[] {
  return turns.map((turn) => ({
    ...turn,
    assistantMessage: turn.assistantMessage
      ? (messagesById[turn.assistantMessage.id] ?? turn.assistantMessage)
      : null,
    steeringMessages: turn.steeringMessages.map((message) => messagesById[message.id] ?? message),
    triggerMessage: messagesById[turn.triggerMessage.id] ?? turn.triggerMessage,
  }));
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
    if (!message || message.runId !== "" || turnMessageIds.has(message.id)) {
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

function runItemIndexes(
  runItems: RunItem[],
  runItemIdsByRunId: Record<string, string[]> | undefined,
  runItemsById: Record<string, RunItem> | undefined,
) {
  if (runItemIdsByRunId && runItemsById) {
    return { runItemIdsByRunId, runItemsById };
  }
  const ordered = runItems.toSorted(compareRunItems);
  const fallbackById: Record<string, RunItem> = {};
  const fallbackIdsByRunId: Record<string, string[]> = {};
  for (const item of ordered) {
    fallbackById[item.id] = item;
    fallbackIdsByRunId[item.runId] = [...(fallbackIdsByRunId[item.runId] ?? []), item.id];
  }
  return {
    runItemIdsByRunId: fallbackIdsByRunId,
    runItemsById: fallbackById,
  };
}

function runItemOutputIndexes(
  runItemOutputs: RunItemOutput[],
  runItemOutputIdsByRunItemId: Record<string, string[]> | undefined,
  runItemOutputsById: Record<string, RunItemOutput> | undefined,
) {
  if (runItemOutputIdsByRunItemId && runItemOutputsById) {
    return { runItemOutputIdsByRunItemId, runItemOutputsById };
  }
  const ordered = runItemOutputs.toSorted(compareRunItemOutputs);
  const fallbackById: Record<string, RunItemOutput> = {};
  const fallbackIdsByItemId: Record<string, string[]> = {};
  for (const output of ordered) {
    fallbackById[output.id] = output;
    fallbackIdsByItemId[output.runItemId] = [
      ...(fallbackIdsByItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    runItemOutputIdsByRunItemId: fallbackIdsByItemId,
    runItemOutputsById: fallbackById,
  };
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

const messageRowClassByRole = {
  assistant: "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2",
  command: "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2",
  developer: "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2",
  system: "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2",
  tool: "mx-auto flex w-full max-w-4xl min-w-0 justify-start py-2",
  user: "mx-auto flex w-full max-w-4xl min-w-0 justify-end py-2",
} satisfies Record<MessageRole, string>;

const deliveryLabelByDelivery = {
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
  "max-w-[84%] min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white px-4 py-3";

const assistantMessageContainerClassByRole = {
  assistant: assistantMessageContainerClass,
  command:
    "max-w-[84%] min-w-0 overflow-hidden rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 break-words text-emerald-950",
  developer: assistantMessageContainerClass,
  system: assistantMessageContainerClass,
  tool: assistantMessageContainerClass,
} satisfies Record<Exclude<MessageRole, "user">, string>;

const userMessageContainerClassByDelivery = {
  normal:
    "max-w-[78%] overflow-hidden rounded-md bg-zinc-900 px-4 py-3 text-sm leading-6 break-words text-white",
  queued:
    "max-w-[78%] overflow-hidden rounded-md border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm leading-6 break-words text-zinc-800",
  steering:
    "max-w-[78%] overflow-hidden rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 break-words text-blue-950",
} satisfies Record<MessageDelivery, string>;

type SubmitApproval = ChatTranscriptProps["submitApproval"];

export function ChatTranscript({
  activeRun,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messageIds,
  messages,
  messagesById,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId = {},
  runItemOutputs,
  runItemOutputsById,
  runItems,
  runItemsById,
  submitApproval,
  transcript: backendTranscript,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollTopRef = useRef(0);
  const [pinned, setPinned] = useState(true);
  const transcript = useMemo(
    () =>
      transcriptIndexes({
        messageIds,
        messages,
        messagesById,
        runItemIdsByRunId,
        runItemOutputIdsByRunItemId,
        runItemOutputs,
        runItemOutputsById,
        runItems,
        runItemsById,
        transcript: backendTranscript,
      }),
    [
      messageIds,
      messages,
      messagesById,
      runItemIdsByRunId,
      runItemOutputIdsByRunItemId,
      runItemOutputs,
      runItemOutputsById,
      runItems,
      runItemsById,
      backendTranscript,
    ],
  );
  const timeline = useMemo(() => transcriptTimelineItems(transcript), [transcript]);
  const firstItemIndex = timeline[0]?.ordinal ?? 0;

  useEffect(() => {
    if (!pinned) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, [activeRun, pinned, timeline.length, transcript.runItemOutputsById, transcript.runItemsById]);

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
      onWheelCapture={handleWheel}
    >
      <Virtuoso
        atBottomStateChange={(atBottom) => {
          if (atBottom) {
            setPinned(true);
          }
        }}
        className="h-full min-h-0 min-w-0 px-6 py-5"
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
            return <MessageRow message={item.message} />;
          }
          return (
            <TranscriptTurnRow
              loadRunItemOutput={loadRunItemOutput}
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
        className="h-full min-h-0 min-w-0 overflow-y-auto px-6 py-5"
        data-testid="chat-transcript-scroller"
      >
        <div
          className="mx-auto w-full max-w-4xl py-16 text-center text-sm text-zinc-500"
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
    <div className="mb-3 flex justify-center">
      <Button onClick={() => void loadOlder()} variant="secondary">
        <ChevronUp className="h-4 w-4" />
        Older
      </Button>
    </div>
  );
}

type TranscriptFooterProps = { activeRun: Run | null; submitApproval: SubmitApproval };

function TranscriptFooter({ activeRun, submitApproval }: TranscriptFooterProps) {
  if (!activeRun?.hasPendingApproval) {
    return null;
  }
  return (
    <div className="mx-auto w-full max-w-4xl py-2">
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
  if (!activeRun?.hasPendingApproval) {
    return null;
  }
  const approval = requirePendingApproval(activeRun);
  return <ApprovalCard approval={approval} key={approval.id} submitApproval={submitApproval} />;
}

function requirePendingApproval(run: Run): ApprovalRequest {
  if (run.pendingApproval === null) {
    throw new Error(`run ${run.id} hasPendingApproval is true but pendingApproval is null`);
  }
  return run.pendingApproval;
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
  turn,
  loadRunItemOutput,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  turn: TranscriptTurn;
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
      <MessageRow message={turn.triggerMessage} />
      {turn.steeringMessages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {turn.assistantMessage ? (
        <MessageRow
          loadRunItemOutput={loadRunItemOutput}
          message={turn.assistantMessage}
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
  message,
  loadRunItemOutput,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: {
  message: ChatMessage;
  loadRunItemOutput?: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  runItemIdsByRunId?: Record<string, string[]>;
  runItemOutputIdsByRunItemId?: Record<string, string[]>;
  runItemOutputPagesByRunItemId?: Record<string, RunItemOutputPageState>;
  runItemOutputsById?: Record<string, RunItemOutput>;
  runItemsById?: Record<string, RunItem>;
}) {
  const itemRows = activityItemsForMessage(message, runItemIdsByRunId ?? {}, runItemsById ?? {});
  return (
    <div
      className={messageRowClass(message)}
      data-chat-message="true"
      data-message-delivery={message.delivery}
      data-message-id={message.id}
      data-message-role={message.role}
      data-testid={messageRowTestId(message)}
    >
      <div className={messageContainerClass(message)}>
        <MessageContent message={message} />
        <UserDeliveryBadge message={message} />
        <MessageStatus message={message} />
        {itemRows.length > 0 && loadRunItemOutput ? (
          <RunActivityRows
            items={itemRows}
            loadRunItemOutput={loadRunItemOutput}
            outputIdsByRunItemId={runItemOutputIdsByRunItemId ?? {}}
            outputPagesByRunItemId={runItemOutputPagesByRunItemId ?? {}}
            outputsById={runItemOutputsById ?? {}}
          />
        ) : null}
      </div>
    </div>
  );
});

function messageRowClass(message: ChatMessage) {
  return messageRowClassByRole[message.role];
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
  const text = message.parts.map((part) => part.text).join("");
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
  return (
    <div className="mt-2 text-xs font-medium opacity-80">{deliveryLabel(message.delivery)}</div>
  );
}

function MessageStatus({ message }: { message: ChatMessage }) {
  const label = messageStatusLabelByStatus[message.status];
  if (label === null) {
    return null;
  }
  return <div className="mt-3 text-xs font-medium text-red-600">{label}</div>;
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
      className="min-w-0 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm break-words text-amber-950"
      data-testid="approval-card"
    >
      <div className="font-semibold">{approval.title}</div>
      {approval.body ? <div className="mt-1 text-amber-900">{approval.body}</div> : null}
      {approval.command ? (
        <pre className="mt-3 max-w-full overflow-x-auto rounded border border-amber-200 bg-white p-2 text-xs">
          {approval.command}
        </pre>
      ) : null}
      {approval.filePath ? (
        <div className="mt-2 break-all font-mono text-xs">{approval.filePath}</div>
      ) : null}
      {approval.permission ? (
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded border border-amber-200 bg-white p-2 text-xs">
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
          <div className="mt-3 font-medium text-red-700">
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
        onClick={() => void submitApproval(approvalId, true, "", [], false)}
        variant="primary"
      >
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button
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
      <div className="mt-3 font-medium text-red-700">Approval request is missing questions.</div>
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
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
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
          disabled={!complete}
          onClick={() => void submitApproval(answers, false)}
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Answer
        </Button>
        <Button onClick={() => void submitApproval([], true)} type="button" variant="secondary">
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
