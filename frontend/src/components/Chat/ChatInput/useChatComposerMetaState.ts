import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useCallback, useMemo, useState } from "react";
import { type ChatDictationMode } from "utils/generatedTypes";
import {
  type ChatExecutionControlVisibility,
  type ChatExecutionControls,
} from "../chatInputHelpers";
import {
  type DictationState,
  getSpeechRecognitionConstructor,
} from "../dictation";

import {
  resolveContextLabelState,
  resolveDictationCapabilityState,
  resolveExecutionControlState,
  resolveRuntimeActivityVisibilityState,
} from "./controlState";
import {
  type ChatRuntimeActivityCounts,
  type ChatRuntimeActivityDetails,
  type ChatRuntimeActivityEntry,
  type FloatingBoxHandlers,
  type ProviderDictationTranscriptionResult,
  formatCompactTokenCount,
  normalizeNonNegativeCount,
} from "./shared";

export function useChatComposerMetaState(args: {
  attachmentInputDisabled: boolean;
  contextUsageIsEstimated: boolean;
  contextUsedTokens?: number | null | undefined;
  contextWindowTokens?: number | null | undefined;
  dictationEnabledByProvider: boolean;
  dictationMode: ChatDictationMode;
  dictationState: DictationState;
  executionControlVisibility: ChatExecutionControlVisibility;
  executionControls?: ChatExecutionControls | undefined;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  onProviderDictationTranscribe?:
    | ((audioBlob: Blob) => Promise<ProviderDictationTranscriptionResult>)
    | undefined;
  providerDictationLikelySupported: boolean;
  runtimeActivityCounts: ChatRuntimeActivityCounts;
  runtimeActivityDetails: ChatRuntimeActivityDetails;
  waitingForResponse: boolean;
}): {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  canAutoUseProviderDictation: boolean;
  canBrowserDictate: boolean;
  canDictate: boolean;
  canProviderDictate: boolean;
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  dictationAriaLabel: string;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  handleContextBadgeToggle: () => void;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
  searchTooltipHandlers: FloatingBoxHandlers | null;
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showPermissionControl: boolean;
  showRuntimeActivityCounters: boolean;
  showSearchControl: boolean;
  showSubagentDropdown: boolean;
  showThinkingControl: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
  submitTooltipHandlers: FloatingBoxHandlers;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
} {
  const {
    attachmentInputDisabled,
    contextUsageIsEstimated,
    contextUsedTokens,
    contextWindowTokens,
    dictationEnabledByProvider,
    dictationMode,
    dictationState,
    executionControlVisibility,
    executionControls,
    isDisabled,
    isSubmitDisabled,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
    runtimeActivityCounts,
    runtimeActivityDetails,
    waitingForResponse,
  } = args;
  const [contextBadgeMode, setContextBadgeMode] = useState<
    "percentage" | "tokens"
  >("percentage");
  const dictationSupported = Boolean(getSpeechRecognitionConstructor());
  const mediaRecorderSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const {
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
  } = resolveDictationCapabilityState({
    dictationEnabledByProvider,
    dictationMode,
    dictationSupported,
    isDisabled,
    mediaRecorderSupported,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
  });
  const {
    showExecutionControls,
    showPermissionControl,
    showSearchControl,
    showThinkingControl,
  } = resolveExecutionControlState({
    executionControlVisibility,
    executionControls,
  });
  const permissionModeIconClassName = useMemo(() => {
    if (!executionControls) {
      return "text-setta-600 dark:text-setta-300";
    }
    if (executionControls.permissionMode === "yolo") {
      return "text-orange-500 dark:text-orange-400";
    }
    if (executionControls.permissionMode === "config_toml_custom") {
      return "text-amber-500 dark:text-amber-300";
    }
    return "text-setta-600 dark:text-setta-300";
  }, [executionControls?.permissionMode]);
  const thinkingIconClassName = useMemo(() => {
    if (!executionControls?.thinkingEnabled) {
      return "text-setta-600 dark:text-setta-300";
    }
    return "text-blue-600 dark:text-blue-400";
  }, [executionControls?.thinkingEnabled]);
  const normalizedContextWindowTokens = useMemo(() => {
    if (
      typeof contextWindowTokens !== "number" ||
      !Number.isFinite(contextWindowTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextWindowTokens));
  }, [contextWindowTokens]);
  const normalizedContextUsedTokens = useMemo(() => {
    if (
      typeof contextUsedTokens !== "number" ||
      !Number.isFinite(contextUsedTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextUsedTokens));
  }, [contextUsedTokens]);
  const remainingContextTokens = useMemo(() => {
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextUsedTokens === null
    ) {
      return null;
    }
    return Math.max(
      0,
      normalizedContextWindowTokens - normalizedContextUsedTokens,
    );
  }, [normalizedContextUsedTokens, normalizedContextWindowTokens]);
  const remainingContextPercentage = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextWindowTokens <= 0
    ) {
      return 0;
    }
    const rawPercentage = Math.round(
      (remainingContextTokens / normalizedContextWindowTokens) * 100,
    );
    return Math.max(0, Math.min(100, rawPercentage));
  }, [normalizedContextWindowTokens, remainingContextTokens]);
  const contextRemainingValue = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (contextBadgeMode === "tokens") {
      return `~${formatCompactTokenCount(remainingContextTokens)}`;
    }
    if (remainingContextPercentage === null) {
      return null;
    }
    return `${remainingContextPercentage}%`;
  }, [contextBadgeMode, remainingContextPercentage, remainingContextTokens]);
  const { contextLabelPrefixCompact, contextLabelPrefixFull } =
    resolveContextLabelState(contextUsageIsEstimated);
  const activeBackgroundTerminalEntries =
    runtimeActivityDetails.activeBackgroundTerminals;
  const activeSubagentEntries = runtimeActivityDetails.activeSubagents;
  const activeBackgroundTerminals = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(
          runtimeActivityCounts.activeBackgroundTerminals,
        ),
        activeBackgroundTerminalEntries.length,
      ),
    [
      activeBackgroundTerminalEntries.length,
      runtimeActivityCounts.activeBackgroundTerminals,
    ],
  );
  const activeSubagents = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(runtimeActivityCounts.activeSubagents),
        activeSubagentEntries.length,
      ),
    [activeSubagentEntries.length, runtimeActivityCounts.activeSubagents],
  );
  const {
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showContextBadge,
    showRuntimeActivityCounters,
    showSubagentDropdown,
  } = resolveRuntimeActivityVisibilityState({
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    contextRemainingValue,
    showExecutionControls,
  });
  const attachmentTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Attachments",
        content: attachmentInputDisabled
          ? "Attachments are currently unavailable."
          : "Add files from your device or project.",
      }),
    [attachmentInputDisabled],
  );
  const submitTooltipHandlers = useMemo(() => {
    if (waitingForResponse) {
      return getFloatingBoxHandlers({
        title: "Stop response",
        content: "Interrupt the active response.",
      });
    }
    if (isSubmitDisabled) {
      return getFloatingBoxHandlers({
        title: "Send",
        content: "Enter a message to send.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Send",
      content: "Submit this message.",
    });
  }, [isSubmitDisabled, waitingForResponse]);
  const thinkingTooltipHandlers = useMemo(() => {
    if (!showThinkingControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Thinking",
      content: executionControls.thinkingEnabled
        ? "Reasoning is enabled for new messages."
        : "Reasoning is disabled for new messages.",
    });
  }, [executionControls, showThinkingControl]);
  const permissionTooltipHandlers = useMemo(() => {
    if (!executionControls || !showPermissionControl) {
      return null;
    }
    const modeLabel = executionControls.permissionMode.replaceAll("_", " ");
    return getFloatingBoxHandlers({
      title: "Permissions",
      content: `Current mode: ${modeLabel}`,
    });
  }, [executionControls, showPermissionControl]);
  const dictationAriaLabel = useMemo(() => {
    if (dictationState === "listening") {
      return "Stop Mic";
    }
    if (dictationState === "transcribing") {
      return "Transcribing";
    }
    return "Mic";
  }, [dictationState]);
  const dictationTooltipHandlers = useMemo(() => {
    if (!canDictate) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Dictation",
      content: dictationAriaLabel,
    });
  }, [canDictate, dictationAriaLabel]);
  const backgroundTerminalTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Background terminals",
      content: showBackgroundTerminalDropdown
        ? `${activeBackgroundTerminals} active. Click to view running terminals.`
        : `${activeBackgroundTerminals} active`,
    });
  }, [
    activeBackgroundTerminals,
    showBackgroundTerminalDropdown,
    showRuntimeActivityCounters,
  ]);
  const subagentTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Subagents",
      content: showSubagentDropdown
        ? `${activeSubagents} active. Click to view running subagents.`
        : `${activeSubagents} active`,
    });
  }, [activeSubagents, showRuntimeActivityCounters, showSubagentDropdown]);
  const contextTooltipHandlers = useMemo(() => {
    if (!showContextBadge) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Context",
      content:
        contextBadgeMode === "tokens"
          ? "Click to show remaining context percentage."
          : "Click to show remaining context tokens.",
    });
  }, [contextBadgeMode, showContextBadge]);
  const searchTooltipHandlers = useMemo(() => {
    if (!showSearchControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Search",
      content: executionControls.searchEnabled
        ? "Search is enabled for new messages."
        : "Search is disabled for new messages.",
    });
  }, [executionControls, showSearchControl]);
  const handleContextBadgeToggle = useCallback(() => {
    setContextBadgeMode((current) =>
      current === "percentage" ? "tokens" : "percentage",
    );
  }, []);
  return {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    attachmentTooltipHandlers,
    backgroundTerminalTooltipHandlers,
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    dictationAriaLabel,
    dictationTooltipHandlers,
    handleContextBadgeToggle,
    permissionModeIconClassName,
    permissionTooltipHandlers,
    searchTooltipHandlers,
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showPermissionControl,
    showRuntimeActivityCounters,
    showSearchControl,
    showSubagentDropdown,
    showThinkingControl,
    subagentTooltipHandlers,
    submitTooltipHandlers,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  };
}
