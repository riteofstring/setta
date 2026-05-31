import type {
  ChatCommandExecuteResult,
  ChatModelOption,
  ChatReasoningEffortOption,
  Conversation,
  ReasoningEffort,
} from "@generated/backend";
import { ChevronDown, Mic, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

const REASONING_EFFORT_DISPLAY_NAMES = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
} satisfies Record<ReasoningEffort, string>;

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
      className="inline-flex h-6 min-w-0 items-center gap-1 rounded-sm bg-zinc-700/55 px-1.5 text-xs text-zinc-500 disabled:cursor-not-allowed disabled:opacity-70"
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
      className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-zinc-500 disabled:cursor-not-allowed disabled:opacity-70"
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
        "inline-flex h-6 min-w-0 items-center gap-1 rounded-sm px-1.5 text-xs hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50",
        modelPicker?.result.action === "model_picker"
          ? "bg-zinc-700/80 text-zinc-100"
          : "text-zinc-400",
      )}
      disabled={disabled}
      onClick={onOpen}
      title={disabledReason ?? "Open model and reasoning picker"}
      type="button"
    >
      <span className="max-w-28 truncate font-medium text-zinc-100">{summary.model}</span>
      <span className="max-w-28 truncate text-zinc-500">{summary.reasoning}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
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
  return {
    model: selectedConversation?.codexSettings?.model || "Model",
    reasoning: conversationReasoningSummary(selectedConversation),
  };
}

function conversationReasoningSummary(selectedConversation: Conversation | null) {
  const reasoningEffort = selectedConversation?.codexSettings?.reasoningEffort;
  return reasoningEffort ? REASONING_EFFORT_DISPLAY_NAMES[reasoningEffort] : "Reasoning";
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
