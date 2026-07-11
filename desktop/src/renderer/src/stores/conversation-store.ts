import type { ConversationEvent, ConversationSnapshot } from "@generated/backend";
import { create } from "zustand";

import {
  applyConversationEvents,
  failedConversationProjection,
  hydratedConversationProjection,
  loadingConversationProjection,
  type ConversationProjection,
} from "./conversation-projection";

interface ConversationStoreActions {
  applyEvent: (event: ConversationEvent) => void;
  applyEvents: (events: readonly ConversationEvent[]) => void;
  beginSnapshotLoad: (workspaceId: string, conversationId: string) => void;
  failSnapshotLoad: (workspaceId: string, conversationId: string, error: unknown) => void;
  hydrateSnapshot: (
    workspaceId: string,
    conversationId: string,
    snapshot: ConversationSnapshot,
  ) => void;
  removeConversation: (conversationId: string) => void;
  removeWorkspace: (workspaceId: string) => void;
  reset: () => void;
}

export interface ConversationStoreData {
  // Replacing one immutable projection keeps selectors for every other
  // conversation referentially stable during interleaved streams.
  conversations: ReadonlyMap<string, ConversationProjection>;
}

export type ConversationStore = ConversationStoreData & ConversationStoreActions;

const initialConversationStoreData: ConversationStoreData = {
  conversations: new Map(),
};

export const useConversationStore = create<ConversationStore>((set) => ({
  ...initialConversationStoreData,
  applyEvent: (event) => set((state) => eventsPatch(state, [event])),
  applyEvents: (events) => set((state) => eventsPatch(state, events)),
  beginSnapshotLoad: (workspaceId, conversationId) =>
    set((state) => ({
      conversations: withProjection(
        state.conversations,
        conversationId,
        loadingConversationProjection(
          state.conversations.get(conversationId),
          workspaceId,
          conversationId,
        ),
      ),
    })),
  failSnapshotLoad: (workspaceId, conversationId, error) =>
    set((state) => ({
      conversations: withProjection(
        state.conversations,
        conversationId,
        failedConversationProjection(
          state.conversations.get(conversationId),
          workspaceId,
          conversationId,
          error,
        ),
      ),
    })),
  hydrateSnapshot: (workspaceId, conversationId, snapshot) =>
    set((state) => ({
      conversations: withProjection(
        state.conversations,
        conversationId,
        hydratedConversationProjection(
          state.conversations.get(conversationId),
          workspaceId,
          conversationId,
          snapshot,
        ),
      ),
    })),
  removeConversation: (conversationId) =>
    set((state) =>
      conversationsPatch(state, withoutConversation(state.conversations, conversationId)),
    ),
  removeWorkspace: (workspaceId) =>
    set((state) => conversationsPatch(state, withoutWorkspace(state.conversations, workspaceId))),
  reset: () => set({ conversations: new Map() }),
}));

function eventsPatch(
  state: ConversationStore,
  events: readonly ConversationEvent[],
): ConversationStore | Pick<ConversationStoreData, "conversations"> {
  return conversationsPatch(state, applyConversationEvents(state.conversations, events));
}

function conversationsPatch(
  state: ConversationStore,
  conversations: ReadonlyMap<string, ConversationProjection>,
): ConversationStore | Pick<ConversationStoreData, "conversations"> {
  return conversations === state.conversations ? state : { conversations };
}

function withProjection(
  current: ReadonlyMap<string, ConversationProjection>,
  conversationId: string,
  projection: ConversationProjection,
): ReadonlyMap<string, ConversationProjection> {
  if (current.get(conversationId) === projection) {
    return current;
  }
  const next = new Map(current);
  next.set(conversationId, projection);
  return next;
}

function withoutConversation(
  current: ReadonlyMap<string, ConversationProjection>,
  conversationId: string,
): ReadonlyMap<string, ConversationProjection> {
  if (!current.has(conversationId)) {
    return current;
  }
  const next = new Map(current);
  next.delete(conversationId);
  return next;
}

function withoutWorkspace(
  current: ReadonlyMap<string, ConversationProjection>,
  workspaceId: string,
): ReadonlyMap<string, ConversationProjection> {
  const next = new Map(current);
  for (const [conversationId, projection] of next) {
    if (projection.workspaceId === workspaceId) {
      next.delete(conversationId);
    }
  }
  return next.size === current.size ? current : next;
}
