import type {
  AgentThreadBinding,
  Artifact,
  ConversationBranch,
  ConversationEvent,
  ConversationEventPayload,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationTurn,
  NarrationEvent,
  NarratorState,
  PermissionProfile,
  ResolvedInvocation,
  Role,
  RoleProfile,
  RoleProfileOverride,
  SideConversation,
  TopicConversation,
  TrajectoryEvent,
} from "@generated/backend";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useConversationStore } from "./conversation-store";

const workspaceId = "workspace_api";
const conversationA = "conversation_a";
const conversationB = "conversation_b";
const timestamp = "2026-07-11T20:00:00Z";

describe("conversation store", () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  test("owns independent load, error, hydration, and cleanup state per conversation", () => {
    const snapshotA = conversationSnapshot(conversationA);
    const snapshotB = conversationSnapshot(conversationB);

    useConversationStore.getState().beginSnapshotLoad(workspaceId, conversationA);
    useConversationStore
      .getState()
      .failSnapshotLoad(workspaceId, conversationA, new Error("snapshot unavailable"));
    expect(projection(conversationA)).toMatchObject({
      conversationId: conversationA,
      error: "snapshot unavailable",
      snapshot: null,
      status: "error",
      workspaceId,
    });

    useConversationStore.getState().hydrateSnapshot(workspaceId, conversationA, snapshotA);
    useConversationStore.getState().hydrateSnapshot(workspaceId, conversationB, snapshotB);

    expect(projection(conversationA)).toMatchObject({ error: null, status: "ready" });
    expect(projection(conversationB)).toMatchObject({ error: null, status: "ready" });
    expect(projection(conversationA).snapshot).not.toBe(snapshotA);
    expect(projection(conversationA).snapshot?.queue).not.toBe(snapshotA.queue);

    useConversationStore.getState().removeConversation(conversationA);
    expect(useConversationStore.getState().conversations.has(conversationA)).toBe(false);
    expect(useConversationStore.getState().conversations.has(conversationB)).toBe(true);

    useConversationStore.getState().removeWorkspace(workspaceId);
    expect(useConversationStore.getState().conversations.size).toBe(0);
  });

  test("batches every typed payload branch while preserving unrelated projection identity", () => {
    hydrate(conversationA);
    hydrate(conversationB);
    const projectionBBefore = projection(conversationB);
    const subscriber = vi.fn();
    const unsubscribe = useConversationStore.subscribe(subscriber);
    try {
      useConversationStore.getState().applyEvents(allProjectionEvents(conversationA));
    } finally {
      unsubscribe();
    }

    const current = projection(conversationA).snapshot!;
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(projection(conversationB)).toBe(projectionBBefore);
    expect(current.conversation).toMatchObject({
      lastTrajectorySequence: 1,
      status: "working",
      title: "Updated conversation A",
    });
    expect(current.turns.turns.map((turn) => turn.id)).toEqual(["turn_a"]);
    expect(current.queue.map((queued) => queued.turnId)).toEqual(["turn_a"]);
    expect(current.threadBinding?.threadId).toBe("thread_a");
    expect(current.trajectory.events.map((event) => event.id)).toEqual(["trajectory_a"]);
    expect(current.artifacts.artifacts.map((artifact) => artifact.id)).toEqual(["artifact_a"]);
    expect(current.narratorState.currentFocus).toBe("Implement the normalized store.");
    expect(current.narration.events.map((event) => event.id)).toEqual(["narration_a"]);
    expect(current.roleProfileOverrides.map((override) => override.profile.role)).toEqual([
      "narrator",
    ]);
    expect(current.presentationProfile.resolvedPaletteId).toBe("violet");
    expect(current.branch?.parentConversationId).toBe("conversation_parent");
    expect(current.sideConversations.map((side) => side.id)).toEqual(["side_a"]);
    expect(current.eventCursor).toEqual({
      sequence: 12,
      streamId: conversationStreamId(conversationA),
    });
  });

  test("applies interleaved streams to their own conversation cursors", () => {
    hydrate(conversationA);
    hydrate(conversationB);

    useConversationStore.getState().applyEvents([
      conversationEvent(conversationA, 1, updatedPayload(conversationA, "Topic A")),
      conversationEvent(conversationB, 1, updatedPayload(conversationB, "Topic B")),
      conversationEvent(conversationA, 2, {
        queue: [],
        type: "conversation.queue.updated",
      }),
      conversationEvent(conversationB, 2, {
        queue: [],
        type: "conversation.queue.updated",
      }),
    ]);

    expect(projection(conversationA).snapshot?.conversation.title).toBe("Topic A");
    expect(projection(conversationB).snapshot?.conversation.title).toBe("Topic B");
    expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(2);
    expect(projection(conversationB).snapshot?.eventCursor.sequence).toBe(2);
  });

  test("ignores duplicate envelopes without notifying subscribers", () => {
    hydrate(conversationA);
    const event = conversationEvent(conversationA, 1, updatedPayload(conversationA, "Current"));
    useConversationStore.getState().applyEvent(event);
    const currentProjection = projection(conversationA);
    const subscriber = vi.fn();
    const unsubscribe = useConversationStore.subscribe(subscriber);
    try {
      useConversationStore.getState().applyEvent({
        ...event,
        payload: updatedPayload(conversationA, "Stale duplicate"),
      });
    } finally {
      unsubscribe();
    }

    expect(subscriber).not.toHaveBeenCalled();
    expect(projection(conversationA)).toBe(currentProjection);
    expect(projection(conversationA).snapshot?.conversation.title).toBe("Current");
  });

  test("keeps a projection stale until a snapshot covers every ignored event", () => {
    hydrate(conversationA, 2);

    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 4, updatedPayload(conversationA, "Gap")));
    expect(projection(conversationA).resync).toMatchObject({
      minimumCursor: { sequence: 4, streamId: conversationStreamId(conversationA) },
      reason: "event_sequence_gap",
    });

    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 5, updatedPayload(conversationA, "Later")));
    expect(projection(conversationA).resync?.minimumCursor.sequence).toBe(5);

    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationA, conversationSnapshot(conversationA, 4));
    expect(projection(conversationA).resync?.minimumCursor.sequence).toBe(5);
    expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(2);

    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationA, conversationSnapshot(conversationA, 5));
    expect(projection(conversationA).resync).toBeNull();
    expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(5);
  });

  test("requires a covering snapshot when events arrive before hydration", () => {
    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 1, updatedPayload(conversationA, "First")));
    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 2, updatedPayload(conversationA, "Second")));

    expect(projection(conversationA)).toMatchObject({
      snapshot: null,
      status: "unloaded",
    });
    expect(projection(conversationA).resync).toMatchObject({
      minimumCursor: { sequence: 2 },
      reason: "event_before_snapshot",
    });

    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationA, conversationSnapshot(conversationA, 1));
    expect(projection(conversationA).snapshot).toBeNull();

    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, conversationA, conversationSnapshot(conversationA, 2));
    expect(projection(conversationA)).toMatchObject({ resync: null, status: "ready" });
  });

  test.each([
    {
      event: () => ({
        ...conversationEvent(conversationA, 1, updatedPayload(conversationA, "Schema")),
        schemaVersion: 2,
      }),
      reason: "event_schema_changed",
    },
    {
      event: () => ({
        ...conversationEvent(conversationA, 1, updatedPayload(conversationA, "Stream")),
        eventId: "conversation:other:1",
        streamId: "conversation:other",
      }),
      reason: "event_stream_changed",
    },
  ])("marks $reason explicitly", ({ event, reason }) => {
    hydrate(conversationA);

    useConversationStore.getState().applyEvent(event());

    expect(projection(conversationA).resync?.reason).toBe(reason);
    expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(0);
  });

  test("uses the server-required cursor as the resync coverage boundary", () => {
    hydrate(conversationA, 2);
    useConversationStore
      .getState()
      .applyEvent(serverResyncEvent(conversationA, 3, 2, 6, "Committed events were compacted."));

    expect(projection(conversationA).resync).toEqual({
      detail: "Committed events were compacted.",
      minimumCursor: { sequence: 6, streamId: conversationStreamId(conversationA) },
      reason: "server_required",
    });
  });

  test.each([
    { envelopeSequence: 1, source: "duplicate" },
    { envelopeSequence: 5, source: "gapped" },
  ])(
    "honors a $source server resync envelope when its current cursor is newer",
    ({ envelopeSequence }) => {
      hydrate(conversationA, 2);

      useConversationStore
        .getState()
        .applyEvent(serverResyncEvent(conversationA, envelopeSequence, 2, 6, "Reload now."));

      expect(projection(conversationA).resync).toEqual({
        detail: "Reload now.",
        minimumCursor: { sequence: 6, streamId: conversationStreamId(conversationA) },
        reason: "server_required",
      });
      expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(2);
    },
  );

  test("retains server resync semantics before snapshot hydration", () => {
    useConversationStore
      .getState()
      .applyEvent(serverResyncEvent(conversationA, 6, 0, 6, "The retained stream moved."));

    expect(projection(conversationA)).toMatchObject({
      error: null,
      resync: {
        detail: "The retained stream moved.",
        minimumCursor: { sequence: 6, streamId: conversationStreamId(conversationA) },
        reason: "server_required",
      },
      snapshot: null,
      status: "unloaded",
    });
  });

  test("upgrades an existing gap to a later authoritative server resync", () => {
    hydrate(conversationA, 2);
    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 4, updatedPayload(conversationA, "Gap")));

    useConversationStore
      .getState()
      .applyEvent(serverResyncEvent(conversationA, 3, 2, 6, "The replay window expired."));

    expect(projection(conversationA).resync).toEqual({
      detail: "The replay window expired.",
      minimumCursor: { sequence: 6, streamId: conversationStreamId(conversationA) },
      reason: "server_required",
    });
  });

  test("keeps a failed pre-hydration load error while recording a required resync", () => {
    useConversationStore.getState().beginSnapshotLoad(workspaceId, conversationA);
    useConversationStore
      .getState()
      .failSnapshotLoad(workspaceId, conversationA, new Error("snapshot unavailable"));

    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 1, updatedPayload(conversationA, "Deferred")));

    expect(projection(conversationA)).toMatchObject({
      error: "snapshot unavailable",
      resync: {
        minimumCursor: { sequence: 1, streamId: conversationStreamId(conversationA) },
        reason: "event_before_snapshot",
      },
      snapshot: null,
      status: "error",
    });
  });

  test("does not let a stale snapshot response regress applied live state", () => {
    hydrate(conversationA);
    useConversationStore
      .getState()
      .applyEvent(conversationEvent(conversationA, 1, updatedPayload(conversationA, "Live title")));
    const liveProjection = projection(conversationA);
    const subscriber = vi.fn();
    const unsubscribe = useConversationStore.subscribe(subscriber);

    try {
      useConversationStore
        .getState()
        .hydrateSnapshot(
          workspaceId,
          conversationA,
          conversationSnapshot(conversationA, 0, "Stale title"),
        );
    } finally {
      unsubscribe();
    }

    expect(subscriber).not.toHaveBeenCalled();
    expect(projection(conversationA)).toBe(liveProjection);
    expect(projection(conversationA).snapshot?.conversation.title).toBe("Live title");
  });

  test("rejects cross-conversation snapshot and event payload ownership", () => {
    expect(() =>
      useConversationStore
        .getState()
        .hydrateSnapshot(workspaceId, conversationA, conversationSnapshot(conversationB)),
    ).toThrow(/conversation snapshot belongs to conversation_b/);

    hydrate(conversationA);
    expect(() =>
      useConversationStore.getState().applyEvent(
        conversationEvent(conversationA, 1, {
          turn: queuedTurn(conversationB),
          type: "conversation.turn.updated",
        }),
      ),
    ).toThrow(/conversation.turn.updated belongs to conversation_b/);
    expect(projection(conversationA).snapshot?.eventCursor.sequence).toBe(0);
  });
});

function projection(conversationId: string) {
  const current = useConversationStore.getState().conversations.get(conversationId);
  if (!current) {
    throw new Error(`Missing projection ${conversationId}`);
  }
  return current;
}

function hydrate(conversationId: string, sequence = 0): void {
  useConversationStore
    .getState()
    .hydrateSnapshot(workspaceId, conversationId, conversationSnapshot(conversationId, sequence));
}

function allProjectionEvents(conversationId: string): ConversationEvent[] {
  const turn = queuedTurn(conversationId);
  const conversationUpdated = updatedPayload(conversationId, "Updated conversation A");
  conversationUpdated.conversation.lastTrajectorySequence = 1;
  return [
    conversationEvent(conversationId, 1, conversationUpdated),
    conversationEvent(conversationId, 2, {
      turn,
      type: "conversation.turn.updated",
    }),
    conversationEvent(conversationId, 3, {
      queue: [
        {
          conversationId,
          ordinal: 1,
          queuedAt: timestamp,
          turnId: turn.id,
        },
      ],
      type: "conversation.queue.updated",
    }),
    conversationEvent(conversationId, 4, {
      binding: threadBinding(conversationId),
      type: "conversation.thread_binding.updated",
    }),
    conversationEvent(conversationId, 5, {
      event: trajectoryEvent(conversationId),
      type: "conversation.trajectory.appended",
    }),
    conversationEvent(conversationId, 6, {
      artifact: artifact(conversationId),
      type: "conversation.artifact.created",
    }),
    conversationEvent(conversationId, 7, {
      state: narratorState(conversationId, "Implement the normalized store."),
      type: "conversation.narrator_state.updated",
    }),
    conversationEvent(conversationId, 8, {
      event: narrationEvent(conversationId),
      type: "conversation.narration.created",
    }),
    conversationEvent(conversationId, 9, {
      override: roleOverride(conversationId),
      type: "conversation.role_profile_override.updated",
    }),
    conversationEvent(conversationId, 10, {
      profile: presentationProfile(conversationId, "violet"),
      type: "conversation.presentation_profile.updated",
    }),
    conversationEvent(conversationId, 11, {
      branch: branch(conversationId),
      type: "conversation.branch.created",
    }),
    conversationEvent(conversationId, 12, {
      sideConversation: sideConversation(conversationId),
      type: "conversation.side_conversation.updated",
    }),
  ];
}

function updatedPayload(
  conversationId: string,
  title: string,
): Extract<ConversationEventPayload, { type: "conversation.updated" }> {
  return {
    conversation: {
      ...topicConversation(conversationId, title),
      status: "working",
    },
    type: "conversation.updated",
  };
}

function conversationEvent(
  conversationId: string,
  sequence: number,
  payload: ConversationEventPayload,
): ConversationEvent {
  const streamId = conversationStreamId(conversationId);
  return {
    conversationId,
    emittedAt: timestamp,
    eventId: `${streamId}:${sequence}`,
    payload,
    schemaVersion: 1,
    sequence,
    streamId,
    workspaceId,
  };
}

function serverResyncEvent(
  conversationId: string,
  envelopeSequence: number,
  requestedSequence: number,
  currentSequence: number,
  reason: string,
): ConversationEvent {
  return conversationEvent(conversationId, envelopeSequence, {
    currentSequence,
    currentStreamId: conversationStreamId(conversationId),
    reason,
    requestedSequence,
    requestedStreamId: conversationStreamId(conversationId),
    type: "conversation.resync_required",
  });
}

function conversationSnapshot(
  conversationId: string,
  sequence = 0,
  title = `Topic ${conversationId}`,
): ConversationSnapshot {
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: topicConversation(conversationId, title),
    eventCursor: { sequence, streamId: conversationStreamId(conversationId) },
    narration: { events: [], hasEarlier: false },
    narratorState: narratorState(conversationId),
    presentationProfile: presentationProfile(conversationId),
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [] },
  };
}

function topicConversation(conversationId: string, title: string): TopicConversation {
  return {
    archivedAt: null,
    createdAt: timestamp,
    id: conversationId,
    lastTrajectorySequence: 0,
    status: "idle",
    title,
    topicDescriptor: "Renderer state normalization",
    updatedAt: timestamp,
    workspaceId,
  };
}

function queuedTurn(conversationId: string): ConversationTurn {
  return {
    acceptedAt: timestamp,
    authoredInput: { text: "Normalize the conversation state." },
    conversationId,
    delivery: "queued",
    endedAt: null,
    error: null,
    id: "turn_a",
    providerTurnId: null,
    requestedRoleProfile: roleProfile("agent"),
    resolvedInvocation: null,
    startedAt: null,
    status: "queued",
  };
}

function threadBinding(conversationId: string): AgentThreadBinding {
  return {
    conversationId,
    createdAt: timestamp,
    lastResumedAt: timestamp,
    lastTurnId: null,
    provider: "codex",
    providerMetadata: {},
    status: "linked",
    threadId: "thread_a",
  };
}

function trajectoryEvent(conversationId: string): TrajectoryEvent {
  return {
    actor: "user",
    activityCompleted: null,
    activityFailed: null,
    activityProgressed: null,
    activityStarted: null,
    agentLivenessChanged: null,
    agentMessageCompleted: null,
    agentPublicTextDelta: null,
    approvalRequested: null,
    approvalResolved: null,
    artifactEmitted: null,
    conversationId,
    emittedAt: timestamp,
    fileChangeCompleted: null,
    fileChangeProposed: null,
    id: "trajectory_a",
    kind: "user_input_accepted",
    modelRerouted: null,
    planChanged: null,
    providerEventId: null,
    providerLifecycleChanged: null,
    providerThreadId: null,
    providerTurnId: null,
    publicReasoningSummaryUpdated: null,
    sequence: 1,
    subagentCompleted: null,
    subagentStarted: null,
    subagentUpdated: null,
    turnCompleted: null,
    turnFailed: null,
    turnId: "turn_a",
    turnInterrupted: null,
    turnPromoted: null,
    turnQueued: null,
    turnStarted: null,
    turnSteered: null,
    userInputAccepted: {
      delivery: "normal",
      input: { text: "Normalize the conversation state." },
    },
  };
}

function artifact(conversationId: string): Artifact {
  return {
    conversationId,
    createdAt: timestamp,
    id: "artifact_a",
    kind: "markdown",
    mediaType: "text/markdown",
    metadata: {},
    title: "Store report",
    trajectorySequence: 1,
    turnId: "turn_a",
    uri: "setta://artifact/a",
  };
}

function narratorState(conversationId: string, currentFocus = "Ready"): NarratorState {
  return {
    checkpointText: "",
    checkpointThroughSequence: 0,
    conversationId,
    currentFocus,
    currentFocusRevision: 1,
    degradation: null,
    lastInvocationAt: null,
    observedThroughSequence: 0,
    status: "ready",
    topicDescriptor: "Renderer state normalization",
    updatedAt: timestamp,
  };
}

function narrationEvent(conversationId: string): NarrationEvent {
  return {
    conversationId,
    createdAt: timestamp,
    finalSummary: null,
    id: "narration_a",
    kind: "milestone",
    milestone: { text: "Conversation state is normalized." },
    resolvedInvocation: resolvedInvocation("narrator"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence: 1,
    topicDescriptor: null,
    trigger: "plan_changed",
    turnId: "turn_a",
  };
}

function roleOverride(conversationId: string): RoleProfileOverride {
  return {
    profile: roleProfile("narrator"),
    scopeId: conversationId,
    scopeKind: "conversation",
    updatedAt: timestamp,
  };
}

function presentationProfile(
  conversationId: string,
  resolvedPaletteId: ConversationPresentationProfile["resolvedPaletteId"] = "sky",
): ConversationPresentationProfile {
  return {
    conversationId,
    narratorSpeechEnabled: true,
    narratorVoiceReuse: null,
    narratorVoiceSelection: "auto_distinct",
    paletteReuse: null,
    paletteSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "alloy",
    resolvedPaletteId,
    updatedAt: timestamp,
  };
}

function branch(conversationId: string): ConversationBranch {
  return {
    childConversationId: conversationId,
    createdAt: timestamp,
    forkedAtTurnId: "turn_parent",
    kind: "fork",
    parentConversationId: "conversation_parent",
    providerMetadata: {},
    sourceTrajectorySequence: 1,
  };
}

function sideConversation(conversationId: string): SideConversation {
  return {
    createdAt: timestamp,
    disposedAt: null,
    failure: null,
    id: "side_a",
    parentConversationId: conversationId,
    parentPaneId: "pane_a",
    providerThreadId: "thread_side",
    resolvedSideAgentInvocation: resolvedInvocation("side_agent"),
    sourceProviderTurnId: "turn_provider",
    sourceTrajectorySequence: 1,
    status: "active",
    updatedAt: timestamp,
  };
}

function resolvedInvocation(role: Role): ResolvedInvocation {
  const requested = roleProfile(role);
  return {
    contextUsage: {
      estimatedInputTokens: 10,
      estimatedOutputTokens: 5,
      inputBytes: 40,
      outputBytes: 20,
    },
    endedAt: timestamp,
    failure: null,
    id: `invocation_${role}`,
    modelReroutes: [],
    outcome: "succeeded",
    provider: "codex",
    providerReferences: {
      requestId: null,
      responseId: null,
      threadId: null,
      turnId: null,
    },
    requested,
    resolved: {
      modelId: "gpt-test",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: null,
    },
    role,
    startedAt: timestamp,
  };
}

function roleProfile(role: Role): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 4_096,
      maxInputTokens: 1_024,
      reservedOutputTokens: 128,
    },
    modelSelection: { mode: "exact", modelId: "gpt-test" },
    permissionProfile: permissionProfile(),
    provider: "codex",
    reasoningEffort: "low",
    role,
    serviceTier: null,
  };
}

function permissionProfile(): PermissionProfile {
  return {
    approvalPolicy: "never",
    approvals: false,
    providerPermissionProfile: "read-only",
    toolAccess: { allowedTools: [], mode: "none" },
    workspaceMutation: false,
  };
}

function conversationStreamId(conversationId: string): string {
  return `conversation:${conversationId}`;
}
