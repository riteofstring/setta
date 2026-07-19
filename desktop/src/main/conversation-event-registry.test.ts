import type {
  ConversationEvent,
  ConversationEventCursor,
  NarrationEvent,
  TopicConversation,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { ConversationEventRegistry } from "./conversation-event-registry";

describe("conversation event registry", () => {
  test("keeps a pane-released active stream until terminal narration arrives", async () => {
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

  test("stops a released stream when terminal status follows terminal narration", async () => {
    const harness = registryHarness();
    harness.registry.subscribe(harness.sender, target, cursor);
    await harness.registry.release(harness.sender, target, true);

    harness.forward(conversationUpdated("waiting_for_approval"));
    harness.forward(narrationCreated("final_summary", "turn_terminal"));
    expect(harness.stop).not.toHaveBeenCalled();

    harness.forward(conversationUpdated("failed"));
    await Promise.resolve();

    expect(harness.stop).toHaveBeenCalledOnce();
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
): ConversationEvent {
  return event({
    event: {
      conversationId: target.conversationId,
      id: `narration_${kind}`,
      kind,
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
