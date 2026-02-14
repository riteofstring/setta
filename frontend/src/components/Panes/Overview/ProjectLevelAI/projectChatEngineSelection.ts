import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import {
  AllLLMConfigs,
  EngineConfig,
  EngineTypeEnum,
  ExternalAgentPreflightStatus,
} from "utils/generatedTypes";

type EngineSelectionContext = {
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: ExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
};

export function isProjectChatEngineUsable(
  config: EngineConfig,
  context: EngineSelectionContext,
): boolean {
  const {
    allLLMConfigs,
    availableConfigIds,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  } = context;
  if (config.engineType === EngineTypeEnum.setta_llm) {
    const fallbackConfigId = pickDefaultConfigId(allLLMConfigs);
    const configId = config.settaLlmConfigId ?? fallbackConfigId;
    return Boolean(configId && availableConfigIds.has(configId));
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    if (!externalAgentHealthInitialLoadComplete) {
      return true;
    }
    const status = externalAgentHealth.find(
      (entry) => entry.configId === config.externalAgentConfigId,
    );
    return Boolean(status?.available && status.supported);
  }
  return false;
}

export function findPreferredProjectChatEngineId(
  engineConfigs: EngineConfig[],
  context: EngineSelectionContext,
): string | null {
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.setta_llm) {
      continue;
    }
    if (isProjectChatEngineUsable(config, context)) {
      return config.id;
    }
  }
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.external_agent) {
      continue;
    }
    if (isProjectChatEngineUsable(config, context)) {
      return config.id;
    }
  }
  return engineConfigs[0]?.id ?? null;
}

export function resolveEffectiveProjectChatEngineId(
  engineConfigs: EngineConfig[],
  preferredEngineId: string | null,
  manuallySelectedEngineId: string | null,
): string | null {
  if (manuallySelectedEngineId) {
    const manuallySelectedExists = engineConfigs.some(
      (config) => config.id === manuallySelectedEngineId,
    );
    if (manuallySelectedExists) {
      return manuallySelectedEngineId;
    }
  }
  if (preferredEngineId) {
    const preferredExists = engineConfigs.some(
      (config) => config.id === preferredEngineId,
    );
    if (preferredExists) {
      return preferredEngineId;
    }
  }
  return engineConfigs[0]?.id ?? null;
}
