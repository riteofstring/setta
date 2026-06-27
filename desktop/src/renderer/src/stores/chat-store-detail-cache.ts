import type {
  ChatGoalState,
  ChatMessage,
  Conversation,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";

import { normalizeChatPatch, type QueuedRun, type RunningRun } from "./chat-store-normalization";
import type { ChatPatch, ChatStore } from "./chat-store";
import type { RunItemOutputPageState } from "./chat-store-normalization";

export interface ConversationDetailState {
  activeRun: RunningRun | null;
  conversation: Conversation;
  goal: ChatGoalState | null;
  hasMoreOlder: boolean;
  messageIds: string[];
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage>;
  olderBeforeOrdinal: number;
  queuedRuns: QueuedRun[];
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput>;
  runItems: RunItem[];
  runItemsById: Record<string, RunItem>;
  transcript: TranscriptTurn[];
}

export function normalizeStatePatch(state: ChatStore, patch: ChatPatch): ChatPatch {
  return rememberSelectedConversationId(
    state,
    cacheSelectedConversationDetail(state, normalizeChatPatch(patch)),
  );
}

export function conversationDetailPatch(detail: ConversationDetailState): ChatPatch {
  return {
    activeRun: detail.activeRun,
    goal: detail.goal,
    hasMoreOlder: detail.hasMoreOlder,
    messageIds: detail.messageIds,
    messages: detail.messages,
    messagesById: detail.messagesById,
    olderBeforeOrdinal: detail.olderBeforeOrdinal,
    queuedRuns: detail.queuedRuns,
    runItemIdsByRunId: detail.runItemIdsByRunId,
    runItemOutputIdsByRunItemId: detail.runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId: detail.runItemOutputPagesByRunItemId,
    runItemOutputs: detail.runItemOutputs,
    runItemOutputsById: detail.runItemOutputsById,
    runItems: detail.runItems,
    runItemsById: detail.runItemsById,
    selectedConversation: detail.conversation,
    transcript: detail.transcript,
  };
}

function cacheSelectedConversationDetail(state: ChatStore, patch: ChatPatch): ChatPatch {
  const conversation = patchedValue(state, patch, "selectedConversation");
  if (!conversation) {
    return patch;
  }
  return {
    ...patch,
    conversationDetailsById: {
      ...state.conversationDetailsById,
      ...patch.conversationDetailsById,
      [conversation.id]: conversationDetailFromStatePatch(state, patch, conversation),
    },
  };
}

function rememberSelectedConversationId(state: ChatStore, patch: ChatPatch): ChatPatch {
  if (patch.selectedConversation === undefined || patch.selectedConversation === null) {
    return patch;
  }
  const workspaceId =
    patch.workspaceId ?? state.workspaceId ?? patch.selectedConversation.workspaceId;
  if (workspaceId === "") {
    return patch;
  }
  return {
    ...patch,
    selectedConversationIdsByWorkspaceId: {
      ...state.selectedConversationIdsByWorkspaceId,
      ...patch.selectedConversationIdsByWorkspaceId,
      [workspaceId]: patch.selectedConversation.id,
    },
  };
}

function conversationDetailFromStatePatch(
  state: ChatStore,
  patch: ChatPatch,
  conversation: Conversation,
): ConversationDetailState {
  return {
    activeRun: patchedValue(state, patch, "activeRun"),
    conversation,
    goal: patchedValue(state, patch, "goal"),
    hasMoreOlder: patchedValue(state, patch, "hasMoreOlder"),
    messageIds: patchedValue(state, patch, "messageIds"),
    messages: patchedValue(state, patch, "messages"),
    messagesById: patchedValue(state, patch, "messagesById"),
    olderBeforeOrdinal: patchedValue(state, patch, "olderBeforeOrdinal"),
    queuedRuns: patchedValue(state, patch, "queuedRuns"),
    runItemIdsByRunId: patchedValue(state, patch, "runItemIdsByRunId"),
    runItemOutputIdsByRunItemId: patchedValue(state, patch, "runItemOutputIdsByRunItemId"),
    runItemOutputPagesByRunItemId: patchedValue(state, patch, "runItemOutputPagesByRunItemId"),
    runItemOutputs: patchedValue(state, patch, "runItemOutputs"),
    runItemOutputsById: patchedValue(state, patch, "runItemOutputsById"),
    runItems: patchedValue(state, patch, "runItems"),
    runItemsById: patchedValue(state, patch, "runItemsById"),
    transcript: patchedValue(state, patch, "transcript"),
  };
}

function patchedValue<Key extends keyof ChatPatch & keyof ChatStore>(
  state: ChatStore,
  patch: ChatPatch,
  key: Key,
): NonNullable<ChatStore[Key] | ChatPatch[Key]> {
  const patchValue = patch[key];
  return (patchValue === undefined ? state[key] : patchValue) as NonNullable<
    ChatStore[Key] | ChatPatch[Key]
  >;
}
