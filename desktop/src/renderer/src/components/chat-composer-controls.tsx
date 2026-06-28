import type {
  ChatCommandExecuteResult,
  ChatCodexEffectiveSettings,
  ChatModelOption,
  ChatPermissionPreset,
  ChatPermissionPresetID,
  ChatReasoningEffortOption,
  Conversation,
  ReasoningEffort,
} from "@generated/backend";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  MessageSquarePlus,
  Mic,
  Settings,
  Square,
  Zap,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export interface ComposerKeyActions {
  completeCommand: () => void;
  draftEmpty: boolean;
  hasPendingSteering: boolean;
  dismissPicker: () => void;
  pickerOpen: boolean;
  queueDraft: () => Promise<void> | void;
  running: boolean;
  sendDraft: () => Promise<void> | void;
  sendImmediateSteering: () => Promise<void> | void;
  slashDraft: boolean;
  stopRun: () => Promise<void> | void;
}

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  actions: ComposerKeyActions,
) {
  if (isDismissShortcut(event, actions.pickerOpen)) {
    event.preventDefault();
    actions.dismissPicker();
    return;
  }
  if (
    isImmediateSteeringShortcut(
      event,
      actions.running,
      actions.draftEmpty,
      actions.hasPendingSteering,
    )
  ) {
    event.preventDefault();
    void actions.sendImmediateSteering();
    return;
  }
  if (isQueueShortcut(event)) {
    event.preventDefault();
    if (actions.slashDraft) {
      actions.completeCommand();
      return;
    }
    focusTextareaSoon(event.currentTarget);
    void actions.queueDraft();
    return;
  }
  if (isStopShortcut(event, actions.running)) {
    event.preventDefault();
    void actions.stopRun();
    return;
  }
  if (!isSubmitShortcut(event)) {
    return;
  }
  event.preventDefault();
  focusTextareaSoon(event.currentTarget);
  void actions.sendDraft();
}

function isDismissShortcut(event: KeyboardEvent<HTMLTextAreaElement>, pickerOpen: boolean) {
  return pickerOpen && event.key === "Escape";
}

function isQueueShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return event.key === "Tab" && !event.nativeEvent.isComposing;
}

function isStopShortcut(event: KeyboardEvent<HTMLTextAreaElement>, running: boolean) {
  return running && event.key === "c" && event.ctrlKey && !hasTextSelection(event.currentTarget);
}

function isImmediateSteeringShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
  running: boolean,
  draftEmpty: boolean,
  hasPendingSteering: boolean,
) {
  return running && draftEmpty && hasPendingSteering && event.key === "Escape";
}

function isSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing
  );
}

function hasTextSelection(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart !== textarea.selectionEnd;
}

function focusTextareaSoon(textarea: HTMLTextAreaElement) {
  if (typeof textarea.focus !== "function") {
    return;
  }
  globalThis.setTimeout(() => textarea.focus(), 0);
}

export function PermissionPickerButton({
  disabled,
  onOpen,
  onSelect,
  permissionPicker,
  running,
  selectedConversation,
}: {
  disabled: boolean;
  onOpen: () => void;
  onSelect: (preset: ChatPermissionPresetID) => void;
  permissionPicker: ChatCommandExecuteResult | null;
  running: boolean;
  selectedConversation: Conversation | null;
}) {
  const open = permissionPicker?.result.action === "permission_picker";
  const label = permissionPickerLabel(permissionPicker, selectedConversation);
  const disabledReason = permissionPickerDisabledReason({
    disabled,
    running,
    selected: selectedConversation !== null,
  });
  return (
    <div className="relative inline-flex min-w-0">
      <button
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="menu"
        aria-label="Open permission mode picker"
        className={cn(
          "inline-flex h-6 min-w-0 items-center gap-1 rounded-sm border border-transparent px-1.5 text-xs hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          open ? "border-border bg-accent/80 text-foreground" : "text-muted-foreground",
        )}
        disabled={disabled}
        onClick={onOpen}
        title={disabledReason ?? "Open permission mode picker"}
        type="button"
      >
        <Settings className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-36 truncate font-medium text-foreground">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div
          className="absolute bottom-7 left-0 z-30 w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="menu"
        >
          {permissionPicker.result.permissionPresets.map((preset) => {
            const selected = permissionPresetSelected(
              preset.id,
              permissionPicker.result.selectedPermissionPreset,
            );
            return (
              <button
                className="grid w-full grid-cols-[1rem_minmax(0,1fr)_1rem] gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={preset.disabled}
                key={preset.id}
                onClick={() => onSelect(preset.id)}
                role="menuitemradio"
                title={preset.disabled ? preset.disabledReason : preset.shortDescription}
                type="button"
                aria-checked={selected}
              >
                <span className="pt-0.5 text-muted-foreground">
                  {selected ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{preset.label}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {preset.shortDescription}
                  </span>
                </span>
                <span className="pt-0.5 text-destructive">
                  {preset.danger?.requiresConfirmation ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PermissionConfirmationDialog({
  onCancel,
  onConfirm,
  preset,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  preset: ChatPermissionPreset | null;
}) {
  if (preset === null || preset.danger === null) {
    return null;
  }
  return (
    <div
      aria-labelledby="permission-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div id="permission-confirmation-title" className="text-sm font-medium">
              {preset.danger.confirmationTitle}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {preset.danger.confirmationBody}
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            autoFocus
            className="h-7 rounded-sm px-2 text-xs"
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            className="h-7 rounded-sm px-2 text-xs"
            onClick={onConfirm}
            type="button"
            variant="primary"
          >
            Use {preset.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function permissionPickerLabel(
  permissionPicker: ChatCommandExecuteResult | null,
  selectedConversation: Conversation | null,
) {
  if (permissionPicker?.result.action === "permission_picker") {
    return permissionPicker.result.currentPermission?.displayLabel ?? "Ask for approval";
  }
  return (
    selectedConversation?.codexEffectiveSettings?.permission?.displayLabel ?? "Ask for approval"
  );
}

function permissionPickerDisabledReason({
  disabled,
  running,
  selected,
}: {
  disabled: boolean;
  running: boolean;
  selected: boolean;
}) {
  if (!disabled) {
    return null;
  }
  if (!selected) {
    return "Start a chat before changing permission settings.";
  }
  if (running) {
    return "Permission changes apply after the current run finishes.";
  }
  return "Composer controls are unavailable while the current operation finishes.";
}

export function permissionPresetSelected(
  preset: ChatPermissionPresetID,
  selectedPreset: ChatPermissionPresetID | null,
) {
  return selectedPreset !== null && preset === selectedPreset;
}

export function VoiceInputUnavailableButton() {
  return (
    <DisabledIconButton
      icon={<Mic className="h-3.5 w-3.5" />}
      label="Voice input"
      reason="Voice input is not implemented in this codebase."
    />
  );
}

function DisabledIconButton({
  icon,
  label,
  reason,
}: {
  icon: ReactNode;
  label: string;
  reason: string;
}) {
  return (
    <button
      aria-label={`${label} unavailable`}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
      disabled
      title={reason}
      type="button"
    >
      {icon}
    </button>
  );
}

export function ModelPickerButton({
  disabled,
  modelPicker,
  onOpen,
  running,
  selectedConversation,
}: {
  disabled: boolean;
  modelPicker: ChatCommandExecuteResult | null;
  onOpen: () => void;
  running: boolean;
  selectedConversation: Conversation | null;
}) {
  const summary = modelPickerSummary(modelPicker, selectedConversation);
  const disabledReason = modelPickerDisabledReason({
    disabled,
    running,
    selected: selectedConversation !== null,
  });
  return (
    <button
      aria-expanded={modelPicker?.result.action === "model_picker" ? "true" : "false"}
      aria-haspopup="menu"
      aria-label="Open model and reasoning picker"
      className={cn(
        "inline-flex h-6 min-w-0 items-center gap-1 rounded-sm border border-transparent px-1.5 text-xs hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        modelPicker?.result.action === "model_picker"
          ? "border-border bg-accent/80 text-foreground"
          : "text-muted-foreground",
      )}
      disabled={disabled}
      onClick={onOpen}
      title={disabledReason ?? "Open model and reasoning picker"}
      type="button"
    >
      <span className="max-w-28 truncate font-medium text-foreground">{summary.model}</span>
      <span className="max-w-28 truncate text-muted-foreground">{summary.reasoning}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function modelPickerDisabledReason({
  disabled,
  running,
  selected,
}: {
  disabled: boolean;
  running: boolean;
  selected: boolean;
}) {
  if (!disabled) {
    return null;
  }
  if (!selected) {
    return "Start a chat before changing model settings.";
  }
  if (running) {
    return "Model commands are unavailable while a run is active.";
  }
  return "Composer controls are unavailable while the current operation finishes.";
}

function modelPickerSummary(
  modelPicker: ChatCommandExecuteResult | null,
  selectedConversation: Conversation | null,
) {
  if (modelPicker?.result.action === "model_picker") {
    return modelPickerResultSummary(modelPicker);
  }
  return conversationModelSummary(selectedConversation);
}

function modelPickerResultSummary(modelPicker: ChatCommandExecuteResult) {
  return {
    model: selectedModelSummary(modelPicker),
    reasoning: selectedReasoningSummary(modelPicker),
  };
}

function selectedModelSummary(modelPicker: ChatCommandExecuteResult) {
  const selectedModel = selectedModelOption(modelPicker);
  return selectedModel?.displayName ?? selectedModel?.model ?? "Model";
}

function selectedReasoningSummary(modelPicker: ChatCommandExecuteResult) {
  const selectedReasoning = selectedReasoningEffortOption(modelPicker);
  return selectedReasoning?.displayName ?? "Reasoning";
}

function selectedModelOption(modelPicker: ChatCommandExecuteResult) {
  return (
    modelPicker.result.models.find((model) =>
      modelPickerOptionSelected(model, modelPicker.result.selectedModel),
    ) ?? null
  );
}

function selectedReasoningEffortOption(modelPicker: ChatCommandExecuteResult) {
  return (
    modelPicker.result.reasoningEfforts.find((effort) =>
      reasoningEffortOptionSelected(effort, modelPicker.result.selectedReasoningEffort),
    ) ?? null
  );
}

function conversationModelSummary(selectedConversation: Conversation | null) {
  const effectiveSettings = conversationEffectiveSettings(selectedConversation);
  return {
    model: conversationModelLabel(effectiveSettings),
    reasoning: conversationReasoningSummary(effectiveSettings),
  };
}

function conversationEffectiveSettings(
  selectedConversation: Conversation | null,
): ChatCodexEffectiveSettings | null {
  if (selectedConversation === null) {
    return null;
  }
  return selectedConversation.codexEffectiveSettings;
}

function conversationModelLabel(effectiveSettings: ChatCodexEffectiveSettings | null) {
  if (effectiveSettings !== null) {
    return effectiveSettings.modelDisplayName;
  }
  return "Model";
}

function conversationReasoningSummary(effectiveSettings: ChatCodexEffectiveSettings | null) {
  if (effectiveSettings === null) {
    return "Reasoning";
  }
  return effectiveSettings.reasoningEffortDisplayName;
}

export function modelPickerOptionSelected(
  model: Pick<ChatModelOption, "isDefault" | "model">,
  selectedModel: string,
) {
  if (selectedModel === "") {
    return model.isDefault;
  }
  return model.model === selectedModel;
}

export function reasoningEffortOptionSelected(
  effort: Pick<ChatReasoningEffortOption, "effort" | "isDefault">,
  selectedReasoningEffort: ReasoningEffort | null,
) {
  if (selectedReasoningEffort === null) {
    return effort.isDefault;
  }
  return effort.effort === selectedReasoningEffort;
}

export function ComposerButton({
  canSend,
  canSendImmediately,
  chat,
  queueDraft,
  running,
  sendImmediateSteering,
}: {
  canSend: boolean;
  canSendImmediately: boolean;
  chat: {
    operation: string | null;
    stopActiveRun: () => Promise<void>;
  };
  queueDraft: () => Promise<void>;
  running: boolean;
  sendImmediateSteering: () => Promise<void>;
}) {
  if (running) {
    return (
      <div className="flex items-center gap-1">
        <Button
          aria-label="Send steering message"
          className="h-6 w-6 shrink-0 rounded-sm border-primary bg-primary px-0 text-primary-foreground hover:bg-primary/90 disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
          disabled={!canSend}
          title="Send steering message"
          type="submit"
          variant="primary"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Queue follow-up"
          className="h-6 w-6 shrink-0 rounded-sm border-border bg-card px-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled={
            !canSend ||
            chat.operation === "queueing" ||
            chat.operation === "sendingSteeringImmediately"
          }
          onClick={() => void queueDraft()}
          title="Queue follow-up"
          type="button"
          variant="secondary"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label="Interrupt and send pending steering"
          className="h-6 w-6 shrink-0 rounded-sm border-border bg-card px-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled={!canSendImmediately || chat.operation === "sendingSteeringImmediately"}
          onClick={() => void sendImmediateSteering()}
          title="Interrupt and send pending steering"
          type="button"
          variant="secondary"
        >
          <Zap className="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label="Stop run"
          className="h-6 w-6 shrink-0 rounded-sm border-border bg-card px-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled={
            chat.operation === "cancelling" || chat.operation === "sendingSteeringImmediately"
          }
          onClick={() => void chat.stopActiveRun()}
          title="Stop run"
          type="button"
          variant="secondary"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <Button
      aria-label="Send message"
      className="h-6 w-6 shrink-0 rounded-sm border-primary bg-primary px-0 text-primary-foreground hover:bg-primary/90 disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
      disabled={!canSend}
      title="Send message"
      type="submit"
      variant="primary"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
