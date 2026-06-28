import type {
  ChatMessage,
  ImagePart,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";
import { X } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { cn } from "../lib/utils";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import { MessageActions, MessageTimestamp } from "./chat-message-actions";
import { chatMessageText } from "./chat-message-text";
import { chatInputFromMessageEdit } from "../lib/chat-input";
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

// A user_message transcript block renders its projected message. The block is the
// source of truth, so the message rendered here is derived from the block, never
// read back from the message store.
export function UserMessageBlock({
  activeSearchId,
  block,
  rowActions,
  showTimestamp,
}: {
  activeSearchId: string | null;
  block: TranscriptBlock;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}) {
  const message = chatMessageFromBlock(block);
  if (!message) {
    return null;
  }
  return (
    <MessageRow
      activeSearchId={activeSearchId}
      blockKind="user_message"
      message={message}
      rowActions={rowActions}
      showTimestamp={showTimestamp}
    />
  );
}

// An assistant_text transcript block renders one contiguous assistant segment.
export function AssistantTextBlock({
  activeSearchId,
  block,
  rowActions,
  showTimestamp,
}: {
  activeSearchId: string | null;
  block: TranscriptBlock;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}) {
  const message = assistantMessageFromBlock(block);
  return (
    <MessageRow
      activeSearchId={activeSearchId}
      blockKind="assistant_text"
      message={message}
      rowActions={rowActions}
      showTimestamp={showTimestamp}
    />
  );
}

// Queued messages are not transcript blocks; they wait at the tail keyed by the
// queue state. They reuse the message row so queued styling, edit, and remove
// controls match user blocks.
export function QueuedMessageRow({
  message,
  rowActions,
}: {
  message: ChatMessage;
  rowActions: TranscriptRowActions;
}) {
  return (
    <MessageRow activeSearchId={null} message={message} rowActions={rowActions} showTimestamp />
  );
}

// Standalone messages do not belong to a run (command results, system notices).
// They are not transcript blocks but render inline by conversation order through
// the same message row.
export function StandaloneMessageRow({
  activeSearchId,
  message,
  rowActions,
  showTimestamp,
}: {
  activeSearchId: string | null;
  message: ChatMessage;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}) {
  return (
    <MessageRow
      activeSearchId={activeSearchId}
      message={message}
      rowActions={rowActions}
      showTimestamp={showTimestamp}
    />
  );
}

interface MessageRowProps {
  activeSearchId: string | null;
  // Set only for real transcript blocks (user_message/assistant_text). Queued and
  // standalone rows are not blocks and pass undefined, so they carry message
  // metadata but no data-transcript-block/data-block-kind tagging.
  blockKind?: "user_message" | "assistant_text";
  message: ChatMessage;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}

const MessageRow = memo(function MessageRow({
  activeSearchId,
  blockKind,
  message,
  rowActions,
  showTimestamp,
}: MessageRowProps) {
  const text = chatMessageText(message);
  const [editMode, setEditMode] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(text);
  const queuedEditable = isQueuedEditableMessage(message);
  const pendingSteering = isPendingSteeringMessage(message, rowActions.activeRun);
  const rowBusy = messageRowBusy(message, rowActions);
  const activeSearchMatch = message.id === activeSearchId;

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
    await rowActions.editQueuedMessage(message.id, chatInputFromMessageEdit(message, draft.trim()));
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
      {...chatReadableColumnAttributes}
      className={messageRowClass(message, activeSearchMatch)}
      data-block-kind={blockKind}
      data-chat-message="true"
      data-message-delivery={message.delivery}
      data-message-id={message.id}
      data-message-role={message.role}
      data-run-id={message.runId}
      data-search-active={activeSearchMatch ? "true" : "false"}
      data-testid={messageRowTestId(message)}
      data-transcript-block={blockKind ? "true" : undefined}
    >
      <div className={messageShellClass(message)}>
        <div className={messageActionRowClass(message)}>
          <div
            className={messageContainerClass(message)}
            data-testid={messageContentTestId(message)}
          >
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
          </div>
          {editMode ? null : <MessageActions showRetry={canRetryByForking(message)} text={text} />}
        </div>
        {showTimestamp ? <MessageTimestamp createdAt={message.createdAt} /> : null}
      </div>
    </div>
  );
}, messageRowPropsEqual);

function messageRowPropsEqual(previous: MessageRowProps, next: MessageRowProps) {
  return (
    previous.blockKind === next.blockKind &&
    previous.message === next.message &&
    previous.rowActions === next.rowActions &&
    previous.showTimestamp === next.showTimestamp &&
    (previous.message.id === previous.activeSearchId) === (next.message.id === next.activeSearchId)
  );
}

const transcriptBlockMessageStatusByBlockStatus = {
  streaming: "streaming",
  complete: "complete",
  cancelled: "cancelled",
  failed: "error",
} satisfies Record<TranscriptBlockStatus, MessageStatus>;

function chatMessageFromBlock(block: TranscriptBlock): ChatMessage | null {
  const projection = block.userMessage;
  if (!projection) {
    return null;
  }
  return {
    conversationId: block.conversationId,
    createdAt: block.createdAt,
    delivery: projection.delivery,
    id: projection.messageId,
    ordinal: block.ordinal,
    parts: projection.parts,
    role: projection.role,
    runId: block.runId,
    schemaVersion: block.schemaVersion,
    status: projection.status,
    updatedAt: block.updatedAt,
  };
}

function assistantMessageFromBlock(block: TranscriptBlock): ChatMessage {
  const text = block.assistantText?.text ?? "";
  const format = block.assistantText?.format ?? "markdown";
  return {
    conversationId: block.conversationId,
    createdAt: block.createdAt,
    delivery: "normal",
    id: block.id,
    ordinal: block.ordinal,
    parts: [
      {
        id: `${block.id}_part`,
        image: null,
        text: { format, text },
        type: "text",
      },
    ],
    role: "assistant",
    runId: block.runId,
    schemaVersion: block.schemaVersion,
    status: transcriptBlockMessageStatusByBlockStatus[block.status],
    updatedAt: block.updatedAt,
  };
}

function messageRowClass(message: ChatMessage, activeSearchMatch: boolean) {
  return cn(
    messageRowClassByRole[message.role],
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
      return <PlainMessageContent message={message} />;
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

function PlainMessageContent({ message }: { message: ChatMessage }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {message.parts.map((part) => {
        if (part.type === "text" && part.text) {
          return (
            <div className="whitespace-pre-wrap" key={part.id}>
              {part.text.text}
            </div>
          );
        }
        if (part.type === "image" && part.image) {
          return <MessageImage image={part.image} key={part.id} />;
        }
        return null;
      })}
    </div>
  );
}

function MessageImage({ image }: { image: ImagePart }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const aspectRatio =
    image.width > 0 && image.height > 0 ? `${image.width} / ${image.height}` : "1 / 1";
  return (
    <>
      <button
        aria-label={`Preview ${image.fileName}`}
        className="group/image grid max-h-48 max-w-48 min-w-0 overflow-hidden rounded-sm border border-border bg-background/60 text-left outline-none hover:border-ring focus-visible:border-ring"
        onClick={() => setPreviewOpen(true)}
        style={{ aspectRatio }}
        title={image.fileName}
        type="button"
      >
        <img
          alt={image.fileName}
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          src={image.thumbnailUrl}
        />
      </button>
      {previewOpen ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close image preview"
              className="absolute top-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-sm bg-background/80 text-foreground shadow-sm outline-none hover:bg-accent focus-visible:bg-accent"
              onClick={() => setPreviewOpen(false)}
              title="Close image preview"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              alt={image.fileName}
              className="max-h-[86vh] max-w-[92vw] rounded-sm object-contain shadow-xl"
              decoding="async"
              src={image.previewUrl}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ToolMessageContent({ status, text }: { status: MessageStatus; text: string }) {
  if (text === "" && status === "streaming") {
    return (
      <div className="flex h-5 items-center">
        <BrailleSpinner label="Tool output is streaming" />
      </div>
    );
  }
  return <pre className="font-mono whitespace-pre-wrap">{text}</pre>;
}

function AssistantMessageContent({ status, text }: { status: MessageStatus; text: string }) {
  if (text === "" && status === "streaming") {
    return (
      <div className="flex h-5 items-center">
        <BrailleSpinner label="Assistant is thinking" />
      </div>
    );
  }
  return <MarkdownText text={text} />;
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
