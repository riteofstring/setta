import { ExternalAgentConfig } from "utils/generatedTypes";

export const CHAT_ENGINE_SETTA_ID = "setta-llm";

type IdNameItem = { id: string; name: string };

type IdNameGroup = { group: string; items: Array<IdNameItem> };

type ChatPlaceholderOptions = {
  isExternalEngine: boolean;
  hasExternalConfig: boolean;
  hasLLMConfig: boolean;
  noLLMConfigsAvailable: boolean;
};

export function buildEngineGroups(
  externalAgentConfigs: Array<ExternalAgentConfig>,
): Array<IdNameGroup> {
  const externalItems = externalAgentConfigs.map((config) => {
    return {
      id: config.id,
      name: buildExternalAgentConfigLabel(config),
    };
  });
  return [
    {
      group: "Engine",
      items: [{ id: CHAT_ENGINE_SETTA_ID, name: "Setta LLM" }],
    },
    {
      group: "External Agents",
      items: externalItems,
    },
  ];
}

export function getChatPlaceholderText(
  options: ChatPlaceholderOptions,
): string {
  if (options.isExternalEngine) {
    if (!options.hasExternalConfig) {
      return "Select an external agent";
    }
    return "Type a message...";
  }
  if (options.noLLMConfigsAvailable) {
    return "Add API key!";
  }
  if (!options.hasLLMConfig) {
    return "Select an LLM";
  }
  return "Type a message...";
}

function buildExternalAgentConfigLabel(config: ExternalAgentConfig): string {
  const toolLabel = config.toolType.replaceAll("_", " ");
  if (config.name?.trim()) {
    return config.name;
  }
  return `${toolLabel} (${config.runMode})`;
}
