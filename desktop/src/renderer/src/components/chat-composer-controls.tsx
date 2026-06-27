import type {
  ChatCommandExecuteResult,
  ChatCodexEffectiveSettings,
  ChatModelOption,
  ChatReasoningEffortOption,
  Conversation,
  ReasoningEffort,
} from "@generated/backend";
import { ArrowUp, ChevronDown, MessageSquarePlus, Mic, Settings, Square, Zap } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const REASONING_EFFORT_DISPLAY_NAMES = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
} satisfies Record<ReasoningEffort, string>;

export interface ComposerKeyActions {
  completeCommand: () => void;
  draftEmpty: boolean;
  dismissModelPicker: () => void;
  hasPendingSteering: boolean;
  modelPickerOpen: boolean;
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
  if (isDismissShortcut(event, actions.modelPickerOpen)) {
    event.preventDefault();
    actions.dismissModelPicker();
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

function isDismissShortcut(event: KeyboardEvent<HTMLTextAreaElement>, modelPickerOpen: boolean) {
  return modelPickerOpen && event.key === "Escape";
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

export function PermissionModeUnavailableButton() {
  return (
    <DisabledComposerPill
      icon={<Settings className="h-3.5 w-3.5" />}
      label="Custom"
      reason="Permission presets are not wired to a current Setta API."
    />
  );
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

function DisabledComposerPill({
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
      className="inline-flex h-6 min-w-0 items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
      disabled
      title={reason}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3 w-3 shrink-0" />
    </button>
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
    return effectiveSettings.model;
  }
  return "Model";
}

function conversationReasoningSummary(effectiveSettings: ChatCodexEffectiveSettings | null) {
  if (effectiveSettings === null) {
    return "Reasoning";
  }
  const reasoningEffort = effectiveSettings.reasoningEffort;
  if (reasoningEffort) {
    return REASONING_EFFORT_DISPLAY_NAMES[reasoningEffort];
  }
  return "None";
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
