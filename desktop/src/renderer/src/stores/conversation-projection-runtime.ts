import type { ConversationEvent, ConversationSnapshot } from "@generated/backend";

import { applyConversationEvents, type ConversationProjection } from "./conversation-projection";
import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { useConversationStore } from "./conversation-store";

interface RetainedConversationProjection {
  generation: number;
  references: number;
}

interface ScheduledProjectionFlush {
  cancel: () => void;
}

const maximumConversationEventsPerFrame = 128;
const maximumConversationEventFrameWaitMs = 50;
const pendingEvents: ConversationEvent[] = [];
const retainedProjections = new Map<string, RetainedConversationProjection>();
const resyncs = new Map<string, Promise<void>>();
let generation = 0;
let scheduledFlush: ScheduledProjectionFlush | null = null;

export function retainConversationProjection(
  workspaceId: string,
  conversationId: string,
): () => void {
  const key = projectionKey(workspaceId, conversationId);
  const current = retainedProjections.get(key);
  if (current) {
    current.references += 1;
  } else {
    const retained = { generation, references: 1 };
    retainedProjections.set(key, retained);
    void loadAndSubscribe(workspaceId, conversationId, retained);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseConversationProjection(key, workspaceId, conversationId);
  };
}

export function handleConversationProjectionEvent(event: ConversationEvent): void {
  handleConversationProjectionEvents([event]);
}

export function enqueueConversationProjectionEvent(event: ConversationEvent): void {
  pendingEvents.push(event);
  scheduleProjectionFlush();
}

export function queuedConversationProjectionEventsBefore(
  event: ConversationEvent,
): readonly ConversationEvent[] {
  return pendingEvents.filter(
    (candidate) =>
      candidate.workspaceId === event.workspaceId &&
      candidate.conversationId === event.conversationId &&
      candidate.streamId === event.streamId &&
      candidate.sequence < event.sequence,
  );
}

function handleConversationProjectionEvents(events: readonly ConversationEvent[]): void {
  if (events.length === 0) {
    return;
  }
  useConversationStore.getState().applyEvents(events);
  useConversationNavigatorStore.getState().applyEvents(events);
  const affected = new Map<string, { conversationId: string; workspaceId: string }>();
  for (const event of events) {
    affected.set(projectionKey(event.workspaceId, event.conversationId), {
      conversationId: event.conversationId,
      workspaceId: event.workspaceId,
    });
  }
  const projections = useConversationStore.getState().conversations;
  for (const target of affected.values()) {
    if (projections.get(target.conversationId)?.resync) {
      void resyncConversationProjection(target.workspaceId, target.conversationId);
    }
  }
}

export function hydrateConversationProjectionSnapshot(snapshot: ConversationSnapshot): void {
  const { id: conversationId, workspaceId } = snapshot.conversation;
  useConversationStore.getState().hydrateSnapshot(workspaceId, conversationId, snapshot);
  useConversationNavigatorStore.getState().upsertSnapshot(snapshot);
}

export function resetConversationProjectionRuntime(): void {
  generation += 1;
  scheduledFlush?.cancel();
  scheduledFlush = null;
  pendingEvents.length = 0;
  retainedProjections.clear();
  resyncs.clear();
}

function scheduleProjectionFlush(): void {
  if (scheduledFlush) {
    return;
  }
  const flushGeneration = generation;
  let finished = false;
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  const setFrameTimeout = window.setTimeout.bind(window);
  const clearFrameTimeout = window.clearTimeout.bind(window);
  const complete = () => {
    if (finished) {
      return;
    }
    finished = true;
    cancelFrame(frameId);
    clearFrameTimeout(timeoutId);
    scheduledFlush = null;
    if (flushGeneration !== generation) {
      return;
    }
    const events = pendingEvents.splice(0, maximumConversationEventsPerFrame);
    handleConversationProjectionEvents(events);
    if (pendingEvents.length > 0) {
      scheduleProjectionFlush();
    }
  };
  const frameId = requestFrame(complete);
  const timeoutId = setFrameTimeout(complete, maximumConversationEventFrameWaitMs);
  scheduledFlush = {
    cancel: () => {
      if (finished) {
        return;
      }
      finished = true;
      cancelFrame(frameId);
      clearFrameTimeout(timeoutId);
    },
  };
}

async function loadAndSubscribe(
  workspaceId: string,
  conversationId: string,
  retained: RetainedConversationProjection,
): Promise<void> {
  useConversationStore.getState().beginSnapshotLoad(workspaceId, conversationId);
  try {
    const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
    if (!projectionIsRetained(workspaceId, conversationId, retained)) {
      return;
    }
    hydrateConversationProjectionSnapshot(snapshot);
    await window.setta.conversations.subscribe({
      conversationId,
      cursor: snapshot.eventCursor,
      workspaceId,
    });
  } catch (error) {
    if (projectionIsRetained(workspaceId, conversationId, retained)) {
      useConversationStore.getState().failSnapshotLoad(workspaceId, conversationId, error);
    }
  }
}

function releaseConversationProjection(
  key: string,
  workspaceId: string,
  conversationId: string,
): void {
  const retained = retainedProjections.get(key);
  if (!retained) {
    return;
  }
  retained.references -= 1;
  if (retained.references > 0) {
    return;
  }
  retainedProjections.delete(key);
  const snapshot = conversationSnapshotIncludingQueuedEvents(workspaceId, conversationId);
  void window.setta.conversations
    .release({
      conversationId,
      keepAlive: snapshot ? conversationProjectionNeedsKeepAlive(snapshot) : false,
      workspaceId,
    })
    .catch((error: unknown) => {
      console.error(`Failed to release conversation stream ${conversationId}`, error);
    });
}

function conversationSnapshotIncludingQueuedEvents(
  workspaceId: string,
  conversationId: string,
): ConversationSnapshot | null | undefined {
  const conversations = useConversationStore.getState().conversations;
  const events = pendingEvents.filter(
    (event) => event.workspaceId === workspaceId && event.conversationId === conversationId,
  );
  if (events.length === 0) {
    return conversations.get(conversationId)?.snapshot;
  }
  return applyConversationEvents(conversations, events).get(conversationId)?.snapshot;
}

export function conversationProjectionNeedsKeepAlive(snapshot: ConversationSnapshot): boolean {
  if (!snapshot.presentationProfile.narratorSpeechEnabled) {
    return false;
  }
  const status = snapshot.conversation.status;
  if (status === "working" || status === "waiting_for_approval") {
    return true;
  }
  if (snapshot.narratorState.degradation?.retryable === false) {
    return false;
  }
  const latestTurn = snapshot.turns.turns.at(-1);
  if (!latestTurn) {
    return false;
  }
  return !snapshot.narration.events.some(
    (event) => event.kind === "final_summary" && event.turnId === latestTurn.id,
  );
}

function resyncConversationProjection(workspaceId: string, conversationId: string): Promise<void> {
  const key = projectionKey(workspaceId, conversationId);
  const current = resyncs.get(key);
  if (current) {
    return current;
  }
  const requestGeneration = generation;
  const resync = refreshConversationProjectionUntilCurrent(
    workspaceId,
    conversationId,
    requestGeneration,
  )
    .catch((error: unknown) => {
      if (requestGeneration === generation) {
        useConversationStore.getState().failSnapshotLoad(workspaceId, conversationId, error);
      }
    })
    .finally(() => {
      if (requestGeneration === generation) {
        resyncs.delete(key);
      }
    });
  resyncs.set(key, resync);
  return resync;
}

async function refreshConversationProjectionUntilCurrent(
  workspaceId: string,
  conversationId: string,
  requestGeneration: number,
): Promise<void> {
  while (requestGeneration === generation) {
    const before = useConversationStore.getState().conversations.get(conversationId)?.resync;
    if (!before) {
      return;
    }
    const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
    if (requestGeneration !== generation) {
      return;
    }
    hydrateConversationProjectionSnapshot(snapshot);
    const after = useConversationStore.getState().conversations.get(conversationId)?.resync;
    if (!after) {
      return;
    }
    if (resyncRequirementsEqual(before, after)) {
      throw new Error(
        `Conversation snapshot cursor ${snapshot.eventCursor.streamId}:${snapshot.eventCursor.sequence} did not satisfy resync cursor ${after.minimumCursor.streamId}:${after.minimumCursor.sequence}.`,
      );
    }
  }
}

function resyncRequirementsEqual(
  left: NonNullable<ConversationProjection["resync"]>,
  right: NonNullable<ConversationProjection["resync"]>,
): boolean {
  return (
    left.reason === right.reason &&
    left.minimumCursor.streamId === right.minimumCursor.streamId &&
    left.minimumCursor.sequence === right.minimumCursor.sequence
  );
}

function projectionIsRetained(
  workspaceId: string,
  conversationId: string,
  retained: RetainedConversationProjection,
): boolean {
  return (
    retained.generation === generation &&
    retainedProjections.get(projectionKey(workspaceId, conversationId)) === retained
  );
}

function projectionKey(workspaceId: string, conversationId: string): string {
  return `${workspaceId}\u0000${conversationId}`;
}
