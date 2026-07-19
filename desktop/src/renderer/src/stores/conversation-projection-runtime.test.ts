import type {
  ConversationEvent,
  ConversationSnapshot,
  TopicConversation,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useConversationNavigatorStore } from "./conversation-navigator-store";
import {
  conversationProjectionNeedsKeepAlive,
  enqueueConversationProjectionEvent,
  handleConversationProjectionEvent,
  retainConversationProjection,
  resetConversationProjectionRuntime,
} from "./conversation-projection-runtime";
import { useConversationStore } from "./conversation-store";

const conversationId = "conversation_runtime";
const workspaceId = "workspace_runtime";
const timestamp = "2026-07-11T20:00:00Z";

describe("conversation projection runtime", () => {
  beforeEach(() => {
    resetConversationProjectionRuntime();
    useConversationStore.getState().reset();
    useConversationNavigatorStore.getState().resetRuntimeState();
  });

  afterEach(() => {
    resetConversationProjectionRuntime();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("retries when the required cursor advances during a resync read", async () => {
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationId, conversationSnapshot(1));
    let resolveFirst: ((snapshot: ConversationSnapshot) => void) | undefined;
    const first = new Promise<ConversationSnapshot>((resolve) => {
      resolveFirst = resolve;
    });
    const read = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(conversationSnapshot(4));
    installConversationAPI(read);

    handleConversationProjectionEvent(conversationUpdatedEvent(3));
    expect(read).toHaveBeenCalledTimes(1);
    handleConversationProjectionEvent(conversationUpdatedEvent(4));
    resolveFirst?.(conversationSnapshot(3));

    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
      expect(projectionSnapshot()?.eventCursor.sequence).toBe(4);
      expect(projectionResync()).toBeNull();
    });
  });

  test("does not hydrate an obsolete runtime generation", async () => {
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationId, conversationSnapshot(1));
    let resolveRead: ((snapshot: ConversationSnapshot) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<ConversationSnapshot>((resolve) => {
          resolveRead = resolve;
        }),
    );
    installConversationAPI(read);

    handleConversationProjectionEvent(conversationUpdatedEvent(3));
    expect(read).toHaveBeenCalledTimes(1);
    resetConversationProjectionRuntime();
    useConversationStore.getState().reset();
    resolveRead?.(conversationSnapshot(3));
    await Promise.resolve();
    await Promise.resolve();

    expect(useConversationStore.getState().conversations.size).toBe(0);
  });

  test("applies at most one bounded event batch per animation frame", () => {
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationId, conversationSnapshot(0));
    const scheduler = manualFrameScheduler();
    installConversationAPI(vi.fn(), scheduler.windowOverrides);
    const subscriber = vi.fn();
    const unsubscribe = useConversationStore.subscribe(subscriber);
    try {
      for (let sequence = 1; sequence <= 129; sequence += 1) {
        enqueueConversationProjectionEvent(conversationUpdatedEvent(sequence));
      }

      expect(projectionSnapshot()?.eventCursor.sequence).toBe(0);
      expect(scheduler.pendingFrames()).toBe(1);
      scheduler.runFrame();
      expect(projectionSnapshot()?.eventCursor.sequence).toBe(128);
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(scheduler.pendingFrames()).toBe(1);
      scheduler.runFrame();
      expect(projectionSnapshot()?.eventCursor.sequence).toBe(129);
      expect(subscriber).toHaveBeenCalledTimes(2);
      expect(scheduler.pendingFrames()).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  test("discards a queued frame when the runtime generation resets", () => {
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationId, conversationSnapshot(0));
    const scheduler = manualFrameScheduler();
    installConversationAPI(vi.fn(), scheduler.windowOverrides);

    enqueueConversationProjectionEvent(conversationUpdatedEvent(1));
    resetConversationProjectionRuntime();

    expect(scheduler.pendingFrames()).toBe(0);
    expect(projectionSnapshot()?.eventCursor.sequence).toBe(0);
  });

  test("uses queued event state when releasing a projection before its frame flush", async () => {
    const scheduler = manualFrameScheduler();
    const release = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn().mockResolvedValue(undefined);
    installConversationAPI(
      vi.fn().mockResolvedValue(conversationSnapshot(0)),
      scheduler.windowOverrides,
      { release, subscribe },
    );
    const releaseProjection = retainConversationProjection(workspaceId, conversationId);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    const working = conversationUpdatedEvent(1);
    if (working.payload.type !== "conversation.updated") {
      throw new Error("working fixture must update a conversation");
    }
    working.payload.conversation.status = "working";

    enqueueConversationProjectionEvent(working);
    releaseProjection();

    expect(projectionSnapshot()?.conversation.status).toBe("idle");
    expect(release).toHaveBeenCalledWith({
      conversationId,
      keepAlive: true,
      workspaceId,
    });
  });

  test("retains speech streams only while released conversations still have active work", () => {
    const working = conversationSnapshot(1);
    working.conversation.status = "working";
    expect(conversationProjectionNeedsKeepAlive(working)).toBe(true);

    const waiting = conversationSnapshot(1);
    waiting.conversation.status = "waiting_for_approval";
    expect(conversationProjectionNeedsKeepAlive(waiting)).toBe(true);

    const terminal = terminalConversationSnapshot();
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);

    terminal.conversation.status = "failed";
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);

    working.presentationProfile.narratorSpeechEnabled = false;
    expect(conversationProjectionNeedsKeepAlive(working)).toBe(false);

    terminal.presentationProfile.narratorSpeechEnabled = false;
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);
  });
});

function installConversationAPI(
  read: (request: unknown) => Promise<ConversationSnapshot>,
  windowOverrides: Record<string, unknown> = {},
  conversationOverrides: Record<string, unknown> = {},
): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...windowOverrides,
      setta: { conversations: { read, ...conversationOverrides } },
    },
  });
}

function manualFrameScheduler() {
  let nextFrameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  return {
    pendingFrames: () => frames.size,
    runFrame: () => {
      const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) {
        throw new Error("no conversation projection frame is scheduled");
      }
      frames.delete(next[0]);
      next[1](0);
    },
    windowOverrides: {
      cancelAnimationFrame: (frameId: number) => frames.delete(frameId),
      clearTimeout: vi.fn(),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        nextFrameId += 1;
        frames.set(nextFrameId, callback);
        return nextFrameId;
      },
      setTimeout: vi.fn(() => 1),
    },
  };
}

function projectionSnapshot(): ConversationSnapshot | null | undefined {
  return useConversationStore.getState().conversations.get(conversationId)?.snapshot;
}

function projectionResync() {
  return useConversationStore.getState().conversations.get(conversationId)?.resync;
}

function conversationUpdatedEvent(sequence: number): ConversationEvent {
  return {
    conversationId,
    emittedAt: timestamp,
    eventId: `conversation:${conversationId}:${sequence}`,
    payload: {
      conversation: topicConversation(`Update ${sequence}`),
      type: "conversation.updated",
    },
    schemaVersion: 1,
    sequence,
    streamId: `conversation:${conversationId}`,
    workspaceId,
  };
}

function conversationSnapshot(sequence: number): ConversationSnapshot {
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: topicConversation(`Snapshot ${sequence}`),
    eventCursor: { sequence, streamId: `conversation:${conversationId}` },
    narration: { events: [], hasEarlier: false },
    narratorState: {
      checkpointText: "",
      checkpointThroughSequence: 0,
      conversationId,
      currentFocus: "",
      currentFocusRevision: 0,
      currentFocusSourceSequence: 0,
      degradation: null,
      lastInvocationAt: null,
      observedThroughSequence: 0,
      status: "ready",
      topicDescriptor: "Projection runtime",
      updatedAt: timestamp,
    },
    presentationProfile: {
      conversationId,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: null,
      resolvedPaletteId: "sky",
      updatedAt: timestamp,
    },
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [] },
  };
}

function terminalConversationSnapshot(): ConversationSnapshot {
  const snapshot = conversationSnapshot(1);
  snapshot.conversation.status = "idle";
  snapshot.turns.turns.push({
    conversationId,
    id: "turn_terminal",
    status: "completed",
  } as ConversationSnapshot["turns"]["turns"][number]);
  return snapshot;
}

function topicConversation(title: string): TopicConversation {
  return {
    archivedAt: null,
    createdAt: timestamp,
    id: conversationId,
    lastTrajectorySequence: 0,
    status: "idle",
    title,
    topicDescriptor: "Projection runtime",
    updatedAt: timestamp,
    workspaceId,
  };
}
