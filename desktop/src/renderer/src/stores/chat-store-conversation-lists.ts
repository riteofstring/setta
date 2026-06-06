import type {
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  ListConversationsResponse,
} from "@generated/backend";

import { upsertConversationListItem } from "./chat-store-normalization";
import type { ChatPatch, ChatStore } from "./chat-store";

export interface WorkspaceConversationListState {
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
  error: string | null;
  loading: boolean;
}

const emptyConversationListCorruption = {
  byKind: [],
  bySeverity: [],
  hasCorruption: false,
  total: 0,
} satisfies CorruptionSummary;

export function conversationListLoadedPatch(
  state: ChatStore,
  workspaceId: string,
  response: ListConversationsResponse,
  syncSelectedWorkspaceFields: boolean,
): ChatPatch {
  return conversationListStatePatch(
    state,
    workspaceId,
    {
      conversations: response.conversations,
      corruption: response.corruption,
      diagnostics: response.diagnostics,
      error: null,
      loading: false,
    },
    syncSelectedWorkspaceFields,
  );
}

export function conversationListLoadingPatch(
  state: ChatStore,
  workspaceId: string,
  syncSelectedWorkspaceFields: boolean,
): ChatPatch {
  const current = state.conversationListsByWorkspaceId[workspaceId];
  return conversationListStatePatch(
    state,
    workspaceId,
    {
      conversations: current?.conversations ?? [],
      corruption: current?.corruption ?? emptyConversationListCorruption,
      diagnostics: current?.diagnostics ?? [],
      error: null,
      loading: true,
    },
    syncSelectedWorkspaceFields,
  );
}

export function conversationListErrorPatch(
  state: ChatStore,
  workspaceId: string,
  error: string,
  syncSelectedWorkspaceFields: boolean,
): ChatPatch {
  const current = state.conversationListsByWorkspaceId[workspaceId];
  return conversationListStatePatch(
    state,
    workspaceId,
    {
      conversations: current?.conversations ?? [],
      corruption: current?.corruption ?? emptyConversationListCorruption,
      diagnostics: current?.diagnostics ?? [],
      error,
      loading: false,
    },
    syncSelectedWorkspaceFields,
  );
}

export function conversationUpdatedSummaryPatch(
  state: ChatStore,
  workspaceId: string,
  item: ConversationListItem,
): ChatPatch {
  const patch: ChatPatch = {};
  const current = state.conversationListsByWorkspaceId[workspaceId];
  if (current) {
    patch.conversationListsByWorkspaceId = {
      ...state.conversationListsByWorkspaceId,
      [workspaceId]: {
        ...current,
        conversations: upsertConversationListItem(current.conversations, item),
      },
    };
  }
  if (state.workspaceId === workspaceId) {
    Object.assign(patch, {
      conversations: upsertConversationListItem(state.conversations, item),
      selectedConversation:
        state.selectedConversation?.id === item.conversation.id
          ? item.conversation
          : state.selectedConversation,
    });
  }
  return patch;
}

function conversationListStatePatch(
  state: ChatStore,
  workspaceId: string,
  summary: WorkspaceConversationListState,
  syncSelectedWorkspaceFields: boolean,
): ChatPatch {
  const patch: ChatPatch = {
    conversationListsByWorkspaceId: {
      ...state.conversationListsByWorkspaceId,
      [workspaceId]: summary,
    },
  };
  if (syncSelectedWorkspaceFields) {
    Object.assign(patch, {
      conversations: summary.conversations,
      corruption: summary.corruption,
      diagnostics: summary.diagnostics,
    });
  }
  return patch;
}
