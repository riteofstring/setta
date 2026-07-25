import type { ConversationEvent, ConversationSnapshot } from "@generated/backend";
import { useSyncExternalStore } from "react";

import { applyConversationEvents, type ConversationProjection } from "./conversation-projection";
import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { useConversationStore } from "./conversation-store";

interface RetainedConversationProjection {
  conversationId: string;
  generation: number;
  references: number;
  sawActiveWork: boolean;
  workspaceId: string | null;
}

interface ScheduledProjectionFlush {
  cancel: () => void;
}

type ConversationEventRelease = (request: {
  conversationId: string;
  keepAlive: boolean;
  workspaceId: string | null;
}) => Promise<void>;

const maximumConversationEventsPerFrame = 128;
const maximumConversationEventFrameWaitMs = 50;
const pendingEvents: ConversationEvent[] = [];
const retainedProjections = new Map<string, RetainedConversationProjection>();
const resyncs = new Map<string, Promise<void>>();
const runtimeGenerationListeners = new Set<() => void>();
let generation = 0;
let scheduledFlush: ScheduledProjectionFlush | null = null;

export function retainConversationProjection(
  workspaceId: string | null,
  conversationId: string,
): () => void {
  const key = projectionKey(workspaceId, conversationId);
  const current = retainedProjections.get(key);
  let retained: RetainedConversationProjection;
  if (current) {
    current.references += 1;
    retained = current;
  } else {
    retained = {
      conversationId,
      generation,
      references: 1,
      sawActiveWork: false,
      workspaceId,
    };
    retainedProjections.set(key, retained);
    void loadAndSubscribe(workspaceId, conversationId, retained);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseConversationProjection(key, workspaceId, conversationId, retained);
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
  const affected = new Map<string, { conversationId: string; workspaceId: string | null }>();
  for (const event of events) {
    markRetainedActiveWork(event);
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
  releaseRetainedConversationProjections();
  retainedProjections.clear();
  resyncs.clear();
  emitRuntimeGenerationChange();
}

export function useConversationProjectionRuntimeGeneration(): number {
  return useSyncExternalStore(
    subscribeRuntimeGeneration,
    conversationProjectionRuntimeGeneration,
    conversationProjectionRuntimeGeneration,
  );
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
  workspaceId: string | null,
  conversationId: string,
  retained: RetainedConversationProjection,
): Promise<void> {
  useConversationStore.getState().beginSnapshotLoad(workspaceId, conversationId);
  try {
    const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
    if (!projectionIsRetained(workspaceId, conversationId, retained)) {
      return;
    }
    retained.sawActiveWork =
      retained.sawActiveWork || conversationHasActiveWork(snapshot.conversation.status);
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
  workspaceId: string | null,
  conversationId: string,
  retained: RetainedConversationProjection,
): void {
  if (retainedProjections.get(key) !== retained) {
    return;
  }
  retained.references -= 1;
  if (retained.references > 0) {
    return;
  }
  retainedProjections.delete(key);
  const queuedEvents = queuedConversationProjectionEvents(workspaceId, conversationId);
  const snapshot = conversationSnapshotIncludingQueuedEvents(
    workspaceId,
    conversationId,
    queuedEvents,
  );
  const observedLiveWork = retained.sawActiveWork || queuedEvents.some(eventHasActiveWork);
  releaseConversationEvents({
    conversationId,
    keepAlive: snapshot ? conversationProjectionNeedsKeepAlive(snapshot, observedLiveWork) : false,
    workspaceId,
  });
}

function releaseRetainedConversationProjections(): void {
  for (const retained of retainedProjections.values()) {
    releaseConversationEvents({
      conversationId: retained.conversationId,
      keepAlive: false,
      workspaceId: retained.workspaceId,
    });
  }
}

function releaseConversationEvents(request: {
  conversationId: string;
  keepAlive: boolean;
  workspaceId: string | null;
}): void {
  const release = conversationEventRelease();
  if (!release) {
    return;
  }
  void release(request).catch((error: unknown) => {
    console.error(`Failed to release conversation stream ${request.conversationId}`, error);
  });
}

function conversationEventRelease(): ConversationEventRelease | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta.conversations.release;
}

function conversationSnapshotIncludingQueuedEvents(
  workspaceId: string | null,
  conversationId: string,
  events = queuedConversationProjectionEvents(workspaceId, conversationId),
): ConversationSnapshot | null | undefined {
  const conversations = useConversationStore.getState().conversations;
  if (events.length === 0) {
    return conversations.get(conversationId)?.snapshot;
  }
  return applyConversationEvents(conversations, events).get(conversationId)?.snapshot;
}

export function conversationProjectionNeedsKeepAlive(
  snapshot: ConversationSnapshot,
  observedLiveWork = false,
): boolean {
  if (!snapshot.presentationProfile.narratorSpeechEnabled) {
    return false;
  }
  const status = snapshot.conversation.status;
  if (conversationHasActiveWork(status)) {
    return true;
  }
  return observedLiveWork && terminalTurnMissingFinalNarration(snapshot);
}

function markRetainedActiveWork(event: ConversationEvent): void {
  if (!eventHasActiveWork(event)) {
    return;
  }
  const retained = retainedProjections.get(projectionKey(event.workspaceId, event.conversationId));
  if (retained) {
    retained.sawActiveWork = true;
  }
}

function queuedConversationProjectionEvents(
  workspaceId: string | null,
  conversationId: string,
): ConversationEvent[] {
  return pendingEvents.filter(
    (event) => event.workspaceId === workspaceId && event.conversationId === conversationId,
  );
}

function eventHasActiveWork(event: ConversationEvent): boolean {
  return (
    event.payload.type === "conversation.updated" &&
    conversationHasActiveWork(event.payload.conversation.status)
  );
}

function conversationHasActiveWork(
  status: ConversationSnapshot["conversation"]["status"],
): boolean {
  return status === "working" || status === "waiting_for_approval";
}

function terminalTurnMissingFinalNarration(snapshot: ConversationSnapshot): boolean {
  const summarizedTurnIds = new Set(
    snapshot.narration.events
      .filter((event) => event.kind === "final_summary" && event.turnId)
      .map((event) => event.turnId),
  );
  let latestTerminalTurnId: string | null = null;
  for (const turn of snapshot.turns.turns) {
    if (turn.status === "completed" || turn.status === "cancelled" || turn.status === "failed") {
      latestTerminalTurnId = turn.id;
    }
  }
  return latestTerminalTurnId !== null && !summarizedTurnIds.has(latestTerminalTurnId);
}

function resyncConversationProjection(
  workspaceId: string | null,
  conversationId: string,
): Promise<void> {
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
  workspaceId: string | null,
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
  workspaceId: string | null,
  conversationId: string,
  retained: RetainedConversationProjection,
): boolean {
  return (
    retained.generation === generation &&
    retainedProjections.get(projectionKey(workspaceId, conversationId)) === retained
  );
}

function projectionKey(workspaceId: string | null, conversationId: string): string {
  return `${workspaceId ?? "folderless"}\u0000${conversationId}`;
}

function subscribeRuntimeGeneration(listener: () => void): () => void {
  runtimeGenerationListeners.add(listener);
  return () => {
    runtimeGenerationListeners.delete(listener);
  };
}

function conversationProjectionRuntimeGeneration(): number {
  return generation;
}

function emitRuntimeGenerationChange(): void {
  for (const listener of runtimeGenerationListeners) {
    listener();
  }
}
