import { AllConfigs, LLMAPIKeysSnapshot } from "utils/generatedTypes";

type APIKeys = LLMAPIKeysSnapshot["apiKeys"];

type LLMConfigGroup = {
  group: string;
  items: Array<{ id: string; name: string }>;
};

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
      !includeConfigsWithoutApiKey &&
      config.api_key_env &&
      !(config.api_key_env in resolvedApiKeys)
    ) {
      continue;
    }
    const groupName = config.provider || "LLM Configs";
    const descriptorParts: Array<string> = [];
    if (config.provider) {
      descriptorParts.push(config.provider);
    }
    if (config.base_url) {
      descriptorParts.push(config.base_url);
    }
    const descriptor =
      descriptorParts.length > 0 ? ` (${descriptorParts.join(" · ")})` : "";
    const name = `${config.model}${descriptor}`;
    if (!groups.has(groupName)) {
      groups.set(groupName, { group: groupName, items: [] });
    }
    groups.get(groupName)?.items.push({ id: configId, name });
  }

  return Array.from(groups.values())
    .map((entry) => ({
      group: entry.group,
      items: entry.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
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
