import type {
  ConversationEvent,
  ConversationSnapshot,
  TopicConversation,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useConversationNavigatorStore } from "./conversation-navigator-store";
import {
  conversationProjectionNeedsKeepAlive,
  handleConversationProjectionEvent,
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

  test("retains terminal speech streams only while final narration can still arrive", () => {
    const working = conversationSnapshot(1);
    working.conversation.status = "working";
    expect(conversationProjectionNeedsKeepAlive(working)).toBe(true);

    const terminal = terminalConversationSnapshot();
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(true);

    terminal.narration.events.push({
      conversationId,
      id: "narration_final",
      kind: "final_summary",
      turnId: "turn_terminal",
    } as ConversationSnapshot["narration"]["events"][number]);
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);

    terminal.narration.events = [];
    terminal.narratorState.status = "degraded";
    terminal.narratorState.degradation = {
      retryable: false,
    } as NonNullable<ConversationSnapshot["narratorState"]["degradation"]>;
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);

    terminal.narratorState.degradation = null;
    terminal.presentationProfile.narratorSpeechEnabled = false;
    expect(conversationProjectionNeedsKeepAlive(terminal)).toBe(false);
  });
});

function installConversationAPI(read: (request: unknown) => Promise<ConversationSnapshot>): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { conversations: { read } } },
  });
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
