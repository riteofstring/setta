import { useChatStore, type ChatPatch } from "./chat-store";
import { emptyCorruption } from "./chat-store-workspace-selection";

export function resetChatRuntimeState(): void {
  useChatStore.getState().invalidateRuntimeState();
  useChatStore.setState(chatRuntimeStateResetPatch());
}

function chatRuntimeStateResetPatch(): ChatPatch {
  return {
    activeRun: null,
    commandListError: null,
    commandListStatus: "idle",
    conversationDetailsById: {},
    conversationListsByWorkspaceId: {},
    conversations: [],
    corruption: emptyCorruption,
    diagnostics: [],
    editingQueuedMessageId: null,
    error: null,
    goal: null,
    hasMoreOlder: false,
    lastEventSequence: 0,
    lastEventStreamId: "",
    messageIds: [],
    messages: [],
    messagesById: {},
    olderBeforeOrdinal: 0,
    operation: null,
    queuedRuns: [],
    removingQueuedMessageId: null,
    runItemIdsByRunId: {},
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItemOutputsById: {},
    runItems: [],
    runItemsById: {},
    selectedConversation: null,
    selectedConversationIdsByWorkspaceId: {},
    status: "idle",
    transcript: [],
    workspaceId: null,
  };
}
