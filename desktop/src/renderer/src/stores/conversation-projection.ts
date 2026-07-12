import {
  conversationSnapshotLimits,
  type ConversationEvent,
  type ConversationEventCursor,
  type ConversationEventPayload,
  type ConversationSnapshot,
} from "@generated/backend";

type ConversationProjectionStatus = "unloaded" | "loading" | "ready" | "error";

type ConversationResyncReason =
  | "collection_window_overflow"
  | "event_before_snapshot"
  | "event_schema_changed"
  | "event_sequence_gap"
  | "event_stream_changed"
  | "server_required";

interface ConversationResyncRequirement {
  detail: string;
  minimumCursor: ConversationEventCursor;
  reason: ConversationResyncReason;
}

export interface ConversationProjection {
  conversationId: string;
  error: string | null;
  resync: ConversationResyncRequirement | null;
  snapshot: ConversationSnapshot | null;
  status: ConversationProjectionStatus;
  workspaceId: string;
}

type ConversationEventType = ConversationEventPayload["type"];
type ConversationPayloadOf<Type extends ConversationEventType> = Extract<
  ConversationEventPayload,
  { type: Type }
>;
type ConversationPayloadHandlers = {
  [Type in ConversationEventType]: (
    snapshot: ConversationSnapshot,
    payload: ConversationPayloadOf<Type>,
  ) => ConversationSnapshot;
};

type AppliedConversationEventPayload = Exclude<
  ConversationEventPayload,
  { type: "conversation.resync_required" }
>;
type ConversationExecutionPayload = ConversationPayloadOf<
  | "conversation.updated"
  | "conversation.turn.updated"
  | "conversation.queue.updated"
  | "conversation.thread_binding.updated"
  | "conversation.trajectory.appended"
  | "conversation.artifact.created"
>;
type ConversationPresentationPayload = Exclude<
  AppliedConversationEventPayload,
  ConversationExecutionPayload
>;
type ProjectedConversationPresentationPayload = Exclude<
  ConversationPresentationPayload,
  { type: "conversation.invocation_attempted" }
>;

const conversationExecutionPayloadTypes = new Set<AppliedConversationEventPayload["type"]>([
  "conversation.updated",
  "conversation.turn.updated",
  "conversation.queue.updated",
  "conversation.thread_binding.updated",
  "conversation.trajectory.appended",
  "conversation.artifact.created",
]);

type EventCursorDisposition = "duplicate" | "next" | "sequence_gap" | "stream_changed";

export function loadingConversationProjection(
  current: ConversationProjection | undefined,
  workspaceId: string,
  conversationId: string,
): ConversationProjection {
  assertProjectionIdentity(current, workspaceId, conversationId);
  return {
    conversationId,
    error: null,
    resync: current?.resync ?? null,
    snapshot: current?.snapshot ?? null,
    status: "loading",
    workspaceId,
  };
}

export function failedConversationProjection(
  current: ConversationProjection | undefined,
  workspaceId: string,
  conversationId: string,
  error: unknown,
): ConversationProjection {
  assertProjectionIdentity(current, workspaceId, conversationId);
  return {
    conversationId,
    error: errorMessage(error),
    resync: current?.resync ?? null,
    snapshot: current?.snapshot ?? null,
    status: "error",
    workspaceId,
  };
}

export function hydratedConversationProjection(
  current: ConversationProjection | undefined,
  workspaceId: string,
  conversationId: string,
  snapshot: ConversationSnapshot,
): ConversationProjection {
  assertProjectionIdentity(current, workspaceId, conversationId);
  assertSnapshotIdentity(snapshot, workspaceId, conversationId);
  if (current?.resync && !cursorCovers(snapshot.eventCursor, current.resync.minimumCursor)) {
    return projectionAfterStaleSnapshot(current);
  }
  if (
    current?.snapshot &&
    current.resync?.reason !== "server_required" &&
    snapshotIsOlder(snapshot, current.snapshot)
  ) {
    return projectionAfterStaleSnapshot(current);
  }
  return {
    conversationId,
    error: null,
    resync: null,
    snapshot: cloneSnapshot(snapshot),
    status: "ready",
    workspaceId,
  };
}

export function applyConversationEvents(
  current: ReadonlyMap<string, ConversationProjection>,
  events: readonly ConversationEvent[],
): ReadonlyMap<string, ConversationProjection> {
  let next: Map<string, ConversationProjection> | null = null;
  for (const event of events) {
    const projections = next ?? current;
    const projection = projections.get(event.conversationId);
    const updated = applyConversationEvent(projection, event);
    if (updated !== projection) {
      next ??= new Map(current);
      next.set(event.conversationId, updated);
    }
  }
  return next ?? current;
}

function applyConversationEvent(
  current: ConversationProjection | undefined,
  event: ConversationEvent,
): ConversationProjection {
  assertEventEnvelope(current, event);
  if (!current) {
    return unloadedProjectionForEvent(event);
  }
  if (!current.snapshot) {
    return applyConversationEventBeforeHydration(current, event);
  }
  if (event.schemaVersion !== current.snapshot.schemaVersion) {
    return projectionWithTypedResync(current, schemaChangedRequirement(event));
  }
  if (event.payload.type === "conversation.resync_required") {
    return projectionWithTypedResync(current, serverResyncRequirement(event));
  }
  if (current.resync) {
    return projectionWithLaterResyncCursor(current, event);
  }
  const disposition = eventCursorDisposition(current.snapshot.eventCursor, event);
  if (disposition === "duplicate") {
    return current;
  }
  if (disposition !== "next") {
    return projectionWithResync(current, cursorRequirement(current.snapshot, event, disposition));
  }
  const overflow = collectionWindowOverflowRequirement(current.snapshot, event);
  if (overflow) {
    return projectionWithResync(current, overflow);
  }
  const snapshot = applyPayload(current.snapshot, event.payload);
  return {
    ...current,
    error: null,
    snapshot: { ...snapshot, eventCursor: cursorFromEvent(event) },
    status: "ready",
  };
}

function applyConversationEventBeforeHydration(
  current: ConversationProjection,
  event: ConversationEvent,
): ConversationProjection {
  if (event.payload.type === "conversation.resync_required") {
    return projectionWithTypedResync(current, serverResyncRequirement(event));
  }
  if (current.resync) {
    return projectionWithLaterResyncCursor(current, event);
  }
  return projectionWithResync(current, eventBeforeSnapshotRequirement(event));
}

const payloadHandlers = {
  "conversation.updated": (snapshot, payload) => {
    assertOwner("conversation.updated", payload.conversation.id, snapshot.conversation.id);
    assertOwner(
      "conversation.updated workspace",
      payload.conversation.workspaceId,
      snapshot.conversation.workspaceId,
    );
    return {
      ...snapshot,
      conversation: payload.conversation,
      sideConversations: snapshot.sideConversations.map((side) => ({
        ...side,
        parentStatus: payload.conversation.status,
      })),
    };
  },
  "conversation.turn.updated": (snapshot, payload) => {
    assertOwner("conversation.turn.updated", payload.turn.conversationId, snapshot.conversation.id);
    const turns = latestOrderedWindow(
      upsertOrdered(snapshot.turns.turns, payload.turn, (turn) => turn.acceptedAt),
      conversationSnapshotLimits.turns,
    );
    return {
      ...snapshot,
      turns: {
        hasEarlier: snapshot.turns.hasEarlier || turns.truncated,
        turns: turns.items,
      },
    };
  },
  "conversation.queue.updated": (snapshot, payload) => {
    if (payload.queue.length > conversationSnapshotLimits.queuedTurns) {
      throw new Error(
        `conversation.queue.updated exceeds ${conversationSnapshotLimits.queuedTurns} turns.`,
      );
    }
    for (const [index, queued] of payload.queue.entries()) {
      assertOwner("conversation.queue.updated", queued.conversationId, snapshot.conversation.id);
      if (queued.ordinal !== index + 1) {
        throw new Error("conversation.queue.updated is not a contiguous queue.");
      }
    }
    return { ...snapshot, queue: [...payload.queue] };
  },
  "conversation.thread_binding.updated": (snapshot, payload) => {
    assertOwner(
      "conversation.thread_binding.updated",
      payload.binding.conversationId,
      snapshot.conversation.id,
    );
    return { ...snapshot, threadBinding: payload.binding };
  },
  "conversation.trajectory.appended": (snapshot, payload) =>
    appendTrajectoryEvent(snapshot, payload.event),
  "conversation.artifact.created": (snapshot, payload) => {
    assertOwner(
      "conversation.artifact.created",
      payload.artifact.conversationId,
      snapshot.conversation.id,
    );
    const artifacts = latestOrderedWindow(
      upsertOrdered(
        snapshot.artifacts.artifacts,
        payload.artifact,
        (artifact) => artifact.createdAt,
      ),
      conversationSnapshotLimits.artifacts,
    );
    return {
      ...snapshot,
      artifacts: {
        artifacts: artifacts.items,
        hasEarlier: snapshot.artifacts.hasEarlier || artifacts.truncated,
      },
    };
  },
  "conversation.narrator_state.updated": (snapshot, payload) => {
    assertOwner(
      "conversation.narrator_state.updated",
      payload.state.conversationId,
      snapshot.conversation.id,
    );
    return { ...snapshot, narratorState: payload.state };
  },
  "conversation.narration.created": (snapshot, payload) => {
    assertOwner(
      "conversation.narration.created",
      payload.event.conversationId,
      snapshot.conversation.id,
    );
    const events = latestOrderedWindow(
      upsertOrdered(snapshot.narration.events, payload.event, (event) =>
        event.streamSequence.toString().padStart(16, "0"),
      ),
      conversationSnapshotLimits.narrationEvents,
    );
    return {
      ...snapshot,
      narration: {
        events: events.items,
        hasEarlier: snapshot.narration.hasEarlier || events.truncated,
      },
    };
  },
  "conversation.invocation_attempted": (snapshot) => snapshot,
  "conversation.role_profile_override.updated": (snapshot, payload) => {
    assertOwner(
      "conversation.role_profile_override.updated",
      payload.override.scopeId,
      snapshot.conversation.id,
    );
    if (payload.override.scopeKind !== "conversation") {
      throw new Error("conversation.role_profile_override.updated must use conversation scope.");
    }
    return {
      ...snapshot,
      roleProfileOverrides: upsertByKey(
        snapshot.roleProfileOverrides,
        payload.override,
        (override) => override.profile.role,
      ),
    };
  },
  "conversation.role_profile_override.removed": (snapshot, payload) => ({
    ...snapshot,
    roleProfileOverrides: snapshot.roleProfileOverrides.filter(
      (override) => override.profile.role !== payload.role,
    ),
  }),
  "conversation.presentation_profile.updated": (snapshot, payload) => {
    assertOwner(
      "conversation.presentation_profile.updated",
      payload.profile.conversationId,
      snapshot.conversation.id,
    );
    return { ...snapshot, presentationProfile: payload.profile };
  },
  "conversation.branch.created": (snapshot, payload) => {
    assertOwner(
      "conversation.branch.created",
      payload.branch.childConversationId,
      snapshot.conversation.id,
    );
    return { ...snapshot, branch: payload.branch };
  },
  "conversation.side_conversation.updated": (snapshot, payload) => {
    assertOwner(
      "conversation.side_conversation.updated",
      payload.sideConversation.parentConversationId,
      snapshot.conversation.id,
    );
    if (payload.sideConversation.parentStatus !== snapshot.conversation.status) {
      throw new Error(
        `conversation.side_conversation.updated parent status ${payload.sideConversation.parentStatus} does not match ${snapshot.conversation.status}.`,
      );
    }
    return {
      ...snapshot,
      sideConversations: upsertOrdered(
        snapshot.sideConversations,
        payload.sideConversation,
        (side) => side.createdAt,
      ),
    };
  },
  "conversation.side_event.appended": (snapshot, payload) => {
    assertOwner(
      "conversation.side_event.appended",
      payload.event.parentConversationId,
      snapshot.conversation.id,
    );
    const side = snapshot.sideConversations.find(
      (candidate) => candidate.id === payload.event.sideConversationId,
    );
    if (!side) {
      throw new Error("conversation.side_event.appended has no projected side conversation.");
    }
    assertOwner(
      "conversation.side_event.appended trajectory",
      payload.event.event.conversationId,
      side.id,
    );
    if (payload.event.event.sequence !== side.lastEventSequence) {
      throw new Error(
        `conversation.side_event.appended sequence ${payload.event.event.sequence} does not match side sequence ${side.lastEventSequence}.`,
      );
    }
    const previousEvent = snapshot.sideEvents.events.at(-1);
    if (previousEvent && payload.event.streamSequence <= previousEvent.streamSequence) {
      throw new Error(
        `conversation.side_event.appended stream sequence ${payload.event.streamSequence} does not follow ${previousEvent.streamSequence}.`,
      );
    }
    if (snapshot.sideEvents.events.some((event) => event.event.id === payload.event.event.id)) {
      throw new Error(
        `conversation.side_event.appended duplicates event ${payload.event.event.id}.`,
      );
    }
    const events = [...snapshot.sideEvents.events, payload.event];
    const overflow = Math.max(0, events.length - snapshot.sideEvents.limit);
    return {
      ...snapshot,
      sideEvents: {
        events: overflow > 0 ? events.slice(overflow) : events,
        hasEarlier: snapshot.sideEvents.hasEarlier || overflow > 0,
        limit: snapshot.sideEvents.limit,
      },
    };
  },
  "conversation.resync_required": (snapshot) => snapshot,
} satisfies ConversationPayloadHandlers;

function applyPayload(
  snapshot: ConversationSnapshot,
  payload: AppliedConversationEventPayload,
): ConversationSnapshot {
  if (isConversationExecutionPayload(payload)) {
    return applyExecutionPayload(snapshot, payload);
  }
  return applyPresentationPayload(snapshot, payload);
}

function isConversationExecutionPayload(
  payload: AppliedConversationEventPayload,
): payload is ConversationExecutionPayload {
  return conversationExecutionPayloadTypes.has(payload.type);
}

function applyExecutionPayload(
  snapshot: ConversationSnapshot,
  payload: ConversationExecutionPayload,
): ConversationSnapshot {
  switch (payload.type) {
    case "conversation.updated":
      return payloadHandlers["conversation.updated"](snapshot, payload);
    case "conversation.turn.updated":
      return payloadHandlers["conversation.turn.updated"](snapshot, payload);
    case "conversation.queue.updated":
      return payloadHandlers["conversation.queue.updated"](snapshot, payload);
    case "conversation.thread_binding.updated":
      return payloadHandlers["conversation.thread_binding.updated"](snapshot, payload);
    case "conversation.trajectory.appended":
      return payloadHandlers["conversation.trajectory.appended"](snapshot, payload);
    case "conversation.artifact.created":
      return payloadHandlers["conversation.artifact.created"](snapshot, payload);
    default:
      return assertNever(payload);
  }
}

function applyPresentationPayload(
  snapshot: ConversationSnapshot,
  payload: ConversationPresentationPayload,
): ConversationSnapshot {
  if (payload.type === "conversation.invocation_attempted") {
    return payloadHandlers["conversation.invocation_attempted"](snapshot);
  }
  return applyProjectedPresentationPayload(snapshot, payload);
}

function applyProjectedPresentationPayload(
  snapshot: ConversationSnapshot,
  payload: ProjectedConversationPresentationPayload,
): ConversationSnapshot {
  switch (payload.type) {
    case "conversation.narrator_state.updated":
      return payloadHandlers["conversation.narrator_state.updated"](snapshot, payload);
    case "conversation.narration.created":
      return payloadHandlers["conversation.narration.created"](snapshot, payload);
    case "conversation.role_profile_override.updated":
      return payloadHandlers["conversation.role_profile_override.updated"](snapshot, payload);
    case "conversation.role_profile_override.removed":
      return payloadHandlers["conversation.role_profile_override.removed"](snapshot, payload);
    case "conversation.presentation_profile.updated":
      return payloadHandlers["conversation.presentation_profile.updated"](snapshot, payload);
    case "conversation.branch.created":
      return payloadHandlers["conversation.branch.created"](snapshot, payload);
    case "conversation.side_conversation.updated":
      return payloadHandlers["conversation.side_conversation.updated"](snapshot, payload);
    case "conversation.side_event.appended":
      return payloadHandlers["conversation.side_event.appended"](snapshot, payload);
    default:
      return assertNever(payload);
  }
}

function appendTrajectoryEvent(
  snapshot: ConversationSnapshot,
  event: ConversationPayloadOf<"conversation.trajectory.appended">["event"],
): ConversationSnapshot {
  assertOwner("conversation.trajectory.appended", event.conversationId, snapshot.conversation.id);
  const previousEvent = snapshot.trajectory.events.at(-1);
  const expectedSequence = (previousEvent?.sequence ?? 0) + 1;
  if (event.sequence !== expectedSequence) {
    throw new Error(
      `conversation.trajectory.appended sequence ${event.sequence} does not follow ${expectedSequence - 1}`,
    );
  }
  const events = [...snapshot.trajectory.events, event];
  const overflow = Math.max(0, events.length - conversationSnapshotLimits.trajectoryEvents);
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      lastTrajectorySequence: Math.max(
        snapshot.conversation.lastTrajectorySequence,
        event.sequence,
      ),
    },
    trajectory: {
      events: overflow > 0 ? events.slice(overflow) : events,
      hasEarlier: snapshot.trajectory.hasEarlier || overflow > 0,
    },
  };
}

function cloneSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  return {
    ...snapshot,
    artifacts: { ...snapshot.artifacts, artifacts: [...snapshot.artifacts.artifacts] },
    narration: { ...snapshot.narration, events: [...snapshot.narration.events] },
    queue: [...snapshot.queue],
    roleProfileOverrides: [...snapshot.roleProfileOverrides],
    sideConversations: [...snapshot.sideConversations],
    sideEvents: { ...snapshot.sideEvents, events: [...snapshot.sideEvents.events] },
    trajectory: { ...snapshot.trajectory, events: [...snapshot.trajectory.events] },
    turns: { ...snapshot.turns, turns: [...snapshot.turns.turns] },
  };
}

function upsertOrdered<Item extends { id: string }>(
  current: readonly Item[],
  item: Item,
  order: (item: Item) => string,
): Item[] {
  const next = current.filter((candidate) => candidate.id !== item.id);
  next.push(item);
  next.sort(
    (left, right) => order(left).localeCompare(order(right)) || left.id.localeCompare(right.id),
  );
  return next;
}

function upsertByKey<Item>(
  current: readonly Item[],
  item: Item,
  key: (item: Item) => string,
): Item[] {
  const itemKey = key(item);
  const next = current.filter((candidate) => key(candidate) !== itemKey);
  next.push(item);
  next.sort((left, right) => key(left).localeCompare(key(right)));
  return next;
}

function latestOrderedWindow<Item>(
  items: Item[],
  limit: number,
): { items: Item[]; truncated: boolean } {
  const overflow = Math.max(0, items.length - limit);
  return {
    items: overflow > 0 ? items.slice(overflow) : items,
    truncated: overflow > 0,
  };
}

function eventCursorDisposition(
  cursor: ConversationEventCursor,
  event: ConversationEvent,
): EventCursorDisposition {
  if (event.streamId !== cursor.streamId) {
    return "stream_changed";
  }
  if (event.sequence <= cursor.sequence) {
    return "duplicate";
  }
  return event.sequence === cursor.sequence + 1 ? "next" : "sequence_gap";
}

function cursorRequirement(
  snapshot: ConversationSnapshot,
  event: ConversationEvent,
  disposition: Exclude<EventCursorDisposition, "duplicate" | "next">,
): ConversationResyncRequirement {
  if (disposition === "stream_changed") {
    return {
      detail: `Conversation event stream changed from ${snapshot.eventCursor.streamId} to ${event.streamId}.`,
      minimumCursor: cursorFromEvent(event),
      reason: "event_stream_changed",
    };
  }
  return {
    detail: `Expected conversation event ${snapshot.eventCursor.sequence + 1}, received ${event.sequence}.`,
    minimumCursor: cursorFromEvent(event),
    reason: "event_sequence_gap",
  };
}

function collectionWindowOverflowRequirement(
  snapshot: ConversationSnapshot,
  event: ConversationEvent,
): ConversationResyncRequirement | null {
  const payload = event.payload;
  if (
    payload.type === "conversation.side_conversation.updated" &&
    snapshot.sideConversations.length >= conversationSnapshotLimits.sideConversations &&
    !snapshot.sideConversations.some((side) => side.id === payload.sideConversation.id)
  ) {
    return {
      detail: `Conversation side window reached ${conversationSnapshotLimits.sideConversations} records and requires backend reselection.`,
      minimumCursor: cursorFromEvent(event),
      reason: "collection_window_overflow",
    };
  }
  if (
    payload.type === "conversation.role_profile_override.updated" &&
    snapshot.roleProfileOverrides.length >= conversationSnapshotLimits.roleProfileOverrides &&
    !snapshot.roleProfileOverrides.some(
      (override) => override.profile.role === payload.override.profile.role,
    )
  ) {
    return {
      detail: `Conversation role override window reached ${conversationSnapshotLimits.roleProfileOverrides} records and requires backend reselection.`,
      minimumCursor: cursorFromEvent(event),
      reason: "collection_window_overflow",
    };
  }
  return null;
}

function eventBeforeSnapshotRequirement(event: ConversationEvent): ConversationResyncRequirement {
  return {
    detail: `Conversation event ${event.eventId} arrived before its bounded snapshot.`,
    minimumCursor: minimumCursorForEvent(event),
    reason: "event_before_snapshot",
  };
}

function schemaChangedRequirement(event: ConversationEvent): ConversationResyncRequirement {
  return {
    detail: `Conversation event ${event.eventId} uses a different contract schema version.`,
    minimumCursor: minimumCursorForEvent(event),
    reason: "event_schema_changed",
  };
}

function serverResyncRequirement(event: ConversationEvent): ConversationResyncRequirement {
  const payload = event.payload;
  if (payload.type !== "conversation.resync_required") {
    throw new Error(`Expected a conversation resync payload for ${event.eventId}.`);
  }
  return {
    detail: payload.reason,
    minimumCursor: {
      sequence: payload.currentSequence,
      streamId: payload.currentStreamId,
    },
    reason: "server_required",
  };
}

function unloadedProjectionForEvent(event: ConversationEvent): ConversationProjection {
  return {
    conversationId: event.conversationId,
    error: null,
    resync:
      event.payload.type === "conversation.resync_required"
        ? serverResyncRequirement(event)
        : eventBeforeSnapshotRequirement(event),
    snapshot: null,
    status: "unloaded",
    workspaceId: event.workspaceId,
  };
}

function projectionWithResync(
  current: ConversationProjection,
  resync: ConversationResyncRequirement,
): ConversationProjection {
  return { ...current, resync };
}

function projectionWithTypedResync(
  current: ConversationProjection,
  requirement: ConversationResyncRequirement,
): ConversationProjection {
  if (requirement.reason === "server_required") {
    return projectionWithServerResync(current, requirement);
  }
  return projectionWithLocalResync(current, requirement);
}

function projectionWithServerResync(
  current: ConversationProjection,
  requirement: ConversationResyncRequirement,
): ConversationProjection {
  const existing = current.resync;
  if (
    existing?.reason === requirement.reason &&
    existing.detail === requirement.detail &&
    cursorsEqual(existing.minimumCursor, requirement.minimumCursor)
  ) {
    return current;
  }
  return projectionWithResync(current, requirement);
}

function projectionWithLocalResync(
  current: ConversationProjection,
  requirement: ConversationResyncRequirement,
): ConversationProjection {
  const existing = current.resync;
  if (!existing) {
    return projectionWithoutExistingResync(current, requirement);
  }
  return projectionWithExistingResync(current, existing, requirement);
}

function projectionWithoutExistingResync(
  current: ConversationProjection,
  requirement: ConversationResyncRequirement,
): ConversationProjection {
  if (current.snapshot && cursorCovers(current.snapshot.eventCursor, requirement.minimumCursor)) {
    return current;
  }
  return projectionWithResync(current, requirement);
}

function projectionWithExistingResync(
  current: ConversationProjection,
  existing: ConversationResyncRequirement,
  requirement: ConversationResyncRequirement,
): ConversationProjection {
  if (existing.minimumCursor.streamId !== requirement.minimumCursor.streamId) {
    return projectionWithResync(current, requirement);
  }
  if (existing.minimumCursor.sequence > requirement.minimumCursor.sequence) {
    return current;
  }
  if (
    existing.minimumCursor.sequence === requirement.minimumCursor.sequence &&
    existing.detail === requirement.detail &&
    existing.reason === requirement.reason
  ) {
    return current;
  }
  return projectionWithResync(current, requirement);
}

function cursorsEqual(left: ConversationEventCursor, right: ConversationEventCursor): boolean {
  return left.streamId === right.streamId && left.sequence === right.sequence;
}

function projectionWithLaterResyncCursor(
  current: ConversationProjection,
  event: ConversationEvent,
): ConversationProjection {
  const minimumCursor = minimumCursorForEvent(event);
  if (cursorCovers(current.resync!.minimumCursor, minimumCursor)) {
    return current;
  }
  if (minimumCursor.streamId !== current.resync!.minimumCursor.streamId) {
    return projectionWithResync(current, cursorRequirementForResyncStream(current, event));
  }
  return {
    ...current,
    resync: { ...current.resync!, minimumCursor },
  };
}

function cursorRequirementForResyncStream(
  current: ConversationProjection,
  event: ConversationEvent,
): ConversationResyncRequirement {
  return {
    detail: `Conversation event stream changed from ${current.resync!.minimumCursor.streamId} to ${event.streamId} while resynchronizing.`,
    minimumCursor: minimumCursorForEvent(event),
    reason: "event_stream_changed",
  };
}

function minimumCursorForEvent(event: ConversationEvent): ConversationEventCursor {
  if (event.payload.type === "conversation.resync_required") {
    return {
      sequence: event.payload.currentSequence,
      streamId: event.payload.currentStreamId,
    };
  }
  return cursorFromEvent(event);
}

function cursorFromEvent(event: ConversationEvent): ConversationEventCursor {
  return { sequence: event.sequence, streamId: event.streamId };
}

function cursorCovers(actual: ConversationEventCursor, minimum: ConversationEventCursor): boolean {
  return actual.streamId === minimum.streamId && actual.sequence >= minimum.sequence;
}

function snapshotIsOlder(incoming: ConversationSnapshot, current: ConversationSnapshot): boolean {
  return (
    incoming.eventCursor.streamId === current.eventCursor.streamId &&
    incoming.eventCursor.sequence < current.eventCursor.sequence
  );
}

function projectionAfterStaleSnapshot(current: ConversationProjection): ConversationProjection {
  const status = current.snapshot ? "ready" : "unloaded";
  if (current.error === null && current.status === status) {
    return current;
  }
  return {
    ...current,
    error: null,
    status,
  };
}

function assertProjectionIdentity(
  current: ConversationProjection | undefined,
  workspaceId: string,
  conversationId: string,
): void {
  if (
    current &&
    (current.workspaceId !== workspaceId || current.conversationId !== conversationId)
  ) {
    throw new Error(
      `Conversation ${conversationId} is already owned by another workspace projection.`,
    );
  }
}

function assertSnapshotIdentity(
  snapshot: ConversationSnapshot,
  workspaceId: string,
  conversationId: string,
): void {
  assertOwner("conversation snapshot", snapshot.conversation.id, conversationId);
  assertOwner("conversation snapshot workspace", snapshot.conversation.workspaceId, workspaceId);
}

function assertEventEnvelope(
  current: ConversationProjection | undefined,
  event: ConversationEvent,
): void {
  if (current) {
    assertOwner("conversation event", event.conversationId, current.conversationId);
    assertOwner("conversation event workspace", event.workspaceId, current.workspaceId);
  }
}

function assertOwner(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`${label} belongs to ${actual}, expected ${expected}.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation snapshot load failed";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported conversation event payload: ${JSON.stringify(value)}`);
}
