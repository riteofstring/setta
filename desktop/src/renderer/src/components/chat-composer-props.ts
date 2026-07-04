import type { ChatView } from "./chat-panel";

const composerChatPropSelectors = [
  (chat: ChatView) => chat.activeRun?.id,
  (chat: ChatView) => chat.activeRunLiveness?.status,
  (chat: ChatView) => chat.activeRunLiveness?.retryable,
  (chat: ChatView) => chat.activeRunLiveness?.cancellable,
  (chat: ChatView) => chat.commandListError,
  (chat: ChatView) => chat.commandListStatus,
  (chat: ChatView) => chat.createImageAttachmentFromBytes,
  (chat: ChatView) => chat.createImageAttachmentsFromPicker,
  (chat: ChatView) => chat.executeCommand,
  (chat: ChatView) => chat.goal,
  (chat: ChatView) => chat.listCommands,
  (chat: ChatView) => chat.listComposerPromptHistory,
  (chat: ChatView) => chat.openCodexModelPicker,
  (chat: ChatView) => chat.openCodexPermissionPicker,
  (chat: ChatView) => chat.operation,
  (chat: ChatView) => chat.pendingSteeringMessageIds,
  (chat: ChatView) => chat.queueMessage,
  (chat: ChatView) => chat.retryActiveRunLiveness,
  (chat: ChatView) => chat.selectedConversation,
  (chat: ChatView) => chat.sendMessage,
  (chat: ChatView) => chat.sendSteeringImmediately,
  (chat: ChatView) => chat.setCodexModel,
  (chat: ChatView) => chat.setCodexPermissionPreset,
  (chat: ChatView) => chat.setCodexReasoningEffort,
  (chat: ChatView) => chat.status,
  (chat: ChatView) => chat.steerMessage,
  (chat: ChatView) => chat.stopActiveRun,
] as const;

export function composerChatPropsEqual(previous: ChatView, next: ChatView) {
  return composerChatPropSelectors.every((selector) => selector(previous) === selector(next));
}
