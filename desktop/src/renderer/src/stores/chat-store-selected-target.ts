import type { Conversation } from "@generated/backend";

interface ChatTargetState {
  selectedConversation: Conversation | null;
  workspaceId: string | null;
}

export function selectedChatTarget(state: ChatTargetState) {
  if (!state.workspaceId || !state.selectedConversation) {
    return null;
  }
  return { conversationId: state.selectedConversation.id, workspaceId: state.workspaceId };
}

export function requireSelectedChatTarget(state: ChatTargetState) {
  const target = selectedChatTarget(state);
  if (!target) {
    throw new Error("chat conversation is required");
  }
  return target;
}
