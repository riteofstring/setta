import type { ConversationEvent, ConversationSnapshot } from "@generated/backend";

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
  const status = useConversationStore.getState().conversations.get(conversationId)?.snapshot
    ?.conversation.status;
  void window.setta.conversations
    .release({
      conversationId,
      keepAlive: status === "working" || status === "waiting_for_approval",
      workspaceId,
    })
    .catch((error: unknown) => {
      console.error(`Failed to release conversation stream ${conversationId}`, error);
    });
}

function resyncConversationProjection(workspaceId: string, conversationId: string): Promise<void> {
  const key = projectionKey(workspaceId, conversationId);
  const current = resyncs.get(key);
  if (current) {
    return current;
  }
  const resync = window.setta.conversations
    .read({ conversationId, workspaceId })
    .then((snapshot) => hydrateConversationProjectionSnapshot(snapshot))
    .catch((error: unknown) => {
      useConversationStore.getState().failSnapshotLoad(workspaceId, conversationId, error);
    })
    .finally(() => {
      resyncs.delete(key);
    });
  resyncs.set(key, resync);
  return resync;
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
