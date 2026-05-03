import type { HttpapiLlmapiKeysSnapshot } from "openapi/http";
import { AllConfigs } from "utils/generatedTypes";

type APIKeys = HttpapiLlmapiKeysSnapshot["apiKeys"];
type LLMConfig = AllConfigs["configs"][string];

type LLMConfigGroup = {
  group: string;
  items: Array<{ id: string; name: string }>;
};

function shouldIncludeLLMConfig(
  config: LLMConfig,
  apiKeys: APIKeys,
  includeConfigsWithoutApiKey: boolean,
): boolean {
  return (
    includeConfigsWithoutApiKey ||
    !config.api_key_env ||
    config.api_key_env in apiKeys
  );
}

function resolveLLMConfigGroupName(config: LLMConfig): string {
  return config.provider || "LLM Configs";
}

function resolveLLMConfigName(config: LLMConfig): string {
  const descriptorParts = [config.provider, config.base_url].filter(
    (value): value is string => Boolean(value),
  );
  const descriptor =
    descriptorParts.length > 0 ? ` (${descriptorParts.join(" · ")})` : "";
  return `${config.model}${descriptor}`;
}

function addLLMConfigGroupItem(
  groups: Map<string, LLMConfigGroup>,
  configId: string,
  config: LLMConfig,
): void {
  const groupName = resolveLLMConfigGroupName(config);
  const existingGroup = groups.get(groupName);
  const item = { id: configId, name: resolveLLMConfigName(config) };
  if (existingGroup) {
    existingGroup.items.push(item);
    return;
  }
  groups.set(groupName, { group: groupName, items: [item] });
}

function sortLLMConfigGroups(
  groups: Map<string, LLMConfigGroup>,
): Array<LLMConfigGroup> {
  return Array.from(groups.values())
    .map((entry) => ({
      group: entry.group,
      items: entry.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

export function buildLLMConfigGroups(
  allLLMConfigs: AllConfigs | null,
  apiKeys: APIKeys | null | undefined,
  options: { includeConfigsWithoutApiKey?: boolean } = {},
): Array<LLMConfigGroup> {
  if (!allLLMConfigs) {
    return [];
  }
  const resolvedApiKeys = apiKeys ?? {};
  const includeConfigsWithoutApiKey =
    options.includeConfigsWithoutApiKey === true;

  const groups = new Map<string, LLMConfigGroup>();
  for (const [configId, config] of Object.entries(allLLMConfigs.configs)) {
    if (
      !shouldIncludeLLMConfig(
        config,
        resolvedApiKeys,
        includeConfigsWithoutApiKey,
      )
    ) {
      continue;
    }
    addLLMConfigGroupItem(groups, configId, config);
  }

  return sortLLMConfigGroups(groups);
}

export function countLLMConfigs(groups: Array<LLMConfigGroup>): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

export function resolveSelectableLLMConfigId(
  groups: Array<LLMConfigGroup>,
  configId: string | null,
): string | null {
  if (!configId) {
    return null;
  }
  for (const group of groups) {
    for (const item of group.items) {
      if (item.id === configId) {
        return configId;
      }
    }
  }
  return null;
}

export function pickDefaultConfigId(config: AllConfigs | null): string | null {
  if (!config) {
    return null;
  }
  if (config.default_config_id && config.configs[config.default_config_id]) {
    return config.default_config_id;
  }
  const [firstId] = Object.keys(config.configs);
  return firstId ?? null;
}
