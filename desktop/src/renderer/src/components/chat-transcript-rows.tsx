import type {
  ChatMessage,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import { memo, useEffect, useState } from "react";

import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import { BrailleSpinner } from "./ascii-spinner";
import {
  chatReadableColumnAttributes,
  chatReadableColumnClass,
  chatReadableColumnPaddedClass,
} from "./chat-layout";
import { MessageActions, MessageTimestamp } from "./chat-message-actions";
import { chatMessageText } from "./chat-message-text";
import { RunActivityRows } from "./chat-run-activity";
import { isVisibleMessage, type TranscriptAssistantMessageChunk } from "./chat-transcript-timeline";
import { messageRunActivityPropsEqual } from "./chat-transcript-render-memo";
import {
  canSaveQueuedEdit,
  isPendingSteeringMessage,
  isQueuedEditableMessage,
  MessageRowActions,
  QueuedMessageEditor,
  type TranscriptRowActions,
} from "./chat-transcript-row-actions";
import { MarkdownText } from "./markdown-text";

const messageRowClassByRole = {
  assistant: `${chatReadableColumnPaddedClass} flex justify-start py-1.5`,
  command: `${chatReadableColumnPaddedClass} flex justify-start py-1.5`,
  developer: `${chatReadableColumnPaddedClass} flex justify-start py-1.5`,
  system: `${chatReadableColumnPaddedClass} flex justify-start py-1.5`,
  tool: `${chatReadableColumnPaddedClass} flex justify-start py-1.5`,
  user: `${chatReadableColumnPaddedClass} flex justify-end py-1.5`,
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
    "min-w-0 max-w-full overflow-hidden border-l border-accent-green/40 pl-3 text-[13px] leading-5 break-words text-foreground",
  developer: assistantMessageContainerClass,
  system: assistantMessageContainerClass,
  tool: "min-w-0 max-w-full overflow-hidden rounded-r-sm border-l border-accent-cyan/40 bg-accent-cyan/10 px-3 py-2 font-mono text-[12px] leading-5 break-words text-foreground [overflow-wrap:anywhere]",
} satisfies Record<Exclude<MessageRole, "user">, string>;

const userMessageContainerClassByDelivery = {
  goal: "max-w-full overflow-hidden rounded-sm border border-accent-green/40 bg-accent-green/10 px-3 py-2 text-[13px] leading-5 break-words text-foreground",
  normal:
    "max-w-full overflow-hidden rounded-sm bg-muted px-3 py-2 text-[13px] leading-5 break-words text-foreground",
  queued:
    "max-w-full overflow-hidden rounded-sm border border-dashed border-border bg-background px-3 py-2 text-[13px] leading-5 break-words text-muted-foreground",
  steering:
    "max-w-full overflow-hidden rounded-sm border border-accent-blue/40 bg-accent-blue/10 px-3 py-2 text-[13px] leading-5 break-words text-foreground",
} satisfies Record<MessageDelivery, string>;

type LoadRunItemOutput = (
  runId: string,
  runItemId: string,
  afterOrdinal?: number,
  limit?: number,
) => Promise<void>;

interface TranscriptRowDataProps {
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}

export interface TranscriptTurnRowProps extends TranscriptRowDataProps {
  activeSearchMessageId: string | null;
  turn: TranscriptTurn;
  loadRunItemOutput: LoadRunItemOutput;
  rowActions: TranscriptRowActions;
  timestampMessageIds: Set<string>;
}

export const TranscriptTurnRow = memo(function TranscriptTurnRow({
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
}: TranscriptTurnRowProps) {
  return (
    <div
      {...chatReadableColumnAttributes}
      className={chatReadableColumnClass}
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
}, transcriptTurnRowPropsEqual);

export interface MessageRowProps extends TranscriptRowDataProps {
  activeSearchMessageId: string | null;
  message: ChatMessage;
  loadRunItemOutput: LoadRunItemOutput;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}

export const MessageRow = memo(function MessageRow({
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
}: MessageRowProps) {
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
      {...chatReadableColumnAttributes}
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
}, messageRowPropsEqual);

export interface AssistantMessageChunkRowProps extends TranscriptRowDataProps {
  activeSearchMessageId: string | null;
  chunk: TranscriptAssistantMessageChunk;
  message: ChatMessage;
  loadRunItemOutput: LoadRunItemOutput;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}

export const AssistantMessageChunkRow = memo(function AssistantMessageChunkRow({
  activeSearchMessageId,
  chunk,
  message,
  loadRunItemOutput,
  showTimestamp,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
}: AssistantMessageChunkRowProps) {
  const itemRows = chunk.isLast
    ? activityItemsForMessage(message, runItemIdsByRunId, runItemsById)
    : [];
  const fullText = chunk.isLast ? chatMessageText(message) : "";
  const activityRows =
    chunk.isLast && itemRows.length > 0 ? (
      <RunActivityRows
        items={itemRows}
        loadRunItemOutput={loadRunItemOutput}
        outputIdsByRunItemId={runItemOutputIdsByRunItemId}
        outputPagesByRunItemId={runItemOutputPagesByRunItemId}
        outputsById={runItemOutputsById}
      />
    ) : null;

  return (
    <div
      {...chatReadableColumnAttributes}
      className={assistantMessageChunkRowClass(message.id === activeSearchMessageId, chunk)}
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
            <AssistantMessageContent status={message.status} text={chunk.text} />
            {chunk.isLast ? <MessageStatus message={message} /> : null}
          </div>
          {chunk.isLast ? (
            <MessageActions showRetry={canRetryByForking(message)} text={fullText} />
          ) : null}
        </div>
        {activityRows}
        {showTimestamp ? <MessageTimestamp message={message} /> : null}
      </div>
    </div>
  );
}, assistantMessageChunkRowPropsEqual);

function transcriptTurnRowPropsEqual(
  previous: TranscriptTurnRowProps,
  next: TranscriptTurnRowProps,
) {
  return (
    previous.activeSearchMessageId === next.activeSearchMessageId &&
    previous.loadRunItemOutput === next.loadRunItemOutput &&
    previous.rowActions === next.rowActions &&
    previous.timestampMessageIds === next.timestampMessageIds &&
    previous.turn === next.turn &&
    messageRunActivityPropsEqual(previous, next, previous.turn.triggerMessage) &&
    (previous.turn.assistantMessage
      ? messageRunActivityPropsEqual(previous, next, previous.turn.assistantMessage)
      : next.turn.assistantMessage === null)
  );
}

function messageRowPropsEqual(previous: MessageRowProps, next: MessageRowProps) {
  return (
    previous.activeSearchMessageId === next.activeSearchMessageId &&
    previous.loadRunItemOutput === next.loadRunItemOutput &&
    previous.message === next.message &&
    previous.rowActions === next.rowActions &&
    previous.showTimestamp === next.showTimestamp &&
    messageRunActivityPropsEqual(previous, next, previous.message)
  );
}

function assistantMessageChunkRowPropsEqual(
  previous: AssistantMessageChunkRowProps,
  next: AssistantMessageChunkRowProps,
) {
  if (!assistantChunkIdentityPropsEqual(previous, next)) {
    return false;
  }
  if (!previous.chunk.isLast) {
    return true;
  }
  return assistantChunkFinalPropsEqual(previous, next);
}

function assistantChunkIdentityPropsEqual(
  previous: AssistantMessageChunkRowProps,
  next: AssistantMessageChunkRowProps,
) {
  return (
    previous.activeSearchMessageId === next.activeSearchMessageId &&
    previous.loadRunItemOutput === next.loadRunItemOutput &&
    previous.message.id === next.message.id &&
    previous.rowActions === next.rowActions &&
    previous.showTimestamp === next.showTimestamp &&
    assistantChunkValuePropsEqual(previous.chunk, next.chunk) &&
    assistantChunkMessagePropsEqual(previous.message, next.message)
  );
}

function assistantChunkValuePropsEqual(
  previous: TranscriptAssistantMessageChunk,
  next: TranscriptAssistantMessageChunk,
) {
  return (
    previous.isFirst === next.isFirst &&
    previous.isLast === next.isLast &&
    previous.text === next.text
  );
}

function assistantChunkMessagePropsEqual(previous: ChatMessage, next: ChatMessage) {
  return previous.role === next.role && previous.delivery === next.delivery;
}

function assistantChunkFinalPropsEqual(
  previous: AssistantMessageChunkRowProps,
  next: AssistantMessageChunkRowProps,
) {
  return (
    previous.message === next.message &&
    messageRunActivityPropsEqual(previous, next, previous.message)
  );
}

function messageRowClass(message: ChatMessage, activeSearchMatch: boolean) {
  return cn(
    messageRowClassByRole[message.role],
    activeSearchMatch && "rounded-sm bg-accent-blue/5 ring-1 ring-accent-blue/50",
  );
}

function assistantMessageChunkRowClass(
  activeSearchMatch: boolean,
  chunk: TranscriptAssistantMessageChunk,
) {
  return cn(
    chatReadableColumnPaddedClass,
    "flex justify-start",
    chunk.isFirst ? "pt-1.5" : "pt-0.5",
    chunk.isLast ? "pb-1.5" : "pb-0.5",
    activeSearchMatch && "rounded-sm bg-accent-blue/5 ring-1 ring-accent-blue/50",
  );
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
    case "command":
      return <PlainMessageText text={text} />;
    case "tool":
      return <ToolMessageContent status={message.status} text={text} />;
    case "assistant":
    case "developer":
    case "system":
      return <AssistantMessageContent status={message.status} text={text} />;
    default:
      return assertNever(message.role);
  }
}

function PlainMessageText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap">{text}</div>;
}

function ToolMessageContent({ status, text }: { status: MessageStatus; text: string }) {
  if (text === "" && status === "streaming") {
    return (
      <div className="flex h-5 items-center">
        <BrailleSpinner label="Tool output is streaming" />
      </div>
    );
  }
  return <pre className="whitespace-pre-wrap font-mono">{text}</pre>;
}

function AssistantMessageContent({ status, text }: { status: MessageStatus; text: string }) {
  if (text === "" && status === "streaming") {
    return (
      <div className="flex h-5 items-center">
        <BrailleSpinner label="Assistant is thinking" />
      </div>
    );
  }
  return <MarkdownText text={assistantMessageText(text, status)} />;
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
