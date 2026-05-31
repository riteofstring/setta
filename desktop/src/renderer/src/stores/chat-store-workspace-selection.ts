import type { Conversation, ConversationListItem, CorruptionSummary } from "@generated/backend";

import type { ChatPatch, ChatStore } from "./chat-store";

export interface ConversationSelectionRequest {
  conversation: Conversation | null;
  conversationId: string;
  loadingPatch: ChatPatch;
  workspaceId: string;
}

export interface ConversationSelectionResult {
  conversation: Conversation | null;
  conversationListPatch: ChatPatch;
}

export const emptyCorruption = {
  byKind: [],
  bySeverity: [],
  hasCorruption: false,
  total: 0,
} satisfies CorruptionSummary;

export function conversationSelectionRequest(
  state: ChatStore,
  conversationId: string,
  targetWorkspaceId?: string,
): ConversationSelectionRequest | null {
  const workspaceId = targetWorkspaceId ?? state.workspaceId;
  if (!workspaceId) {
    return null;
  }
  const switchingWorkspace = state.workspaceId !== workspaceId;
  return {
    conversation: currentConversationForSelection(state, conversationId, {
      forceListReload: switchingWorkspace || targetWorkspaceId !== undefined,
    }),
    conversationId,
    loadingPatch: {
      ...(switchingWorkspace ? workspaceSwitchLoadingPatch(workspaceId) : {}),
      error: null,
      operation: "loading",
    },
    workspaceId,
  };
}

export function findConversation(conversations: ConversationListItem[], conversationId: string) {
  return (
    conversations.find((item) => item.conversation.id === conversationId)?.conversation ?? null
  );
}

export function missingConversationPatch(
  request: ConversationSelectionRequest,
  conversationListPatch: ChatPatch,
): ChatPatch {
  return {
    ...conversationListPatch,
    error: `conversation not found: ${request.conversationId}`,
    operation: null,
    status: "error",
    workspaceId: request.workspaceId,
  };
}

function workspaceSwitchLoadingPatch(workspaceId: string): ChatPatch {
  return {
    activeRun: null,
    conversations: [],
    corruption: emptyCorruption,
    diagnostics: [],
    editingQueuedMessageId: null,
    error: null,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeOrdinal: 0,
    queuedRuns: [],
    removingQueuedMessageId: null,
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItems: [],
    selectedConversation: null,
    status: "loading",
    transcript: [],
    workspaceId,
  };
}

function currentConversationForSelection(
  state: ChatStore,
  conversationId: string,
  { forceListReload }: { forceListReload: boolean },
) {
  if (forceListReload) {
    return null;
  }
  return findConversation(state.conversations, conversationId);
}
