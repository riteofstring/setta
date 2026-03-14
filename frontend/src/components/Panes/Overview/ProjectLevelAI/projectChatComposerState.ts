import {
  type ChatPermissionModeValue,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import { hasPendingToolInteraction } from "utils/claudeTools";
import {
  type BaseChatMessageUnion,
  EngineTypeEnum,
} from "utils/generatedTypes";
import {
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatRuntimeActivityDetails,
} from "./projectChatRuntimeUtils";

type ProjectChatExecutionControlHandlers = {
  onPermissionModeChange: (nextMode: ChatPermissionModeValue) => void;
  onSearchEnabledChange: (nextValue: boolean) => void;
};

type ProjectChatExecutionControls = {
  thinkingEnabled: boolean;
  onThinkingEnabledChange: ((nextThinking: boolean) => void) | undefined;
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
  onPermissionModeChange: (nextMode: ChatPermissionModeValue) => void;
  onSearchEnabledChange: (nextValue: boolean) => void;
};

export function resolveProjectChatComposerDerivedState({
  requiresNewThreadContinuation,
  engineConfigId,
  hasLLMConfig,
  isExternalEngine,
  externalEngineAvailable,
  noLLMConfigsAvailable,
  newThreadContinuationRequiredReason,
  messages,
  waitingForResponse,
  engineType,
  thinking,
  onThinkingChange,
  executionSettings,
  executionControlHandlers,
  normalizedConversationSearchTerms,
  hasVisibleConversationMatches,
  providerDictationAvailable,
  showEmptyState,
  contextUsageUnavailable,
}: {
  requiresNewThreadContinuation: boolean;
  engineConfigId: string | null;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  newThreadContinuationRequiredReason: string | null;
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  engineType: EngineTypeEnum | null;
  thinking: boolean;
  onThinkingChange?: (nextThinking: boolean) => void;
  executionSettings: ManagedChatExecutionSettings;
  executionControlHandlers: ProjectChatExecutionControlHandlers;
  normalizedConversationSearchTerms: Array<string>;
  hasVisibleConversationMatches: boolean;
  providerDictationAvailable: boolean;
  showEmptyState: boolean;
  contextUsageUnavailable: boolean;
}) {
  const isDisabled =
    requiresNewThreadContinuation ||
    !engineConfigId ||
    (!isExternalEngine && !hasLLMConfig) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = newThreadContinuationRequiredReason
    ? newThreadContinuationRequiredReason
    : getChatEditDisabledReason({
        hasEngineConfig: Boolean(engineConfigId),
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        noLLMConfigsAvailable,
      });
  const submitDisabled =
    requiresNewThreadContinuation ||
    (!waitingForResponse && hasPendingToolInteraction(messages));
  const runtimeActivityDetails = resolveProjectChatRuntimeActivityDetails({
    messages,
    waitingForResponse,
  });
  const runtimeActivityCounts = {
    activeBackgroundTerminals:
      runtimeActivityDetails.activeBackgroundTerminals.length,
    activeSubagents: runtimeActivityDetails.activeSubagents.length,
  };
  const showThinkingExecutionControl =
    engineType === EngineTypeEnum.setta_llm ||
    engineType === EngineTypeEnum.external_agent;
  const executionControls: ProjectChatExecutionControls = {
    thinkingEnabled: thinking,
    onThinkingEnabledChange: showThinkingExecutionControl
      ? onThinkingChange
      : undefined,
    permissionMode: executionSettings.permissionMode,
    searchEnabled: executionSettings.searchEnabled,
    onPermissionModeChange: executionControlHandlers.onPermissionModeChange,
    onSearchEnabledChange: executionControlHandlers.onSearchEnabledChange,
  };
  const showConversationSearchEmptyState =
    normalizedConversationSearchTerms.length > 0 &&
    !hasVisibleConversationMatches &&
    !waitingForResponse;

  return {
    isDisabled,
    editDisabledReason,
    submitDisabled,
    runtimeActivityDetails,
    runtimeActivityCounts,
    executionControls,
    providerDictationTranscribeEnabled:
      resolveProjectChatProviderDictationTranscribeEnabled({
        providerDictationAvailable,
      }),
    showConversationSearchEmptyState,
    chatInputContextUsageUnavailable: showEmptyState
      ? false
      : contextUsageUnavailable,
  };
}
