import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import {
  type AllLLMConfigs,
  type EngineConfig,
  EngineTypeEnum,
  type ExternalAgentPreflightStatus,
} from "utils/generatedTypes";

type ResolveProjectChatEngineConfigIdForSelectedChatInput = {
  chatId: string | null | undefined;
  selectedEngineId: string | null;
  availableEngineConfigIds: Set<string>;
  chatEngineConfigByChatId: Map<string, string | null>;
};

type ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput = {
  engineConfigsInitialLoadComplete: boolean;
  engineConfigs: EngineConfig[];
  selectedEngineId: string | null;
  preferredEngineId: string | null;
};

type ResolveProjectChatSelectedLLMUnavailableReasonInput = {
  engineType: EngineTypeEnum | null;
  selectedLLMConfigId: string | null;
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
};

export type ProjectChatEngineSwitchContinuation = {
  sourceChatId: string;
  sourceEngineConfigId: string;
  targetEngineConfigId: string | null;
};

type ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput = {
  chatId: string | null | undefined;
  nextEngineId: string | null;
  chatEngineConfigByChatId: Map<string, string | null>;
};

type ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
  selectedEngineId: string | null;
};

type ShouldProjectChatSkipEngineSyncForContinuationInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
};

type FindPreferredProjectChatEngineIdInput = {
  engineConfigs: EngineConfig[];
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: ExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
};

type IsProjectChatEngineUsableInput = FindPreferredProjectChatEngineIdInput & {
  config: EngineConfig;
};

export function resolveProjectChatEngineConfigIdForSelectedChat({
  chatId,
  selectedEngineId,
  availableEngineConfigIds,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineConfigIdForSelectedChatInput): string | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const resolvedEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!resolvedEngineConfigId) {
    return null;
  }
  if (!availableEngineConfigIds.has(resolvedEngineConfigId)) {
    return null;
  }
  if (resolvedEngineConfigId === selectedEngineId) {
    return null;
  }
  return resolvedEngineConfigId;
}

export function resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
  engineConfigsInitialLoadComplete,
  engineConfigs,
  selectedEngineId,
  preferredEngineId,
}: ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput):
  | string
  | null {
  if (!engineConfigsInitialLoadComplete) {
    return selectedEngineId;
  }
  if (engineConfigs.length === 0) {
    return null;
  }
  if (
    selectedEngineId &&
    engineConfigs.some((config) => config.id === selectedEngineId)
  ) {
    return selectedEngineId;
  }
  return preferredEngineId ?? engineConfigs[0].id;
}

export function resolveProjectChatSelectedLLMUnavailableReason({
  engineType,
  selectedLLMConfigId,
  allLLMConfigs,
  availableConfigIds,
}: ResolveProjectChatSelectedLLMUnavailableReasonInput): string | null {
  if (engineType !== EngineTypeEnum.setta_llm) {
    return null;
  }
  if (!selectedLLMConfigId) {
    return null;
  }
  if (availableConfigIds.has(selectedLLMConfigId)) {
    return null;
  }
  const selectedConfig = allLLMConfigs?.configs[selectedLLMConfigId];
  if (!selectedConfig) {
    return "Selected model is unavailable.";
  }
  const requiredApiKeyEnv = selectedConfig.api_key_env?.trim() ?? "";
  if (requiredApiKeyEnv) {
    return `Selected model is unavailable. Missing API key: ${requiredApiKeyEnv}.`;
  }
  return "Selected model is unavailable.";
}

export function resolveProjectChatEngineSwitchContinuationOnEngineChange({
  chatId,
  nextEngineId,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput): ProjectChatEngineSwitchContinuation | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const sourceEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!sourceEngineConfigId) {
    return null;
  }
  if (sourceEngineConfigId === nextEngineId) {
    return null;
  }
  return {
    sourceChatId: resolvedChatId,
    sourceEngineConfigId,
    targetEngineConfigId: nextEngineId,
  };
}

export function resolveProjectChatEngineSwitchContinuationAfterContextChange({
  continuation,
  chatId,
  selectedEngineId,
}: ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput): ProjectChatEngineSwitchContinuation | null {
  if (!continuation) {
    return null;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  if (resolvedChatId !== continuation.sourceChatId) {
    return null;
  }
  if (selectedEngineId === continuation.sourceEngineConfigId) {
    return null;
  }
  return continuation;
}

export function shouldProjectChatSkipEngineSyncForContinuation({
  continuation,
  chatId,
}: ShouldProjectChatSkipEngineSyncForContinuationInput): boolean {
  if (!continuation) {
    return false;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  return resolvedChatId !== "" && resolvedChatId === continuation.sourceChatId;
}

export function findPreferredProjectChatEngineId({
  engineConfigs,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: FindPreferredProjectChatEngineIdInput): string | null {
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.setta_llm) {
      continue;
    }
    if (
      isProjectChatEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.external_agent) {
      continue;
    }
    if (
      isProjectChatEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  return engineConfigs[0]?.id ?? null;
}

function isProjectChatEngineUsable({
  config,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: IsProjectChatEngineUsableInput): boolean {
  if (config.engineType === EngineTypeEnum.setta_llm) {
    const fallbackConfigId = pickDefaultConfigId(allLLMConfigs);
    const configId = config.settaLlmConfigId ?? fallbackConfigId;
    return Boolean(configId && availableConfigIds.has(configId));
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    if (!externalAgentHealthInitialLoadComplete) {
      return true;
    }
    const configId = config.externalAgentConfigId;
    const status = externalAgentHealth.find(
      (entry) => entry.configId === configId,
    );
    return Boolean(status?.available && status.supported);
  }
  return false;
}
