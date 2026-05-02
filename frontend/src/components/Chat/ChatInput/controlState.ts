import { type CSSProperties } from "react";
import { type ChatDictationMode } from "utils/generatedTypes";
import { type ChatSlashCommandDefinition } from "../chatComposerControls";
import {
  type ChatExecutionControlVisibility,
  type ChatExecutionControls,
} from "../chatInputHelpers";
import { isDictationAvailable } from "../dictation";

export function resolveChatInputControlState(args: {
  disabled: boolean;
  internalValue: string;
  onChange?: (value: string) => void;
  recognizedSlashCommands?: ChatSlashCommandDefinition[];
  slashCommands: ChatSlashCommandDefinition[];
  submitDisabled: boolean;
  value?: string;
  isUploading: boolean;
}): {
  inputValue: string;
  isControlled: boolean;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  slashCommandRecognitionSet: ChatSlashCommandDefinition[];
} {
  const {
    disabled,
    internalValue,
    isUploading,
    onChange,
    recognizedSlashCommands,
    slashCommands,
    submitDisabled,
    value,
  } = args;
  const isControlled = typeof value === "string" && Boolean(onChange);
  return {
    inputValue: isControlled ? value : internalValue,
    isControlled,
    isDisabled: disabled,
    isSubmitDisabled: submitDisabled || disabled || isUploading,
    slashCommandRecognitionSet: recognizedSlashCommands ?? slashCommands,
  };
}

export function resolveDictationCapabilityState(args: {
  dictationEnabledByProvider: boolean;
  dictationMode: ChatDictationMode;
  dictationSupported: boolean;
  isDisabled: boolean;
  mediaRecorderSupported: boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  providerDictationLikelySupported: boolean;
}): {
  canAutoUseProviderDictation: boolean;
  canBrowserDictate: boolean;
  canDictate: boolean;
  canProviderDictate: boolean;
} {
  const {
    dictationEnabledByProvider,
    dictationMode,
    dictationSupported,
    isDisabled,
    mediaRecorderSupported,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
  } = args;
  const canBrowserDictate = isDictationAvailable(dictationSupported);
  const canProviderDictate = Boolean(
    dictationEnabledByProvider &&
      onProviderDictationTranscribe &&
      mediaRecorderSupported,
  );
  const canAutoUseProviderDictation =
    canProviderDictate && providerDictationLikelySupported;
  if (isDisabled) {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: false,
      canProviderDictate,
    };
  }
  if (dictationMode === "provider") {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: canProviderDictate,
      canProviderDictate,
    };
  }
  if (dictationMode === "browser") {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: canBrowserDictate,
      canProviderDictate,
    };
  }
  return {
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate: canAutoUseProviderDictation || canBrowserDictate,
    canProviderDictate,
  };
}

export function resolveExecutionControlState(args: {
  executionControlVisibility: ChatExecutionControlVisibility;
  executionControls?: ChatExecutionControls;
}): {
  showExecutionControls: boolean;
  showPermissionControl: boolean;
  showSearchControl: boolean;
  showThinkingControl: boolean;
} {
  const { executionControlVisibility, executionControls } = args;
  const showPermissionControl = Boolean(
    executionControls && executionControlVisibility.permissionMode !== false,
  );
  const showThinkingControl = Boolean(
    executionControls &&
      executionControlVisibility.thinking !== false &&
      typeof executionControls.onThinkingEnabledChange === "function",
  );
  const showSearchControl = Boolean(
    executionControls &&
      executionControlVisibility.search !== false &&
      typeof executionControls.onSearchEnabledChange === "function",
  );
  return {
    showExecutionControls:
      showThinkingControl || showPermissionControl || showSearchControl,
    showPermissionControl,
    showSearchControl,
    showThinkingControl,
  };
}

export function resolveContextLabelState(contextUsageIsEstimated: boolean): {
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
} {
  return {
    contextLabelPrefixCompact: contextUsageIsEstimated
      ? "est. context"
      : "context",
    contextLabelPrefixFull: contextUsageIsEstimated
      ? "est. context left"
      : "context left",
  };
}

export function resolveRuntimeActivityVisibilityState(args: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  contextRemainingValue: string | null;
  showExecutionControls: boolean;
}): {
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showContextBadge: boolean;
  showRuntimeActivityCounters: boolean;
  showSubagentDropdown: boolean;
} {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    contextRemainingValue,
    showExecutionControls,
  } = args;
  const showBackgroundTerminalDropdown =
    activeBackgroundTerminalEntries.length > 0;
  const showSubagentDropdown = activeSubagentEntries.length > 0;
  const showRuntimeActivityCounters =
    activeBackgroundTerminals > 0 || activeSubagents > 0;
  const showContextBadge = contextRemainingValue !== null;
  return {
    shouldShowComposerMetaRow:
      showExecutionControls || showContextBadge || showRuntimeActivityCounters,
    showBackgroundTerminalDropdown,
    showContextBadge,
    showRuntimeActivityCounters,
    showSubagentDropdown,
  };
}

export function resolveSlashSuggestionsDisplayState(args: {
  resolvedSlashPlacement: "above" | "below";
  shouldShowSlashSuggestions: boolean;
  slashSuggestionsPortalStyle: CSSProperties | null;
}): {
  canRenderSlashSuggestionsInPortal: boolean;
  slashSuggestionsPositionClass: string;
} {
  const {
    resolvedSlashPlacement,
    shouldShowSlashSuggestions,
    slashSuggestionsPortalStyle,
  } = args;
  return {
    canRenderSlashSuggestionsInPortal:
      shouldShowSlashSuggestions &&
      slashSuggestionsPortalStyle !== null &&
      typeof document !== "undefined" &&
      Boolean(document.body),
    slashSuggestionsPositionClass:
      resolvedSlashPlacement === "below"
        ? "top-[calc(100%+4px)]"
        : "bottom-[calc(100%+4px)]",
  };
}
