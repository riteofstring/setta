import type {
  ConversationEvent,
  ConversationEventCursor,
  NarrationEvent,
  TopicConversation,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { ConversationEventRegistry } from "./conversation-event-registry";

describe("conversation event registry", () => {
  test("keeps a released active stream until terminal narration arrives", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("working"));
    harness.forward(narrationCreated("milestone"));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(conversationUpdated("idle"));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await Promise.resolve();

    expect(harness.sender.send).toHaveBeenCalledTimes(4);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("ignores terminal narration that does not match the terminal status boundary", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("waiting_for_approval", 12));
    harness.forward(narrationCreated("final_summary", "turn_terminal", 8));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(conversationUpdated("failed", 12));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(narrationCreated("final_summary", "turn_terminal", 12));
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("stops when a stream is released after terminal status but before terminal narration", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);

    harness.forward(conversationUpdated("idle"));
    await harness.registry.release(harness.sender, target, true);
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("stops immediately when a stream is released after terminal narration completed", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);

    harness.forward(conversationUpdated("idle"));
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    await harness.registry.release(harness.sender, target, true);
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
  });

  test("keeps an active subscription after terminal narration completed", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);

    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    harness.forward(conversationUpdated("idle"));
    await Promise.resolve();

    expect(harness.stop).not.toHaveBeenCalled();
  });

  test("stops immediately when a released stream is not kept alive", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);

    await harness.registry.release(harness.sender, target, false);

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
  trigger: NarrationEvent["trigger"] = "progress_window_elapsed",
  sourceSequenceEnd = 9,
): ConversationEvent {
  return event({
    event: {
      conversationId: target.conversationId,
      id: `narration_${kind}`,
      kind,
      sourceSequenceEnd,
      trigger,
      turnId: "turn_registry",
    } as NarrationEvent,
    type: "conversation.narration.created",
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
