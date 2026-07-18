import type { Conversation, ListConversationsResponse } from "@generated/backend";

import { emptyConversationPatch } from "./chat-store-page-patches";
import { persistSelectedConversation } from "./chat-store-helpers";
import type { ChatPatch, ChatStore } from "./chat-store-types";

export async function deletedConversationSelectionPatch({
  conversationId,
  list,
  loadConversationPage,
  state,
  workspaceId,
}: {
  conversationId: string;
  list: ListConversationsResponse;
  loadConversationPage: (workspaceId: string, conversation: Conversation) => Promise<ChatPatch>;
  state: ChatStore;
  workspaceId: string;
}): Promise<{
  nextConversationPatch: ChatPatch;
  selectedConversationIdsByWorkspaceId: Record<string, string | undefined>;
}> {
  const deletedSelected =
    state.workspaceId === workspaceId && state.selectedConversation?.id === conversationId;
  if (!deletedSelected) {
    return {
      nextConversationPatch: {},
      selectedConversationIdsByWorkspaceId: state.selectedConversationIdsByWorkspaceId,
    };
  }
  const nextConversation = list.conversations[0]?.conversation ?? null;
  if (!nextConversation) {
    return {
      nextConversationPatch: emptyConversationPatch(),
      selectedConversationIdsByWorkspaceId: state.selectedConversationIdsByWorkspaceId,
    };
  }
  return {
    nextConversationPatch: await loadConversationPage(workspaceId, nextConversation),
    selectedConversationIdsByWorkspaceId: await persistSelectedConversation(
      workspaceId,
      nextConversation.id,
    ),
  };
}
