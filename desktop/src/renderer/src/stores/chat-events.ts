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
  if (event.type === "codex.account.changed") {
    return unchangedEventResult();
  }
  return applyConversationOrWorkspaceEvent(state, event);
}

function applyConversationOrWorkspaceEvent(
  state: ChatStore,
  event: Exclude<OtherChatEvent, { type: "codex.account.changed" }>,
): EventApplyResult {
  switch (event.type) {
    case "chat.message.removed":
      return applyMessageRemovedEvent(state, event);
    case "chat.assistant_text_delta":
      return applyAssistantTextDelta(state, event);
    case "chat.run.updated":
      return selectedConversationEventResult(
        state,
        event,
        {
          activeRun: activeRunFromRunEvent(state.activeRun, event.payload.run),
          status: "ready",
          transcript: updateTranscriptRun(state.transcript, event.payload.run),
        },
        false,
        true,
      );
    case "chat.run_item_output.delta":
      return selectedConversationEventResult(state, event, {
        runItemOutputs: upsertRunItemOutput(state.runItemOutputs, event.payload.output),
        status: "ready",
      });
    case "chat.queue.updated": {
      const queuedTranscript = mergeQueueTranscript(
        state.transcript,
        event.payload.queue.runs,
        event.payload.queue.messages,
      );
      return selectedConversationEventResult(
        state,
        event,
        {
          messages: mergeQueueMessages(state.messages, event.payload.queue.messages),
          queuedRuns: queuedRunsFromQueue(event.payload.queue.runs),
          status: "ready",
          transcript: queuedTranscript.transcript,
        },
        queuedTranscript.resync,
        true,
      );
    }
    case "chat.goal.updated":
      return selectedConversationEventResult(state, event, {
        goal: event.payload.goal,
        status: "ready",
      });
    case "chat.conversation.updated":
      return {
        patch: conversationUpdatedPatch(state, event.workspaceId, event.payload.item),
        resync: false,
      };
    case "diagnostic.created":
      return { patch: diagnosticCreatedPatch(state, event), resync: false };
    default:
      return assertNever(event);
  }
}

function applyMessageRemovedEvent(
  state: ChatStore,
  event: Extract<OtherChatEvent, { type: "chat.message.removed" }>,
) {
  return selectedConversationEventResult(
    state,
    event,
    {
      editingQueuedMessageId: clearedMessageOperationID(
        state.editingQueuedMessageId,
        event.payload.messageId,
      ),
      messages: removeMessage(state.messages, event.payload.messageId),
      removingQueuedMessageId: clearedMessageOperationID(
        state.removingQueuedMessageId,
        event.payload.messageId,
      ),
      status: "ready",
      transcript: removeTranscriptMessage(state.transcript, event.payload.messageId),
    },
    false,
    true,
  );
}

function isMessageUpsertEvent(event: AppliedChatEvent): event is MessageUpsertEvent {
  return messageUpsertEventTypes.has(event.type);
}

function isRunItemUpsertEvent(event: AppliedChatEvent): event is RunItemUpsertEvent {
  return runItemUpsertEventTypes.has(event.type);
}

function applyMessageUpsertEvent(state: ChatStore, event: MessageUpsertEvent): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unselectedConversationEventResult(state, event, true);
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
  resyncUnselected = false,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unselectedConversationEventResult(state, event, resyncUnselected);
  }
  return { patch, resync };
}

function unselectedConversationEventResult(
  state: ChatStore,
  event: ChatEvent,
  resync: boolean,
): EventApplyResult {
  if (!resync || !isActiveWorkspaceConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  return { patch: {}, resync: true };
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

function conversationUpdatedPatch(
  state: ChatStore,
  workspaceId: string,
  item: ConversationListItem,
): ChatPatch {
  const patch: ChatPatch = {};
  const summary = state.conversationListsByWorkspaceId[workspaceId];
  if (summary) {
    patch.conversationListsByWorkspaceId = {
      ...state.conversationListsByWorkspaceId,
      [workspaceId]: {
        ...summary,
        conversations: applyConversationListItem(summary.conversations, item),
      },
    };
  }
  if (state.workspaceId !== workspaceId) {
    return patch;
  }
  const selectedConversationArchived =
    state.selectedConversation?.id === item.conversation.id && item.conversation.archivedAt !== "";
  Object.assign(patch, {
    conversations: applyConversationListItem(state.conversations, item),
    selectedConversation:
      state.selectedConversation?.id === item.conversation.id
        ? selectedConversationForUpdatedItem(state.selectedConversation, item)
        : state.selectedConversation,
  });
  if (selectedConversationArchived) {
    Object.assign(patch, emptySelectedConversationPatch());
  }
  return patch;
}

function selectedConversationForUpdatedItem(
  selectedConversation: ChatStore["selectedConversation"],
  item: ConversationListItem,
) {
  if (item.conversation.archivedAt !== "") {
    return null;
  }
  return selectedConversation?.id === item.conversation.id
    ? item.conversation
    : selectedConversation;
}

function emptySelectedConversationPatch(): ChatPatch {
  return {
    activeRun: null,
    hasMoreOlder: false,
    messageIds: [],
    messages: [],
    messagesById: {},
    olderBeforeOrdinal: 0,
    queuedRuns: [],
    runItemIdsByRunId: {},
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItemOutputsById: {},
    runItems: [],
    runItemsById: {},
    selectedConversation: null,
    transcript: [],
  };
}

function diagnosticCreatedPatch(
  state: ChatStore,
  event: Extract<OtherChatEvent, { type: "diagnostic.created" }>,
): ChatPatch {
  const patch: ChatPatch = {};
  const summary = state.conversationListsByWorkspaceId[event.workspaceId];
  if (summary) {
    patch.conversationListsByWorkspaceId = {
      ...state.conversationListsByWorkspaceId,
      [event.workspaceId]: {
        ...summary,
        diagnostics: upsertDiagnostic(summary.diagnostics, event.payload.diagnostic),
      },
    };
  }
  if (state.workspaceId === event.workspaceId) {
    Object.assign(patch, {
      diagnostics: upsertDiagnostic(state.diagnostics, event.payload.diagnostic),
      status: "ready",
    });
  }
  return patch;
}

function isSelectedConversationEvent(state: ChatStore, event: ChatEvent) {
  return (
    state.workspaceId === event.workspaceId &&
    state.selectedConversation?.id === event.conversationId
  );
}

function isActiveWorkspaceConversationEvent(state: ChatStore, event: ChatEvent) {
  return state.workspaceId === event.workspaceId && event.conversationId !== "";
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

function mergeQueueTranscript(
  transcript: TranscriptTurn[],
  runs: Run[],
  messages: ChatMessage[],
): { resync: boolean; transcript: TranscriptTurn[] } {
  const queuedRuns = queuedRunsFromQueue(runs);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const queuedTurnsByRunId = new Map<string, TranscriptTurn>();
  for (const run of queuedRuns) {
    const triggerMessage = messagesById.get(run.triggerMessageId);
    if (!triggerMessage) {
      return { resync: true, transcript };
    }
    queuedTurnsByRunId.set(run.id, {
      assistantMessage: null,
      run,
      steeringMessages: [],
      triggerMessage,
    });
  }

  const merged: TranscriptTurn[] = [];
  for (const turn of transcript) {
    const queuedTurn = queuedTurnsByRunId.get(turn.run.id);
    if (queuedTurn) {
      merged.push(queuedTurn);
      queuedTurnsByRunId.delete(turn.run.id);
      continue;
    }
    if (turn.run.status === "queued") {
      continue;
    }
    merged.push(turn);
  }
  merged.push(...queuedTurnsByRunId.values());
  return { resync: false, transcript: merged.toSorted(compareTranscriptTurns) };
}

function compareTranscriptTurns(left: TranscriptTurn, right: TranscriptTurn) {
  if (left.triggerMessage.ordinal === right.triggerMessage.ordinal) {
    return left.run.id.localeCompare(right.run.id);
  }
  return left.triggerMessage.ordinal - right.triggerMessage.ordinal;
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
        : attachedAssistantMessage(turn);
    const steeringMessages = turn.steeringMessages.map((steeringMessage) =>
      steeringMessage.id === message.id ? markUpdatedMessage(message) : steeringMessage,
    );
    return {
      ...turn,
      assistantMessage,
      steeringMessages: attachedSteeringMessages(turn, steeringMessages),
      triggerMessage,
    };
  });
  return { transcript: next, updated };

  function markUpdatedMessage(nextMessage: ChatMessage) {
    updated = true;
    return nextMessage;
  }

  function attachedAssistantMessage(turn: TranscriptTurn) {
    if (turn.assistantMessage || turn.run.id !== message.runId || message.role !== "assistant") {
      return turn.assistantMessage;
    }
    return markUpdatedMessage(message);
  }

  function attachedSteeringMessages(
    turn: TranscriptTurn,
    steeringMessages: ChatMessage[],
  ): ChatMessage[] {
    if (
      turn.run.id !== message.runId ||
      message.delivery !== "steering" ||
      steeringMessages.some((steeringMessage) => steeringMessage.id === message.id)
    ) {
      return steeringMessages;
    }
    return [...steeringMessages, markUpdatedMessage(message)].toSorted(compareMessages);
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
  return next.toSorted(compareMessages);
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  if (left.ordinal === right.ordinal) {
    return left.id.localeCompare(right.id);
  }
  return left.ordinal - right.ordinal;
}

function removeMessage(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.filter((message) => message.id !== messageId);
}

function clearedMessageOperationID(currentID: string | null, removedMessageID: string) {
  return currentID === removedMessageID ? null : currentID;
}

function mergeQueueMessages(messages: ChatMessage[], queuedMessages: ChatMessage[]): ChatMessage[] {
  const queuedMessageIds = new Set(queuedMessages.map((message) => message.id));
  const retainedMessages = messages.filter(
    (message) => message.delivery !== "queued" || queuedMessageIds.has(message.id),
  );
  return queuedMessages.reduce(upsertMessage, retainedMessages);
}

function removeTranscriptMessage(
  transcript: TranscriptTurn[],
  messageId: string,
): TranscriptTurn[] {
  return transcript
    .filter((turn) => turn.triggerMessage.id !== messageId)
    .map((turn) => ({
      ...turn,
      assistantMessage: turn.assistantMessage?.id === messageId ? null : turn.assistantMessage,
      steeringMessages: turn.steeringMessages.filter((message) => message.id !== messageId),
    }));
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

function applyConversationListItem(
  conversations: ConversationListItem[],
  item: ConversationListItem,
): ConversationListItem[] {
  if (item.conversation.archivedAt !== "") {
    return conversations.filter((current) => current.conversation.id !== item.conversation.id);
  }
  return upsertConversation(conversations, item);
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
  if (left.pinnedAt !== "" || right.pinnedAt !== "") {
    if (left.pinnedAt === right.pinnedAt) {
      if (left.conversation.updatedAt === right.conversation.updatedAt) {
        return left.conversation.id.localeCompare(right.conversation.id);
      }
      return right.conversation.updatedAt.localeCompare(left.conversation.updatedAt);
    }
    if (left.pinnedAt === "") {
      return 1;
    }
    if (right.pinnedAt === "") {
      return -1;
    }
    return right.pinnedAt.localeCompare(left.pinnedAt);
  }
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
