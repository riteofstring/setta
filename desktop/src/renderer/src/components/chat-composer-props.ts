import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import type { ReadOnlyComposerSettings } from "./chat-composer-frame";

interface ComposerScalarProps {
  busy: boolean;
  disabled?: boolean;
  formClassName?: string;
  frameClassName?: string;
  onSendPrompt?: unknown;
  placeholder?: string;
  readOnlySettings?: ReadOnlyComposerSettings | null;
  running: boolean;
}

const composerViewModelPropSelectors = [
  (viewModel: ComposerViewModel) => viewModel.activeRunId,
  (viewModel: ComposerViewModel) => viewModel.commandListError,
  (viewModel: ComposerViewModel) => viewModel.commandListStatus,
  (viewModel: ComposerViewModel) => viewModel.goal,
  (viewModel: ComposerViewModel) => viewModel.operation,
  (viewModel: ComposerViewModel) => viewModel.pendingSteeringMessageIds,
  (viewModel: ComposerViewModel) => viewModel.session,
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

const composerScalarPropSelectors = [
  (props: ComposerScalarProps) => props.busy,
  (props: ComposerScalarProps) => props.disabled,
  (props: ComposerScalarProps) => props.formClassName,
  (props: ComposerScalarProps) => props.frameClassName,
  (props: ComposerScalarProps) => props.onSendPrompt,
  (props: ComposerScalarProps) => props.placeholder,
  (props: ComposerScalarProps) => props.readOnlySettings?.disabledReason,
  (props: ComposerScalarProps) => props.readOnlySettings?.modelLabel,
  (props: ComposerScalarProps) => props.readOnlySettings?.permissionLabel,
  (props: ComposerScalarProps) => props.readOnlySettings?.reasoningLabel,
  (props: ComposerScalarProps) => props.running,
] as const;

export function composerViewModelPropsEqual(previous: ComposerViewModel, next: ComposerViewModel) {
  return composerViewModelPropSelectors.every((selector) => selector(previous) === selector(next));
}

export function composerActionPropsEqual(previous: ComposerActions, next: ComposerActions) {
  return composerActionPropSelectors.every((selector) => selector(previous) === selector(next));
}

export function composerScalarPropsEqual(previous: ComposerScalarProps, next: ComposerScalarProps) {
  return composerScalarPropSelectors.every((selector) => selector(previous) === selector(next));
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
