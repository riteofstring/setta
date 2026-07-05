import { useChatStore, type ChatPatch } from "./chat-store";
import { emptyCorruption } from "./chat-store-workspace-selection";

export function resetChatRuntimeState(): void {
  useChatStore.getState().invalidateRuntimeState();
  useChatStore.setState(chatRuntimeStateResetPatch());
}

function chatRuntimeStateResetPatch(): ChatPatch {
  return {
    activeRun: null,
    backgroundTerminalIdsByConversationId: {},
    backgroundTerminalOutputIdsByProcessId: {},
    backgroundTerminalOutputPagesByProcessId: {},
    backgroundTerminalOutputsById: {},
    backgroundTerminalsById: {},
    commandListError: null,
    commandListStatus: "idle",
    commandDescriptorCache: {},
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
    olderBeforeBlockOrdinal: 0,
    operation: null,
    pendingGoalSubmission: null,
    queuedRuns: [],
    removingQueuedMessageId: null,
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItemOutputsById: {},
    runsById: {},
    selectedConversation: null,
    selectedConversationIdsByWorkspaceId: {},
    status: "idle",
    transcriptBlocks: [],
    transcriptBlocksById: {},
    workspaceId: null,
  };
}
