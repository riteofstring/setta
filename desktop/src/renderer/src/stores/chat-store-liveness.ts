import type { ConversationListItem, RunLiveness } from "@generated/backend";

import { activeRunLivenessFromCandidate } from "./chat-store-normalization";
import type { ChatPatch, ChatStore } from "./chat-store-types";

export function runLivenessPatch(state: ChatStore, liveness: RunLiveness): ChatPatch {
  const patch: ChatPatch = {};
  const activeRunLiveness = activeRunLivenessFromCandidate(state.activeRun, liveness);
  if (
    state.workspaceId === liveness.workspaceId &&
    state.selectedConversation?.id === liveness.conversationId &&
    state.activeRun?.id === liveness.runId
  ) {
    patch.activeRunLiveness = activeRunLiveness;
  }
  const conversations = updateConversationListItems(state.conversations, liveness);
  if (conversations !== state.conversations) {
    patch.conversations = conversations;
  }
  const workspaceList = state.conversationListsByWorkspaceId[liveness.workspaceId];
  if (workspaceList) {
    const workspaceConversations = updateConversationListItems(
      workspaceList.conversations,
      liveness,
    );
    if (workspaceConversations !== workspaceList.conversations) {
      patch.conversationListsByWorkspaceId = {
        ...state.conversationListsByWorkspaceId,
        [liveness.workspaceId]: {
          ...workspaceList,
          conversations: workspaceConversations,
        },
      };
    }
  }
  return patch;
}

export function runLivenessesPatch(state: ChatStore, values: RunLiveness[]): ChatPatch {
  let nextState = state;
  let patch: ChatPatch = {};
  for (const liveness of values) {
    const nextPatch = runLivenessPatch(nextState, liveness);
    patch = { ...patch, ...nextPatch };
    nextState = { ...nextState, ...nextPatch };
  }
  return patch;
}

function updateConversationListItems(
  items: ConversationListItem[],
  liveness: RunLiveness,
): ConversationListItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (
      item.conversation.workspaceId !== liveness.workspaceId ||
      item.conversation.id !== liveness.conversationId ||
      item.activeRunId !== liveness.runId
    ) {
      return item;
    }
    if (item.activeRunLiveness === liveness) {
      return item;
    }
    changed = true;
    return { ...item, activeRunLiveness: liveness };
  });
  return changed ? next : items;
}
