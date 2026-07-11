import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import type { ChatView } from "./chat-panel";
import { commandDescriptorContextKey } from "../stores/chat-store-command-cache";

export function selectedChatComposerViewModel(
  chat: ChatView,
  commandListActive = chat.activeRun?.status === "running",
): ComposerViewModel {
  const selectedConversation = chat.selectedConversation;
  return {
    activeRunId: chat.activeRun?.id ?? "",
    commandListError: chat.commandListError,
    commandListStatus: chat.commandListStatus,
    goal: chat.goal,
    operation: chat.operation,
    pendingSteeringMessageIds: chat.pendingSteeringMessageIds,
    session: selectedChatComposerSession(selectedConversation, commandListActive),
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

function selectedChatComposerSession(
  selectedConversation: ChatView["selectedConversation"],
  commandListActive: boolean,
): ComposerViewModel["session"] {
  if (selectedConversation === null) {
    return null;
  }
  const effectiveSettings = selectedConversation.codexEffectiveSettings;
  return {
    commandListContextKey: commandDescriptorContextKey({
      active: commandListActive,
      selectedConversation,
      workspaceId: selectedConversation.workspaceId,
    }),
    id: selectedConversation.id,
    modelLabel: conversationModelLabel(effectiveSettings),
    permissionLabel: effectiveSettings?.permission?.displayLabel ?? "Ask for approval",
    reasoningLabel: conversationReasoningLabel(effectiveSettings),
    supportsImages: effectiveSettings?.supportsImages ?? true,
    workspaceId: selectedConversation.workspaceId,
  };
}

function conversationModelLabel(
  effectiveSettings: NonNullable<ChatView["selectedConversation"]>["codexEffectiveSettings"],
) {
  return effectiveSettings?.modelDisplayName ?? "Model";
}

function conversationReasoningLabel(
  effectiveSettings: NonNullable<ChatView["selectedConversation"]>["codexEffectiveSettings"],
) {
  return effectiveSettings?.reasoningEffortDisplayName ?? "Reasoning";
}
