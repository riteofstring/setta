import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import type { ChatView } from "./chat-panel";

export function selectedChatComposerViewModel(chat: ChatView): ComposerViewModel {
  return {
    activeRunId: chat.activeRun?.id ?? "",
    commandListError: chat.commandListError,
    commandListStatus: chat.commandListStatus,
    goal: chat.goal,
    operation: chat.operation,
    pendingSteeringMessageIds: chat.pendingSteeringMessageIds,
    selectedConversation: chat.selectedConversation,
    status: chat.status,
  };
}

export function selectedChatComposerActions(chat: ChatView): ComposerActions {
  return {
    attachments: {
      createImageAttachmentFromBytes: chat.createImageAttachmentFromBytes,
      createImageAttachmentsFromPicker: chat.createImageAttachmentsFromPicker,
    },
    commands: {
      executeCommand: chat.executeCommand,
      listCommands: chat.listCommands,
    },
    modelSettings: {
      openCodexModelPicker: chat.openCodexModelPicker,
      setCodexModel: chat.setCodexModel,
      setCodexReasoningEffort: chat.setCodexReasoningEffort,
    },
    permissionSettings: {
      openCodexPermissionPicker: chat.openCodexPermissionPicker,
      setCodexPermissionPreset: chat.setCodexPermissionPreset,
    },
    promptHistory: {
      listComposerPromptHistory: chat.listComposerPromptHistory,
    },
    queueMessage: chat.queueMessage,
    retryActiveRunLiveness: chat.retryActiveRunLiveness,
    sendMessage: chat.sendMessage,
    sendSteeringImmediately: chat.sendSteeringImmediately,
    steerMessage: chat.steerMessage,
    stopActiveRun: chat.stopActiveRun,
  };
}
