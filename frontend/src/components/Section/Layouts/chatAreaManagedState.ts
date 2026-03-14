import {
  buildChatSlashCommands,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import { resolveAuthoritativeContextTelemetry } from "components/Chat/contextTelemetry";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
import {
  getChatPlaceholderText,
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import { filterManagedChatThreadSlashCommands } from "components/Chat/sharePolicyChatAccess";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { type ChatDetails } from "state/stores/aiStore";
import { hasPendingToolInteraction } from "utils/claudeTools";
import {
  type AgentProfile,
  type AllLLMConfigs,
  type APIKeys,
  type BaseChatMessageUnion,
  type EngineConfig,
  EngineTypeEnum,
  type ExternalAgentConfig,
  type ExternalAgentPreflightStatus,
  type TranscriptionProfile,
} from "utils/generatedTypes";
import { resolveManagedChatRunType } from "./ChatAreaHistoryPanel";

export type ManagedChatDerivedState = ReturnType<
  typeof resolveManagedChatDerivedState
>;

export function resolveManagedChatDerivedState({
  allLLMConfigs,
  apiKeys,
  apiKeysAuthoritative,
  agentProfiles,
  engineConfigs,
  transcriptionProfiles,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
  externalAgentConfigs,
  engineConfigId,
  transcriptionProfileId,
  agentProfileId,
  permissionMode,
  contextUsage,
  canUseManagedChat,
  messages,
  waitingForResponse,
}: {
  allLLMConfigs: AllLLMConfigs | null;
  apiKeys: APIKeys;
  apiKeysAuthoritative: boolean;
  agentProfiles: Array<AgentProfile>;
  engineConfigs: Array<EngineConfig>;
  transcriptionProfiles: Array<TranscriptionProfile>;
  externalAgentHealth: Array<ExternalAgentPreflightStatus>;
  externalAgentHealthInitialLoadComplete: boolean;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  engineConfigId: string | null;
  transcriptionProfileId: string | null;
  agentProfileId: string | null;
  permissionMode: ChatPermissionModeValue;
  contextUsage: ChatDetails["contextUsage"];
  canUseManagedChat: boolean;
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
}) {
  const availableConfigGroups = buildLLMConfigGroups(allLLMConfigs, apiKeys);
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;
  const selectedProfile = resolveManagedAgentProfile(
    agentProfiles,
    agentProfileId,
  );
  const effectiveEngineConfigId =
    engineConfigId ?? selectedProfile?.engineConfigId ?? null;
  const selectedEngineConfig = resolveManagedEngineConfig(
    engineConfigs,
    effectiveEngineConfigId,
  );
  const engineType = selectedEngineConfig?.engineType ?? null;
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
  const historyCompatibility = resolveManagedHistoryCompatibility(
    engineType,
    effectiveEngineConfigId,
  );
  const selectedLLMConfigId = resolveManagedLLMConfigId(
    selectedEngineConfig,
    allLLMConfigs,
  );
  const selectedTranscriptionProfile = resolveManagedTranscriptionProfile(
    transcriptionProfiles,
    transcriptionProfileId,
  );
  const { providerDictationAvailable } = resolveProviderDictationAvailability({
    selectedTranscriptionProfile,
    allLLMConfigs,
    apiKeys,
    apiKeysAuthoritative,
  });
  const hasEngineConfig = Boolean(selectedEngineConfig);
  const hasLLMConfig = Boolean(selectedLLMConfigId);
  const externalEngineStatus = getExternalEngineStatus(
    selectedEngineConfig,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  );
  const externalEngineAvailable =
    externalEngineStatus?.status === "available" ||
    externalEngineStatus === null;
  const externalAgentConfig = resolveManagedExternalAgentConfig(
    externalAgentConfigs,
    selectedEngineConfig,
  );
  const {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
  } = resolveAuthoritativeContextTelemetry(contextUsage);
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode,
  });
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig,
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const externalEngineIssueMessage =
    getExternalEngineIssueMessage(externalEngineStatus);
  const slashCommands = buildManagedChatSlashCommands(canUseManagedChat);
  const isDisabled =
    !canUseManagedChat ||
    !hasEngineConfig ||
    (!isExternalEngine && (!hasLLMConfig || noConfigsAvailable)) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = canUseManagedChat
    ? getChatEditDisabledReason({
        hasEngineConfig,
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        noLLMConfigsAvailable: noConfigsAvailable,
      })
    : "Editing disabled by share policy.";
  const submitDisabled =
    !waitingForResponse && hasPendingToolInteraction(messages);

  return {
    effectiveEngineConfigId,
    historyCompatibility,
    isExternalEngine,
    providerDictationAvailable,
    providerDictationLikelySupported: providerDictationAvailable,
    hasEngineConfig,
    hasLLMConfig,
    externalEngineAvailable,
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
    showPlanModeBadge,
    placeholderText,
    externalEngineIssueMessage,
    slashCommands,
    isDisabled,
    editDisabledReason,
    submitDisabled,
  };
}

function resolveManagedAgentProfile(
  agentProfiles: Array<AgentProfile>,
  agentProfileId: string | null,
): AgentProfile | null {
  if (!agentProfileId) {
    return null;
  }
  return agentProfiles.find((profile) => profile.id === agentProfileId) ?? null;
}

function resolveManagedEngineConfig(
  engineConfigs: Array<EngineConfig>,
  effectiveEngineConfigId: string | null,
): EngineConfig | null {
  if (!effectiveEngineConfigId) {
    return null;
  }
  return (
    engineConfigs.find((config) => config.id === effectiveEngineConfigId) ??
    null
  );
}

function resolveManagedHistoryCompatibility(
  engineType: EngineTypeEnum | null,
  effectiveEngineConfigId: string | null,
): ChatHistoryCompatibility | null {
  const runType = resolveManagedChatRunType(engineType);
  if (!runType) {
    return null;
  }
  return {
    runType,
    engineConfigId: effectiveEngineConfigId ?? null,
  };
}

function resolveManagedLLMConfigId(
  selectedEngineConfig: EngineConfig | null,
  allLLMConfigs: AllLLMConfigs | null,
): string | null {
  if (!selectedEngineConfig) {
    return null;
  }
  if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
    return null;
  }
  return (
    selectedEngineConfig.settaLlmConfigId ?? pickDefaultConfigId(allLLMConfigs)
  );
}

function resolveManagedTranscriptionProfile(
  transcriptionProfiles: Array<TranscriptionProfile>,
  transcriptionProfileId: string | null,
): TranscriptionProfile | null {
  if (!transcriptionProfileId) {
    return null;
  }
  return (
    transcriptionProfiles.find(
      (profile) => profile.id === transcriptionProfileId,
    ) ?? null
  );
}

function resolveManagedExternalAgentConfig(
  externalAgentConfigs: Array<ExternalAgentConfig>,
  selectedEngineConfig: EngineConfig | null,
): ExternalAgentConfig | null {
  if (!selectedEngineConfig?.externalAgentConfigId) {
    return null;
  }
  return (
    externalAgentConfigs.find(
      (config) => config.id === selectedEngineConfig.externalAgentConfigId,
    ) ?? null
  );
}

function buildManagedChatSlashCommands(
  canUseManagedChat: boolean,
): ChatSlashCommandDefinition[] {
  return filterManagedChatThreadSlashCommands(
    buildChatSlashCommands({
      model: false,
      permissions: false,
      search: false,
    }),
    canUseManagedChat,
  );
}
