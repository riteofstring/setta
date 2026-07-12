import type { ConversationEvent, ConversationSnapshot } from "@generated/backend";

import type { ConversationProjection } from "./conversation-projection";
import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { useConversationStore } from "./conversation-store";

interface RetainedConversationProjection {
  generation: number;
  references: number;
}

const retainedProjections = new Map<string, RetainedConversationProjection>();
const resyncs = new Map<string, Promise<void>>();
let generation = 0;

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
  useConversationStore.getState().applyEvent(event);
  useConversationNavigatorStore.getState().applyEvent(event);
  const projection = useConversationStore.getState().conversations.get(event.conversationId);
  if (projection?.resync) {
    void resyncConversationProjection(event.workspaceId, event.conversationId);
  }
}

export function hydrateConversationProjectionSnapshot(snapshot: ConversationSnapshot): void {
  const { id: conversationId, workspaceId } = snapshot.conversation;
  useConversationStore.getState().hydrateSnapshot(workspaceId, conversationId, snapshot);
  useConversationNavigatorStore.getState().upsertSnapshot(snapshot);
}

export function resetConversationProjectionRuntime(): void {
  generation += 1;
  retainedProjections.clear();
  resyncs.clear();
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
  const snapshot = useConversationStore.getState().conversations.get(conversationId)?.snapshot;
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
