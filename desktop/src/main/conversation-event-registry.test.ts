import type {
  ConversationEvent,
  ConversationEventCursor,
  ConversationTurn,
  NarrationEvent,
  NarratorState,
  TopicConversation,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { ConversationEventRegistry } from "./conversation-event-registry";

describe("conversation event registry", () => {
  test("keeps a pane-released stream through terminal narration before stopping it", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("idle"));
    harness.forward(turnUpdated("turn_terminal"));
    harness.forward(conversationUpdated("idle"));
    harness.forward(narrationCreated("milestone"));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await Promise.resolve();

    expect(harness.sender.send).toHaveBeenCalledTimes(5);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("stops a terminal retained stream when narration degrades without a retry path", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("failed"));
    harness.forward(narratorStateUpdated(false));
    await Promise.resolve();

    expect(harness.sender.send).toHaveBeenCalledTimes(2);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("keeps a terminal retained stream through retryable narrator degradation", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("idle"));
    harness.forward(turnUpdated("turn_terminal"));
    harness.forward(narratorStateUpdated(true));
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await Promise.resolve();

    expect(harness.sender.send).toHaveBeenCalledTimes(4);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("does not treat working narrator output as the terminal keep-alive boundary", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("idle"));
    harness.forward(turnUpdated("turn_terminal"));
    harness.forward(conversationUpdated("working"));
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    expect(harness.stop).not.toHaveBeenCalled();

    await harness.registry.release(harness.sender, target, false);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("waits for the current terminal turn when an older final summary arrives late", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("idle", 9));
    harness.forward(turnUpdated("turn_older"));
    harness.forward(conversationUpdated("idle", 10));
    harness.forward(turnUpdated("turn_current"));
    harness.forward(narrationCreated("final_summary", "turn_older"));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(narrationCreated("final_summary", "turn_current"));
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("retains a stream released after the terminal transition until final narration", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    harness.forward(conversationUpdated("idle"));
    harness.forward(turnUpdated("turn_terminal"));

    await harness.registry.release(harness.sender, target, true);
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
  });
});

const target = { conversationId: "conversation_registry", workspaceId: "workspace_registry" };
const cursor = {
  sequence: 0,
  streamId: "conversation:conversation_registry",
} satisfies ConversationEventCursor;

function registryHarness() {
  let forward: ((event: ConversationEvent) => void) | null = null;
  const stop = vi.fn(async () => {});
  const sender = {
    id: 7,
    isDestroyed: () => false,
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  };
  const registry = new ConversationEventRegistry({
    backendConnection: () => ({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl: vi.fn(),
    }),
    startEventStream: (options) => {
      forward = options.sendEvent;
      return { done: new Promise(() => {}), stop };
    },
  });
  return {
    forward: (event: ConversationEvent) => {
      if (!forward) {
        throw new Error("conversation stream was not started");
      }
      forward(event);
    },
    registry,
    sender,
    stop,
  };
}

function conversationUpdated(
  status: TopicConversation["status"],
  lastTrajectorySequence = 9,
): ConversationEvent {
  return event({
    conversation: {
      id: target.conversationId,
      lastTrajectorySequence,
      status,
      workspaceId: target.workspaceId,
    } as TopicConversation,
    type: "conversation.updated",
  });
}

function narrationCreated(
  kind: NarrationEvent["kind"],
  turnId = "turn_terminal",
): ConversationEvent {
  return event({
    event: {
      conversationId: target.conversationId,
      id: `narration_${kind}`,
      kind,
      turnId,
    } as NarrationEvent,
    type: "conversation.narration.created",
  });
}

function turnUpdated(id: string): ConversationEvent {
  return event({
    turn: {
      conversationId: target.conversationId,
      id,
      status: "completed",
    } as ConversationTurn,
    type: "conversation.turn.updated",
  });
}

function narratorStateUpdated(retryable: boolean): ConversationEvent {
  return event({
    state: {
      conversationId: target.conversationId,
      degradation: {
        retryable,
      },
      status: "degraded",
    } as NarratorState,
    type: "conversation.narrator_state.updated",
  });
}

function event(payload: ConversationEvent["payload"]): ConversationEvent {
  return {
    conversationId: target.conversationId,
    emittedAt: "2026-07-12T19:00:00Z",
    eventId: "conversation:conversation_registry:1",
    payload,
    schemaVersion: 1,
    sequence: 1,
    streamId: cursor.streamId,
    workspaceId: target.workspaceId,
  };
}
