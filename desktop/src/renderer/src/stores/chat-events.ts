import type {
  ChatEvent,
  ChatMessage,
  ConversationListItem,
  Diagnostic,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";

import type { ChatPatch, ChatStore } from "./chat-store";

type RunningRun = Run & { status: "running" };
type QueuedRun = Run & { status: "queued" };

interface EventApplyResult {
  patch: ChatPatch;
  resync: boolean;
}

type AppliedChatEvent = Exclude<ChatEvent, { type: "chat.resync_required" }>;
type MessageUpsertEvent = Extract<
  AppliedChatEvent,
  {
    type:
      | "chat.message.created"
      | "chat.message.queued"
      | "chat.message.steering_sent"
      | "chat.message.updated";
  }
>;
type RunItemUpsertEvent = Extract<
  AppliedChatEvent,
  { type: "chat.run_item.created" | "chat.run_item.updated" }
>;
type OtherChatEvent = Exclude<AppliedChatEvent, MessageUpsertEvent | RunItemUpsertEvent>;

const messageUpsertEventTypes = new Set([
  "chat.message.created",
  "chat.message.queued",
  "chat.message.steering_sent",
  "chat.message.updated",
]);

const runItemUpsertEventTypes = new Set(["chat.run_item.created", "chat.run_item.updated"]);

export function applyChatEvent(state: ChatStore, event: AppliedChatEvent): EventApplyResult {
  if (isMessageUpsertEvent(event)) {
    return applyMessageUpsertEvent(state, event);
  }
  if (isRunItemUpsertEvent(event)) {
    return applyRunItemUpsertEvent(state, event);
  }
  return applyOtherChatEvent(state, event);
}

function applyOtherChatEvent(state: ChatStore, event: OtherChatEvent): EventApplyResult {
  if (event.type === "chat.assistant_text_delta") {
    return applyAssistantTextDelta(state, event);
  }
  if (event.type === "chat.run.updated") {
    return selectedConversationEventResult(state, event, {
      activeRun: activeRunFromRunEvent(state.activeRun, event.payload.run),
      status: "ready",
      transcript: updateTranscriptRun(state.transcript, event.payload.run),
    });
  }
  if (event.type === "chat.run_item_output.delta") {
    return selectedConversationEventResult(state, event, {
      runItemOutputs: upsertRunItemOutput(state.runItemOutputs, event.payload.output),
      status: "ready",
    });
  }
  if (event.type === "chat.queue.updated") {
    return selectedConversationEventResult(
      state,
      event,
      {
        messages: mergeQueueMessages(state.messages, event.payload.queue.messages),
        queuedRuns: queuedRunsFromQueue(event.payload.queue.runs),
        status: "ready",
      },
      true,
    );
  }
  if (event.type === "chat.goal.updated") {
    return selectedConversationEventResult(state, event, {
      goal: event.payload.goal,
      status: "ready",
    });
  }
  if (event.type === "chat.conversation.updated") {
    return workspaceEventResult(state, event, conversationUpdatedPatch(state, event.payload.item));
  }
  if (event.type === "diagnostic.created") {
    return workspaceEventResult(state, event, {
      diagnostics: upsertDiagnostic(state.diagnostics, event.payload.diagnostic),
      status: "ready",
    });
  }
  if (event.type === "codex.account.changed") {
    return unchangedEventResult();
  }
  return assertNever(event);
}

function isMessageUpsertEvent(event: AppliedChatEvent): event is MessageUpsertEvent {
  return messageUpsertEventTypes.has(event.type);
}

function isRunItemUpsertEvent(event: AppliedChatEvent): event is RunItemUpsertEvent {
  return runItemUpsertEventTypes.has(event.type);
}

function applyMessageUpsertEvent(state: ChatStore, event: MessageUpsertEvent): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  const updated = updateTranscriptMessage(state.transcript, event.payload.message);
  return {
    patch: {
      messages: upsertMessage(state.messages, event.payload.message),
      status: "ready",
      transcript: updated.transcript,
    },
    resync: event.payload.message.runId !== "" && !updated.updated,
  };
}

function applyRunItemUpsertEvent(state: ChatStore, event: RunItemUpsertEvent): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    runItems: upsertRunItem(state.runItems, event.payload.item),
    status: "ready",
  });
}

function selectedConversationEventResult(
  state: ChatStore,
  event: ChatEvent,
  patch: ChatPatch,
  resync = false,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  return { patch, resync };
}

function workspaceEventResult(
  state: ChatStore,
  event: ChatEvent,
  patch: ChatPatch,
): EventApplyResult {
  if (state.workspaceId !== event.workspaceId) {
    return unchangedEventResult();
  }
  return { patch, resync: false };
}

function applyAssistantTextDelta(
  state: ChatStore,
  event: Extract<ChatEvent, { type: "chat.assistant_text_delta" }>,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  let foundMessage = false;
  let foundPart = false;
  const messages = state.messages.map((message) => {
    if (message.id !== event.payload.messageId) {
      return message;
    }
    foundMessage = true;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.id !== event.payload.partId) {
          return part;
        }
        foundPart = true;
        return { ...part, text: part.text + event.payload.delta };
      }),
      updatedAt: event.payload.updatedAt,
    };
  });
  if (!foundMessage || !foundPart) {
    return { patch: {}, resync: true };
  }
  const updated = updateTranscriptMessageText(
    state.transcript,
    event.payload.messageId,
    event.payload.partId,
    event.payload.delta,
    event.payload.updatedAt,
  );
  return {
    patch: { messages, status: "ready", transcript: updated.transcript },
    resync: !updated.updated,
  };
}

function conversationUpdatedPatch(state: ChatStore, item: ConversationListItem): ChatPatch {
  const selectedConversation =
    state.selectedConversation?.id === item.conversation.id
      ? item.conversation
      : state.selectedConversation;
  return {
    conversations: upsertConversation(state.conversations, item),
    selectedConversation,
  };
}

function isSelectedConversationEvent(state: ChatStore, event: ChatEvent) {
  return (
    state.workspaceId === event.workspaceId &&
    state.selectedConversation?.id === event.conversationId
  );
}

function activeRunFromRunEvent(current: RunningRun | null, run: Run): RunningRun | null {
  if (run.status === "running") {
    return run as RunningRun;
  }
  if (current?.id === run.id) {
    return null;
  }
  return current;
}

function queuedRunsFromQueue(runs: Run[]): QueuedRun[] {
  return runs.filter((run): run is QueuedRun => run.status === "queued");
}

function updateTranscriptRun(transcript: TranscriptTurn[], run: Run): TranscriptTurn[] {
  return transcript.map((turn) => (turn.run.id === run.id ? { ...turn, run } : turn));
}

function updateTranscriptMessage(transcript: TranscriptTurn[], message: ChatMessage) {
  let updated = false;
  const next = transcript.map((turn) => {
    const triggerMessage =
      turn.triggerMessage.id === message.id ? markUpdatedMessage(message) : turn.triggerMessage;
    const assistantMessage =
      turn.assistantMessage?.id === message.id
        ? markUpdatedMessage(message)
        : turn.assistantMessage;
    const steeringMessages = turn.steeringMessages.map((steeringMessage) =>
      steeringMessage.id === message.id ? markUpdatedMessage(message) : steeringMessage,
    );
    return {
      ...turn,
      assistantMessage,
      steeringMessages,
      triggerMessage,
    };
  });
  return { transcript: next, updated };

  function markUpdatedMessage(nextMessage: ChatMessage) {
    updated = true;
    return nextMessage;
  }
}

function updateTranscriptMessageText(
  transcript: TranscriptTurn[],
  messageId: string,
  partId: string,
  delta: string,
  updatedAt: string,
) {
  let updated = false;
  const next = transcript.map((turn) => ({
    ...turn,
    assistantMessage: turn.assistantMessage
      ? updateMessageText(turn.assistantMessage)
      : turn.assistantMessage,
    steeringMessages: turn.steeringMessages.map(updateMessageText),
    triggerMessage: updateMessageText(turn.triggerMessage),
  }));
  return { transcript: next, updated };

  function updateMessageText(message: ChatMessage): ChatMessage {
    if (message.id !== messageId) {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.id !== partId) {
          return part;
        }
        updated = true;
        return { ...part, text: part.text + delta };
      }),
      updatedAt,
    };
  }
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id);
  const next = index === -1 ? [...messages, message] : messages.with(index, message);
  return next.toSorted((left, right) => left.ordinal - right.ordinal);
}

function mergeQueueMessages(messages: ChatMessage[], queuedMessages: ChatMessage[]): ChatMessage[] {
  return queuedMessages.reduce(upsertMessage, messages);
}

function upsertRunItem(items: RunItem[], item: RunItem): RunItem[] {
  const index = items.findIndex((current) => current.id === item.id);
  const next = index === -1 ? [...items, item] : items.with(index, item);
  return next.toSorted(compareRunItems);
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function upsertRunItemOutput(outputs: RunItemOutput[], output: RunItemOutput): RunItemOutput[] {
  const index = outputs.findIndex((current) => current.id === output.id);
  const next = index === -1 ? [...outputs, output] : outputs.with(index, output);
  return next.toSorted(compareRunItemOutputs);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

function upsertConversation(
  conversations: ConversationListItem[],
  item: ConversationListItem,
): ConversationListItem[] {
  const index = conversations.findIndex(
    (current) => current.conversation.id === item.conversation.id,
  );
  const next = index === -1 ? [...conversations, item] : conversations.with(index, item);
  return next.toSorted(compareConversationListItems);
}

function upsertDiagnostic(diagnostics: Diagnostic[], diagnostic: Diagnostic): Diagnostic[] {
  const index = diagnostics.findIndex((current) => current.id === diagnostic.id);
  const next = index === -1 ? [...diagnostics, diagnostic] : diagnostics.with(index, diagnostic);
  return next.toSorted(compareDiagnostics).slice(-10);
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic) {
  if (left.occurredAt === right.occurredAt) {
    return left.id.localeCompare(right.id);
  }
  return left.occurredAt.localeCompare(right.occurredAt);
}

function compareConversationListItems(left: ConversationListItem, right: ConversationListItem) {
  if (left.conversation.updatedAt === right.conversation.updatedAt) {
    return left.conversation.id.localeCompare(right.conversation.id);
  }
  return right.conversation.updatedAt.localeCompare(left.conversation.updatedAt);
}

function unchangedEventResult(): EventApplyResult {
  return { patch: {}, resync: false };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled chat event: ${JSON.stringify(value)}`);
}
