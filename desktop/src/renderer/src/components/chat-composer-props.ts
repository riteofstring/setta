import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";

const composerViewModelPropSelectors = [
  (viewModel: ComposerViewModel) => viewModel.activeRunId,
  (viewModel: ComposerViewModel) => viewModel.commandListError,
  (viewModel: ComposerViewModel) => viewModel.commandListStatus,
  (viewModel: ComposerViewModel) => viewModel.goal,
  (viewModel: ComposerViewModel) => viewModel.operation,
  (viewModel: ComposerViewModel) => viewModel.pendingSteeringMessageIds,
  (viewModel: ComposerViewModel) => viewModel.selectedConversation,
  (viewModel: ComposerViewModel) => viewModel.status,
] as const;

const composerActionPropSelectors = [
  (actions: ComposerActions) => actions.attachments?.createImageAttachmentFromBytes,
  (actions: ComposerActions) => actions.attachments?.createImageAttachmentsFromPicker,
  (actions: ComposerActions) => actions.commands?.executeCommand,
  (actions: ComposerActions) => actions.commands?.listCommands,
  (actions: ComposerActions) => actions.modelSettings?.openCodexModelPicker,
  (actions: ComposerActions) => actions.modelSettings?.setCodexModel,
  (actions: ComposerActions) => actions.modelSettings?.setCodexReasoningEffort,
  (actions: ComposerActions) => actions.permissionSettings?.openCodexPermissionPicker,
  (actions: ComposerActions) => actions.permissionSettings?.setCodexPermissionPreset,
  (actions: ComposerActions) => actions.promptHistory?.listComposerPromptHistory,
  (actions: ComposerActions) => actions.queueMessage,
  (actions: ComposerActions) => actions.retryActiveRunLiveness,
  (actions: ComposerActions) => actions.sendMessage,
  (actions: ComposerActions) => actions.sendSteeringImmediately,
  (actions: ComposerActions) => actions.steerMessage,
  (actions: ComposerActions) => actions.stopActiveRun,
] as const;

export function composerViewModelPropsEqual(previous: ComposerViewModel, next: ComposerViewModel) {
  return composerViewModelPropSelectors.every((selector) => selector(previous) === selector(next));
}

export function composerActionPropsEqual(previous: ComposerActions, next: ComposerActions) {
  return composerActionPropSelectors.every((selector) => selector(previous) === selector(next));
}

export function runPresentationPropsEqual(
  previous: ActiveRunPresentation,
  next: ActiveRunPresentation,
) {
  return (
    previous.canRetry === next.canRetry &&
    previous.canSteer === next.canSteer &&
    previous.canStop === next.canStop &&
    previous.kind === next.kind &&
    previous.liveness === next.liveness &&
    previous.running === next.running
  );
}
