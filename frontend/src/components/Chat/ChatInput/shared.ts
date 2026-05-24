import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
import {
  type ChatDictationMode,
  ChatFileAttachment,
} from "utils/generatedTypes";
import {
  CHAT_SLASH_COMMANDS,
  type ChatSlashCommandDefinition,
} from "../chatComposerControls";
import {
  type ChatExecutionControlVisibility,
  type ChatExecutionControls,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitDispatchResult,
  type ChatSubmitOptions,
  type ChatSubmitResult,
} from "../chatInputHelpers";

export const SLASH_SUGGESTIONS_MAX_HEIGHT_PX = 208;
export const SLASH_SUGGESTIONS_EDGE_PADDING_PX = 8;
export const SLASH_SUGGESTIONS_BASE_HEIGHT_PX = 12;
export const SLASH_SUGGESTIONS_ROW_HEIGHT_PX = 36;
export const SLASH_SUGGESTIONS_INPUT_INSET_PX = 4;
export const UNKNOWN_SLASH_COMMAND_FEEDBACK =
  "Unknown or unavailable command. Use /help.";
const DEFAULT_RUNTIME_ACTIVITY_COUNTS: ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: 0,
  activeSubagents: 0,
};
const DEFAULT_RUNTIME_ACTIVITY_DETAILS: ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: [],
  activeSubagents: [],
};
const DEFAULT_EXECUTION_CONTROL_VISIBILITY: ChatExecutionControlVisibility = {
  permissionMode: true,
  search: true,
};
const DEFAULT_SUBMITTED_MESSAGE_HISTORY: string[] = [];
export const CHAT_COMPOSER_GPU_FLOW_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`;

export function normalizeNonNegativeCount(
  value: number | null | undefined,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export type ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: number;
  activeSubagents: number;
};

export type ChatRuntimeActivityEntry = {
  id: string;
  label: string;
  toolName: string;
};

export type ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: ChatRuntimeActivityEntry[];
  activeSubagents: ChatRuntimeActivityEntry[];
};

export function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = millions >= 10 ? 0 : 1;
    return `${millions.toFixed(digits).replace(/\.0$/u, "")}m`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    const digits = thousands >= 10 ? 0 : 1;
    return `${thousands.toFixed(digits).replace(/\.0$/u, "")}k`;
  }
  return `${value}`;
}

export type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

export type {
  ChatSlashCommand,
  ChatSlashCommandResult,
  ChatSubmitDispatchResult,
  ChatSubmitOptions,
} from "../chatInputHelpers";

export type ChatInputProps = {
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  hasRetainedImageAttachmentForImageMode?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (
    message: string,
    attachments: ChatFileAttachment[],
    options?: ChatSubmitOptions,
  ) => Promise<ChatSubmitResult> | ChatSubmitResult;
  submitReadinessKey?: string | null;
  onUnknownSlashCommand?: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<ChatSlashCommandResult> | ChatSlashCommandResult;
  onStop?: () => Promise<void> | void;
  executionControls?: ChatExecutionControls;
  executionControlVisibility?: ChatExecutionControlVisibility;
  slashCommands?: ChatSlashCommandDefinition[];
  recognizedSlashCommands?: ChatSlashCommandDefinition[];
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;
  slashSuggestionsPlacement?: "auto" | "above" | "below";
  dictationMode?: ChatDictationMode;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  dictationEnabledByProvider?: boolean;
  providerDictationLikelySupported?: boolean;
  contextWindowTokens?: number | null;
  contextUsedTokens?: number | null;
  contextUsageIsEstimated?: boolean;
  submittedMessageHistory?: string[];
  runtimeActivityCounts?: ChatRuntimeActivityCounts;
  runtimeActivityDetails?: ChatRuntimeActivityDetails;
};

export type EscClearedComposerDraft = {
  message: string;
  attachments: ChatFileAttachment[];
};

export type SubmitRemotelyHandler = (args: {
  draftToRestore?: EscClearedComposerDraft | undefined;
  message: string;
  submittedAttachments: ChatFileAttachment[];
  options?: ChatSubmitOptions | undefined;
  fallbackFailureResult: Exclude<ChatSubmitDispatchResult, "submitted">;
}) => Promise<ChatSubmitDispatchResult>;

export type NormalizedSlashCommandResult = Exclude<
  ChatSlashCommandResult,
  boolean
>;
export type FloatingBoxHandlers = ReturnType<typeof getFloatingBoxHandlers>;

function resolveChatInputUIProps(props: ChatInputProps) {
  return {
    disabled: props.disabled ?? false,
    submitDisabled: props.submitDisabled ?? false,
    hasRetainedImageAttachmentForImageMode:
      props.hasRetainedImageAttachmentForImageMode ?? false,
    submitReadinessKey: props.submitReadinessKey ?? null,
    executionControlVisibility:
      props.executionControlVisibility ?? DEFAULT_EXECUTION_CONTROL_VISIBILITY,
    slashCommands: props.slashCommands ?? CHAT_SLASH_COMMANDS,
    slashSuggestionsPlacement: props.slashSuggestionsPlacement ?? "auto",
  };
}

function resolveChatInputDictationProps(props: ChatInputProps) {
  return {
    dictationMode: props.dictationMode ?? "auto",
    dictationEnabledByProvider: props.dictationEnabledByProvider ?? true,
    providerDictationLikelySupported:
      props.providerDictationLikelySupported ?? true,
  };
}

function resolveChatInputContextProps(props: ChatInputProps) {
  return {
    contextWindowTokens: props.contextWindowTokens ?? null,
    contextUsedTokens: props.contextUsedTokens ?? null,
    contextUsageIsEstimated: props.contextUsageIsEstimated ?? false,
    submittedMessageHistory:
      props.submittedMessageHistory ?? DEFAULT_SUBMITTED_MESSAGE_HISTORY,
    runtimeActivityCounts:
      props.runtimeActivityCounts ?? DEFAULT_RUNTIME_ACTIVITY_COUNTS,
    runtimeActivityDetails:
      props.runtimeActivityDetails ?? DEFAULT_RUNTIME_ACTIVITY_DETAILS,
  };
}

export function resolveChatInputProps(props: ChatInputProps) {
  const uiProps = resolveChatInputUIProps(props);
  const dictationProps = resolveChatInputDictationProps(props);
  const contextProps = resolveChatInputContextProps(props);
  return {
    placeholderText: props.placeholderText,
    waitingForResponse: props.waitingForResponse,
    value: props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onUnknownSlashCommand: props.onUnknownSlashCommand,
    onStop: props.onStop,
    executionControls: props.executionControls,
    recognizedSlashCommands: props.recognizedSlashCommands,
    onSlashCommand: props.onSlashCommand,
    onProviderDictationTranscribe: props.onProviderDictationTranscribe,
    ...uiProps,
    ...dictationProps,
    ...contextProps,
  };
}
