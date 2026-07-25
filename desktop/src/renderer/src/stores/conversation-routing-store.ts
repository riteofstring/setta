import { create } from "zustand";

interface ConversationRoutingClarification {
  inputId: string;
  question: string;
}

interface ConversationRoutingFailure {
  inputId: string;
  message: string;
  retryable: boolean;
}

interface ConversationRoutingMasterReply {
  kind: "answer" | "clarification";
  text: string;
}

export interface ConversationRoutingPresentationState {
  clarification: ConversationRoutingClarification | null;
  inputId: string;
  masterReply: ConversationRoutingMasterReply | null;
  routingAttempt: number;
  routingFailure: ConversationRoutingFailure | null;
  sequence: number;
}

interface ConversationRoutingResultUpdate {
  clarification: ConversationRoutingClarification | null;
  conversationId: string;
  inputId: string;
  routingAttempt: number;
  routingFailure: ConversationRoutingFailure | null;
  sequence: number;
  workspaceId: string;
}

interface ConversationRoutingMasterReplyUpdate {
  conversationId: string;
  inputId: string;
  masterReply: ConversationRoutingMasterReply;
  routingAttempt: number;
  sequence: number;
  workspaceId: string;
}

interface ConversationRoutingStore {
  applyResult: (update: ConversationRoutingResultUpdate) => void;
  clearMasterReply: (workspaceId: string, conversationId: string) => void;
  discardFailure: (workspaceId: string, conversationId: string, inputId: string) => void;
  presentations: ReadonlyMap<string, ConversationRoutingPresentationState>;
  resetRuntimeState: () => void;
  setMasterReply: (update: ConversationRoutingMasterReplyUpdate) => void;
}

export const useConversationRoutingStore = create<ConversationRoutingStore>((set) => ({
  applyResult: (update) =>
    set((state) => {
      const key = conversationRoutingKey(update.workspaceId, update.conversationId);
      const current = state.presentations.get(key);
      if (current && conversationRoutingResultIsOlder(update, current)) {
        return state;
      }
      const presentations = new Map(state.presentations);
      presentations.set(key, {
        clarification: update.clarification,
        inputId: update.inputId,
        masterReply: null,
        routingAttempt: update.routingAttempt,
        routingFailure: update.routingFailure,
        sequence: update.sequence,
      });
      return { presentations };
    }),
  clearMasterReply: (workspaceId, conversationId) =>
    set((state) =>
      updatePresentation(state, workspaceId, conversationId, (current) =>
        current.masterReply === null ? current : { ...current, masterReply: null },
      ),
    ),
  discardFailure: (workspaceId, conversationId, inputId) =>
    set((state) =>
      updatePresentation(state, workspaceId, conversationId, (current) => {
        if (current.routingFailure?.inputId !== inputId) {
          return current;
        }
        return {
          ...current,
          clarification: null,
          masterReply: null,
          routingFailure: null,
        };
      }),
    ),
  presentations: new Map(),
  resetRuntimeState: () => set({ presentations: new Map() }),
  setMasterReply: (update) =>
    set((state) => {
      const key = conversationRoutingKey(update.workspaceId, update.conversationId);
      const current = state.presentations.get(key);
      if (
        !current ||
        current.sequence !== update.sequence ||
        current.routingAttempt !== update.routingAttempt ||
        current.inputId !== update.inputId
      ) {
        return state;
      }
      const presentations = new Map(state.presentations);
      presentations.set(key, { ...current, masterReply: update.masterReply });
      return { presentations };
    }),
}));

export function conversationRoutingPresentation(
  presentations: ReadonlyMap<string, ConversationRoutingPresentationState>,
  workspaceId: string | null,
  conversationId: string | null,
): ConversationRoutingPresentationState | undefined {
  if (!workspaceId || !conversationId) {
    return undefined;
  }
  return presentations.get(conversationRoutingKey(workspaceId, conversationId));
}

function conversationRoutingKey(workspaceId: string, conversationId: string): string {
  return JSON.stringify([workspaceId, conversationId]);
}

function conversationRoutingResultIsOlder(
  update: ConversationRoutingResultUpdate,
  current: ConversationRoutingPresentationState,
): boolean {
  return (
    update.sequence < current.sequence ||
    (update.sequence === current.sequence && update.routingAttempt < current.routingAttempt)
  );
}

function updatePresentation(
  state: ConversationRoutingStore,
  workspaceId: string,
  conversationId: string,
  update: (current: ConversationRoutingPresentationState) => ConversationRoutingPresentationState,
): ConversationRoutingStore | Pick<ConversationRoutingStore, "presentations"> {
  const key = conversationRoutingKey(workspaceId, conversationId);
  const current = state.presentations.get(key);
  if (!current) {
    return state;
  }
  const next = update(current);
  if (next === current) {
    return state;
  }
  const presentations = new Map(state.presentations);
  presentations.set(key, next);
  return { presentations };
}
