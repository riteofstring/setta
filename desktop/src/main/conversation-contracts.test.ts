import {
  decodeConversationEvent,
  decodeConversationUpdatedEventPayload,
  type ConversationEventPayload,
} from "@generated/backend";
import { describe, expect, it } from "vitest";

describe("generated conversation contracts", () => {
  it("decodes a typed stream envelope", () => {
    const event = decodeConversationEvent({
      schemaVersion: 1,
      streamId: "conversation:conversation-api",
      sequence: 3,
      eventId: "conversation:conversation-api:3",
      emittedAt: "2026-07-11T20:00:00Z",
      workspaceId: "workspace-api",
      conversationId: "conversation-api",
      payload: {
        type: "conversation.resync_required",
        reason: "Reload the bounded snapshot.",
        requestedStreamId: "conversation:other",
        requestedSequence: 2,
        currentStreamId: "conversation:conversation-api",
        currentSequence: 3,
      },
    });

    expect(event.payload.type).toBe("conversation.resync_required");
    if (event.payload.type !== "conversation.resync_required") {
      throw new Error(`Unexpected event type: ${event.payload.type}`);
    }
    expect(eventDispositionByType["conversation.resync_required"](event.payload)).toBe("resync");
  });

  it("rejects a variant decoder with another variant's discriminator", () => {
    expect(() =>
      decodeConversationUpdatedEventPayload({
        type: "conversation.turn.updated",
        conversation: {},
      }),
    ).toThrow(/ConversationUpdatedEventPayload\.type must be conversation\.updated/);
  });
});

type ConversationEventType = ConversationEventPayload["type"];
type ConversationPayloadOf<Type extends ConversationEventType> = Extract<
  ConversationEventPayload,
  { type: Type }
>;
type ConversationEventDispositionMap = {
  [Type in ConversationEventType]: (payload: ConversationPayloadOf<Type>) => string;
};

const eventDispositionByType = {
  "conversation.updated": (payload) => payload.conversation.status,
  "conversation.turn.updated": (payload) => payload.turn.status,
  "conversation.queue.updated": (payload) => `queue:${payload.queue.length}`,
  "conversation.thread_binding.updated": (payload) => payload.binding.status,
  "conversation.trajectory.appended": (payload) => payload.event.kind,
  "conversation.artifact.created": (payload) => payload.artifact.kind,
  "conversation.narrator_state.updated": (payload) => payload.state.status,
  "conversation.narration.created": (payload) => payload.event.kind,
  "conversation.role_profile_override.updated": (payload) => payload.override.profile.role,
  "conversation.presentation_profile.updated": (payload) => payload.profile.resolvedPaletteId,
  "conversation.branch.created": (payload) => payload.branch.kind,
  "conversation.side_conversation.updated": (payload) => payload.sideConversation.status,
  "conversation.resync_required": (payload) => (payload.reason.length > 0 ? "resync" : "invalid"),
} satisfies ConversationEventDispositionMap;
