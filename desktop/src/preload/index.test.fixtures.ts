import type { ConversationEvent } from "@generated/backend";

export function conversationEvent(): ConversationEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-07-11T20:00:00Z",
    eventId: "conversation_stream_test:4",
    payload: {
      currentSequence: 4,
      currentStreamId: "conversation_stream_test",
      reason: "snapshot required",
      requestedSequence: 0,
      requestedStreamId: "conversation_stream_test",
      type: "conversation.resync_required",
    },
    schemaVersion: 1,
    sequence: 4,
    streamId: "conversation_stream_test",
    workspaceId: "workspace_api",
  };
}
