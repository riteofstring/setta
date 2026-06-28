import type {
  ChatEvent,
  ChatMessage,
  ConversationListItem,
  Diagnostic,
  Run,
  RunItemOutput,
} from "@generated/backend";

import {
  appendTranscriptBlockText,
  replaceRunTranscriptBlocks,
  upsertTranscriptBlock,
} from "./chat-store-normalization";
import {
  backgroundTerminalOutputDeltaPatch,
  backgroundTerminalsReplacedPatch,
  backgroundTerminalUpsertPatch,
} from "./chat-store-background-terminals";
import type { ChatPatch, ChatStore } from "./chat-store";

type RunningRun = Run & { status: "running" };
type QueuedRun = Run & { status: "queued" };

interface EventApplyResult {
  patch: ChatPatch;
  resync: boolean;
}

type AppliedChatEvent = Exclude<ChatEvent, { type: "chat.resync_required" }>;
type AppliedEventOf<Type extends AppliedChatEvent["type"]> = Extract<
  AppliedChatEvent,
  { type: Type }
>;

type TranscriptBlockEvent = AppliedEventOf<
  | "chat.transcript_block.created"
  | "chat.transcript_block.updated"
  | "chat.transcript_text.delta"
  | "chat.transcript_blocks.replaced"
>;
type MessageEvent = AppliedEventOf<
  | "chat.message.created"
  | "chat.message.queued"
  | "chat.message.steering_sent"
  | "chat.message.updated"
  | "chat.message.removed"
>;
type RunEvent = AppliedEventOf<
  | "chat.run.updated"
  | "chat.run_item.created"
  | "chat.run_item.updated"
  | "chat.run_item_output.delta"
>;
type BackgroundTerminalEvent = AppliedEventOf<
  | "chat.background_terminal.created"
  | "chat.background_terminal.updated"
  | "chat.background_terminal.output_delta"
  | "chat.background_terminals.replaced"
>;
type ConversationEvent = Exclude<
  AppliedChatEvent,
  TranscriptBlockEvent | MessageEvent | RunEvent | BackgroundTerminalEvent
>;
type NoOpConversationEvent = AppliedEventOf<"chat.assistant_text_delta" | "codex.account.changed">;
type StatefulConversationEvent = Exclude<ConversationEvent, NoOpConversationEvent>;

const transcriptBlockEventTypes = new Set<AppliedChatEvent["type"]>([
  "chat.transcript_block.created",
  "chat.transcript_block.updated",
  "chat.transcript_text.delta",
  "chat.transcript_blocks.replaced",
]);
const messageEventTypes = new Set<AppliedChatEvent["type"]>([
  "chat.message.created",
  "chat.message.queued",
  "chat.message.steering_sent",
  "chat.message.updated",
  "chat.message.removed",
]);
const runEventTypes = new Set<AppliedChatEvent["type"]>([
  "chat.run.updated",
  "chat.run_item.created",
  "chat.run_item.updated",
  "chat.run_item_output.delta",
]);
const backgroundTerminalEventTypes = new Set<AppliedChatEvent["type"]>([
  "chat.background_terminal.created",
  "chat.background_terminal.updated",
  "chat.background_terminal.output_delta",
  "chat.background_terminals.replaced",
]);
const noOpConversationEventTypes = new Set<ConversationEvent["type"]>([
  "chat.assistant_text_delta",
  "codex.account.changed",
]);

// The chat store owns the conversation transcript through typed transcript block
// events plus the message, run, queue, and conversation surfaces. The transcript
// is driven only by block events: assistant text streams through
// chat.transcript_text.delta (block-keyed), so chat.assistant_text_delta and the
// raw chat.run_item.created/updated events are no-ops here and are consumed by the
// semantic graph cartographer instead. Run-item OUTPUT chunks still stream through
// chat.run_item_output.delta to back lazy output expansion keyed by source run item
// ID. Events are routed to a dispatcher per surface so each stays exhaustively typed.
export function applyChatEvent(state: ChatStore, event: AppliedChatEvent): EventApplyResult {
  if (isTranscriptBlockEvent(event)) {
    return applyTranscriptBlockEvent(state, event);
  }
  if (isMessageEvent(event)) {
    return applyMessageEvent(state, event);
  }
  if (isRunEvent(event)) {
    return applyRunEvent(state, event);
  }
  if (isBackgroundTerminalEvent(event)) {
    return applyBackgroundTerminalEvent(state, event);
  }
  return applyConversationEvent(state, event);
}

function isTranscriptBlockEvent(event: AppliedChatEvent): event is TranscriptBlockEvent {
  return transcriptBlockEventTypes.has(event.type);
}

function isMessageEvent(event: AppliedChatEvent): event is MessageEvent {
  return messageEventTypes.has(event.type);
}

function isRunEvent(event: AppliedChatEvent): event is RunEvent {
  return runEventTypes.has(event.type);
}

function isBackgroundTerminalEvent(event: AppliedChatEvent): event is BackgroundTerminalEvent {
  return backgroundTerminalEventTypes.has(event.type);
}

function isNoOpConversationEvent(event: ConversationEvent): event is NoOpConversationEvent {
  return noOpConversationEventTypes.has(event.type);
}

function applyTranscriptBlockEvent(
  state: ChatStore,
  event: TranscriptBlockEvent,
): EventApplyResult {
  switch (event.type) {
    case "chat.transcript_block.created":
    case "chat.transcript_block.updated":
      return applyTranscriptBlockUpsertEvent(state, event);
    case "chat.transcript_text.delta":
      return applyTranscriptTextDeltaEvent(state, event);
    case "chat.transcript_blocks.replaced":
      return applyTranscriptBlocksReplacedEvent(state, event);
    default:
      return assertNever(event);
  }
}

function applyMessageEvent(state: ChatStore, event: MessageEvent): EventApplyResult {
  if (event.type === "chat.message.removed") {
    return applyMessageRemovedEvent(state, event);
  }
  return applyMessageUpsertEvent(state, event);
}

function applyRunEvent(state: ChatStore, event: RunEvent): EventApplyResult {
  switch (event.type) {
    case "chat.run.updated":
      return applyRunUpdatedEvent(state, event);
    case "chat.run_item.created":
    case "chat.run_item.updated":
      // Raw run-item created/updated events drive no renderer state: the transcript
      // renders from typed blocks, and run-item OUTPUT chunks stream separately via
      // chat.run_item_output.delta for lazy expansion. The events are still published
      // for the semantic graph cartographer, so the renderer accepts and ignores them.
      return unchangedEventResult();
    case "chat.run_item_output.delta":
      return applyRunItemOutputDeltaEvent(state, event);
    default:
      return assertNever(event);
  }
}

function applyConversationEvent(state: ChatStore, event: ConversationEvent): EventApplyResult {
  if (isNoOpConversationEvent(event)) {
    return unchangedEventResult();
  }
  return applyStatefulConversationEvent(state, event);
}

function applyBackgroundTerminalEvent(
  state: ChatStore,
  event: BackgroundTerminalEvent,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  switch (event.type) {
    case "chat.background_terminal.created":
    case "chat.background_terminal.updated":
      return {
        patch: {
          ...backgroundTerminalUpsertPatch(state, event.payload.process),
          status: "ready",
        },
        resync: false,
      };
    case "chat.background_terminal.output_delta":
      return {
        patch: {
          ...backgroundTerminalOutputDeltaPatch(state, event.payload.output),
          status: "ready",
        },
        resync: false,
      };
    case "chat.background_terminals.replaced":
      return {
        patch: {
          ...backgroundTerminalsReplacedPatch(state, event.conversationId, event.payload.terminals),
          status: "ready",
        },
        resync: false,
      };
    default:
      return assertNever(event);
  }
}

function applyStatefulConversationEvent(
  state: ChatStore,
  event: StatefulConversationEvent,
): EventApplyResult {
  switch (event.type) {
    case "chat.queue.updated":
      return applyQueueUpdatedEvent(state, event);
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

function applyMessageUpsertEvent(
  state: ChatStore,
  event: AppliedEventOf<
    | "chat.message.created"
    | "chat.message.queued"
    | "chat.message.steering_sent"
    | "chat.message.updated"
  >,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unselectedConversationEventResult(state, event, true);
  }
  return {
    patch: {
      messages: upsertMessage(state.messages, event.payload.message),
      status: "ready",
    },
    resync: false,
  };
}

function applyMessageRemovedEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.message.removed">,
): EventApplyResult {
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
    },
    false,
    true,
  );
}

function applyRunUpdatedEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.run.updated">,
): EventApplyResult {
  return selectedConversationEventResult(
    state,
    event,
    {
      activeRun: activeRunFromRunEvent(state.activeRun, event.payload.run),
      status: "ready",
    },
    false,
    true,
  );
}

function applyRunItemOutputDeltaEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.run_item_output.delta">,
): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    runItemOutputs: upsertRunItemOutput(state.runItemOutputs, event.payload.output),
    status: "ready",
  });
}

function applyTranscriptBlockUpsertEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.transcript_block.created" | "chat.transcript_block.updated">,
): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    status: "ready",
    transcriptBlocks: upsertTranscriptBlock(state.transcriptBlocks, event.payload.block),
  });
}

function applyTranscriptBlocksReplacedEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.transcript_blocks.replaced">,
): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    status: "ready",
    transcriptBlocks: replaceRunTranscriptBlocks(
      state.transcriptBlocks,
      event.payload.runId,
      event.payload.blocks,
    ),
  });
}

function applyTranscriptTextDeltaEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.transcript_text.delta">,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  const updated = appendTranscriptBlockText(
    state.transcriptBlocks,
    event.payload.blockId,
    event.payload.delta,
    event.payload.updatedAt,
  );
  return {
    patch: { status: "ready", transcriptBlocks: updated.blocks },
    resync: !updated.found,
  };
}

function applyQueueUpdatedEvent(
  state: ChatStore,
  event: AppliedEventOf<"chat.queue.updated">,
): EventApplyResult {
  return selectedConversationEventResult(
    state,
    event,
    {
      messages: mergeQueueMessages(state.messages, event.payload.queue.messages),
      queuedRuns: queuedRunsFromQueue(event.payload.queue.runs),
      status: "ready",
    },
    false,
    true,
  );
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
    olderBeforeBlockOrdinal: 0,
    queuedRuns: [],
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItemOutputsById: {},
    backgroundTerminalIdsByConversationId: {},
    backgroundTerminalOutputIdsByProcessId: {},
    backgroundTerminalOutputPagesByProcessId: {},
    backgroundTerminalOutputsById: {},
    backgroundTerminalsById: {},
    selectedConversation: null,
    transcriptBlocks: [],
    transcriptBlocksById: {},
  };
}

function diagnosticCreatedPatch(
  state: ChatStore,
  event: AppliedEventOf<"diagnostic.created">,
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
