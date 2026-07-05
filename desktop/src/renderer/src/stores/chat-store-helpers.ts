import type { ChatEvent, Conversation, ListConversationsResponse } from "@generated/backend";

import { findConversation } from "./chat-store-workspace-selection";
import type { ChatPatch, ChatStore } from "./chat-store";

export function isUnexpectedStream(state: ChatStore, event: ChatEvent): boolean {
  return state.lastEventStreamId !== "" && event.streamId !== state.lastEventStreamId;
}

export function isDuplicateEvent(state: ChatStore, event: ChatEvent): boolean {
  return event.streamId === state.lastEventStreamId && event.sequence <= state.lastEventSequence;
}

export function hasSequenceGap(state: ChatStore, event: ChatEvent): boolean {
  return (
    event.streamId === state.lastEventStreamId &&
    state.lastEventSequence !== 0 &&
    event.sequence !== state.lastEventSequence + 1
  );
}

export function errorPatch(error: unknown): ChatPatch {
  return {
    error: errorMessage(error),
    operation: null,
    status: "error",
  };
}

export async function persistSelectedConversation(
  workspaceId: string,
  conversationId: string,
): Promise<Record<string, string>> {
  const selected = await window.setta.workspace.setSelectedConversation(
    workspaceId,
    conversationId,
  );
  return selected.selectedConversationIdsByWorkspaceId;
}

export function conversationToLoadForWorkspace(
  state: ChatStore,
  workspaceId: string,
  list: ListConversationsResponse,
): Conversation | null {
  const currentSelection =
    state.workspaceId === workspaceId ? state.selectedConversation?.id : undefined;
  const rememberedSelection = state.selectedConversationIdsByWorkspaceId[workspaceId];
  const preferredId = currentSelection || rememberedSelection || "";
  if (preferredId !== "") {
    const preferred = findConversation(list.conversations, preferredId);
    if (preferred) {
      return preferred;
    }
  }
  return list.conversations[0]?.conversation ?? null;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Chat operation failed";
}
