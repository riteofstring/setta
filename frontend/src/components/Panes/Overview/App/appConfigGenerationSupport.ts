import { loadLLMApiKeys, loadLLMConfig } from "state/actions/ai/llmSettings";
import {
  loadEngineConfigs,
  loadExternalAgentHealth,
} from "state/actions/ai/projectAiResources";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore, useProjectState } from "state/definitions";
import { loadAppCatalogPromptSummary } from "./appConfigApi";
import {
  waitForHiddenGenerationResourcesLoaded,
  type ExternalAgentHealthStatus,
} from "./appConfigHiddenGenerationUtils";
import { formatSectionsForAppPrompt } from "./appConfigPromptUtils";

type HiddenGenerationConfigRecord = {
  api_key_env?: string | null;
};

type HiddenGenerationHealthRecord = {
  configId: string;
  available: boolean;
  supported: boolean;
};

type HiddenGenerationLoadState = {
  allLLMConfigsInitialLoadComplete: boolean;
  apiKeysInitialLoadComplete: boolean;
  engineConfigsInitialLoadComplete: boolean;
  externalAgentHealthInitialLoadComplete: boolean;
};

type HiddenGenerationSelectionState = {
  allLLMConfigs?: {
    configs?: Record<string, HiddenGenerationConfigRecord>;
  } | null;
  apiKeys: Record<string, string | null | undefined>;
  externalAgentHealth: HiddenGenerationHealthRecord[];
};

export async function prepareAppConfigPromptContext({
  catalogId,
  setCatalogId,
}: {
  catalogId: string;
  setCatalogId: (catalogId: string) => void;
}): Promise<{
  catalogSummary: string;
  sectionsSummary: string;
}> {
  let catalogSummary = `Catalog: ${catalogId}`;
  const catalogRes = await loadAppCatalogPromptSummary();
  if (catalogRes.ok) {
    catalogSummary = catalogRes.value.catalogSummary;
    if (catalogRes.value.catalogId) {
      setCatalogId(catalogRes.value.catalogId);
    }
  } else {
    addTemporaryNotification(catalogRes.error);
  }
  return {
    catalogSummary,
    sectionsSummary: formatSectionsForAppPrompt(useProjectState.getState()),
  };
}

export function buildAvailableHiddenGenerationLLMConfigIds(
  aiState: HiddenGenerationSelectionState,
): Set<string> {
  const availableLLMConfigIds = new Set<string>();
  if (!aiState.allLLMConfigs?.configs) {
    return availableLLMConfigIds;
  }
  for (const [configId, config] of Object.entries(
    aiState.allLLMConfigs.configs,
  )) {
    if (config.api_key_env && !aiState.apiKeys[config.api_key_env]) {
      continue;
    }
    availableLLMConfigIds.add(configId);
  }
  return availableLLMConfigIds;
}

export function buildExternalAgentHealthByConfigId(
  aiState: HiddenGenerationSelectionState,
): Map<string, ExternalAgentHealthStatus> {
  const externalAgentHealthByConfigId = new Map<
    string,
    ExternalAgentHealthStatus
  >();
  for (const health of aiState.externalAgentHealth) {
    externalAgentHealthByConfigId.set(health.configId, {
      available: health.available,
      supported: health.supported,
    });
  }
  return externalAgentHealthByConfigId;
}

export async function ensureAppConfigHiddenGenerationResources(
  state: HiddenGenerationLoadState = useAIStore.getState(),
): Promise<void> {
  const pendingLoads: Array<Promise<void>> = [];
  const shouldAwaitResourceCompletion =
    !state.allLLMConfigsInitialLoadComplete ||
    !state.apiKeysInitialLoadComplete ||
    !state.engineConfigsInitialLoadComplete ||
    !state.externalAgentHealthInitialLoadComplete;
  if (!state.allLLMConfigsInitialLoadComplete) {
    pendingLoads.push(loadLLMConfig());
  }
  if (!state.apiKeysInitialLoadComplete) {
    pendingLoads.push(loadLLMApiKeys());
  }
  if (!state.engineConfigsInitialLoadComplete) {
    pendingLoads.push(loadEngineConfigs());
  }
  if (!state.externalAgentHealthInitialLoadComplete) {
    pendingLoads.push(loadExternalAgentHealth());
  }
  if (pendingLoads.length > 0) {
    await Promise.all(pendingLoads);
  }
  if (shouldAwaitResourceCompletion) {
    await waitForHiddenGenerationResourcesLoaded();
  }
}
