import { NULL_PROJECT_CONFIG_ID, type StoredLLMSelection } from "state/definitions";
import {
  type LLMConfigPayload,
  type LLMModelSelection,
  type LLMProviderConfigPayload,
} from "utils/generatedTypes";
import { encodeModelSelectionKey } from "utils/llmSelection";

export type SelectionLookup = Map<string, StoredLLMSelection>;

export function makeStoredSelection(params: {
  providerId: string;
  modelId: string;
  providerDisplayName?: string | null;
  modelDisplayName?: string | null;
}): StoredLLMSelection {
  return {
    providerId: params.providerId,
    modelId: params.modelId,
    providerDisplayName: params.providerDisplayName ?? params.providerId,
    modelDisplayName: params.modelDisplayName ?? params.modelId,
  };
}

export function selectionToKey(selection: StoredLLMSelection | null): string | null {
  if (!selection) {
    return null;
  }
  return encodeModelSelectionKey({
    providerId: selection.providerId,
    modelId: selection.modelId,
  });
}

export function buildSelectionLookup(
  providers: LLMProviderConfigPayload[],
): SelectionLookup {
  const lookup: SelectionLookup = new Map();
  for (const provider of providers) {
    const providerDisplayName = provider.display_name ?? provider.provider_id;
    for (const model of provider.models ?? []) {
      const selection = makeStoredSelection({
        providerId: provider.provider_id,
        modelId: model.model_id,
        providerDisplayName,
        modelDisplayName: model.display_name,
      });
      const key = selectionToKey(selection);
      if (key) {
        lookup.set(key, selection);
      }
    }
  }
  return lookup;
}

export function findDefaultModelSelection(
  providers: LLMProviderConfigPayload[],
  lookup: SelectionLookup,
): StoredLLMSelection | null {
  for (const provider of providers) {
    const defaultModelId = provider.default_model_id;
    if (!defaultModelId) {
      continue;
    }
    const key = encodeModelSelectionKey({
      providerId: provider.provider_id,
      modelId: defaultModelId,
    });
    const selection = lookup.get(key);
    if (selection) {
      return selection;
    }
  }
  return null;
}

export function resolveProjectConfigId(
  projectConfigId: string | null | undefined,
): string | null {
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  return projectConfigId;
}

export function normalizeProjectConfigId(
  projectConfigId: string | null | undefined,
): string {
  return projectConfigId ?? NULL_PROJECT_CONFIG_ID;
}

function getProvidersForProjectInternal(
  config: LLMConfigPayload,
  projectConfigId: string | null,
): LLMProviderConfigPayload[] {
  if (projectConfigId) {
    const projectConfig = config.project_configs[projectConfigId];
    if (projectConfig) {
      return projectConfig.providers ?? [];
    }
  }
  const defaultProjectId = resolveProjectConfigId(
    config.default_project_config_id,
  );
  if (defaultProjectId) {
    const defaultProject = config.project_configs[defaultProjectId];
    if (defaultProject) {
      return defaultProject.providers ?? [];
    }
  }
  return config.providers ?? [];
}

export function getProvidersForProject(
  config: LLMConfigPayload | null,
  projectConfigId: string | null | undefined,
): LLMProviderConfigPayload[] {
  if (!config) {
    return [];
  }
  const resolvedProjectId = resolveProjectConfigId(projectConfigId);
  return getProvidersForProjectInternal(config, resolvedProjectId);
}

export function hydrateSelectionFromConfig(
  selection: LLMModelSelection | null | undefined,
  config: LLMConfigPayload | null,
  projectConfigId: string | null | undefined = null,
): StoredLLMSelection | null {
  if (!selection) {
    return null;
  }
  if (!config) {
    return makeStoredSelection({
      providerId: selection.providerId,
      modelId: selection.modelId,
    });
  }
  const providers = getProvidersForProject(config, projectConfigId);
  const provider = providers.find(
    (candidate) => candidate.provider_id === selection.providerId,
  );
  const model = provider?.models?.find(
    (candidate) => candidate.model_id === selection.modelId,
  );
  return makeStoredSelection({
    providerId: selection.providerId,
    modelId: selection.modelId,
    providerDisplayName: provider?.display_name,
    modelDisplayName: model?.display_name,
  });
}
