import type { ListConversationsResponse } from "@generated/backend";

import { conversationListLoadedPatch } from "./chat-store-conversation-lists";
import {
  findConversation,
  type ConversationSelectionRequest,
} from "./chat-store-workspace-selection";
import type { ChatStore } from "./chat-store-types";

export async function resolveConversationSelection(
  request: ConversationSelectionRequest,
  readState: () => ChatStore,
  reloadConversations: (workspaceId: string) => Promise<ListConversationsResponse>,
) {
  if (request.conversation) {
    return { conversation: request.conversation, conversationListPatch: {} };
  }
  const list = await reloadConversations(request.workspaceId);
  return {
    conversation: findConversation(list.conversations, request.conversationId),
    conversationListPatch: conversationListLoadedPatch(
      readState(),
      request.workspaceId,
      list,
      true,
    ),
  };
}
