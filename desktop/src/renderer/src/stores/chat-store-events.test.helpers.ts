import type {
  ChatEvent,
  ChatMessage,
  ConversationListItem,
  Run,
  RunItem,
  RunItemOutput,
} from "@generated/backend";

const eventStreamId = "event_stream_test";

export function messageCreatedEvent(
  sequence: number,
  chatMessage: ChatMessage,
  runId: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: chatMessage.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      message: chatMessage,
    },
    runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

export function assistantDeltaEvent(
  sequence: number,
  messageId: string,
  partId: string,
  delta: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      delta,
      messageId,
      partId,
      updatedAt: "2026-05-29T20:00:01Z",
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.assistant_text_delta",
    workspaceId: "workspace_api",
  };
}

export function runUpdatedEvent(sequence: number, run: Run, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: run.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { run },
    runId: run.id,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run.updated",
    workspaceId: run.workspaceId,
  };
}

export function runItemCreatedEvent(
  sequence: number,
  item: RunItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.created",
    workspaceId: item.workspaceId,
  };
}

export function runItemUpdatedEvent(
  sequence: number,
  item: RunItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.updated",
    workspaceId: item.workspaceId,
  };
}

export function runItemOutputDeltaEvent(
  sequence: number,
  output: RunItemOutput,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { output },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item_output.delta",
    workspaceId: "workspace_api",
  };
}

export function conversationUpdatedEvent(
  sequence: number,
  item: ConversationListItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversation.id,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.activeRunId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.conversation.updated",
    workspaceId: item.conversation.workspaceId,
  };
}

export function diagnosticCreatedEvent(sequence: number, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      diagnostic: {
        code: "complete_turn_transition_failed",
        context: { error: "terminal transition failed" },
        conversationId: "conversation_api",
        id: "diagnostic_api",
        message: "terminal transition failed",
        occurredAt: "2026-05-29T20:00:00Z",
        runId: "run_api",
        schemaVersion: 1,
        severity: "critical",
        source: "chat",
        workspaceId: "workspace_api",
      },
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "diagnostic.created",
    workspaceId: "workspace_api",
  };
}

export function resyncRequiredEvent(
  sequence: number,
  options: {
    currentSequence?: number;
    currentStreamId?: string;
    requestedSequence?: number;
    requestedStreamId?: string;
  } = {},
): ChatEvent {
  const streamId = options.currentStreamId ?? eventStreamId;
  const currentSequence = options.currentSequence ?? sequence;
  return {
    conversationId: "",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${currentSequence}`,
    payload: {
      currentSequence,
      currentStreamId: streamId,
      earliestSequence: 0,
      reason: "test resync",
      requestedSequence: options.requestedSequence ?? Math.max(0, sequence - 1),
      requestedStreamId: options.requestedStreamId ?? streamId,
    },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.resync_required",
    workspaceId: "",
  };
}
