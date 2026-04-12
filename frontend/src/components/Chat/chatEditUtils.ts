type ChatEditAvailability = {
  hasEngineConfig: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable?: boolean;
  isFrozen?: boolean;
};

export function getChatEditDisabledReason({
  hasEngineConfig,
  hasLLMConfig,
  isExternalEngine,
  externalEngineAvailable,
  noLLMConfigsAvailable = false,
  isFrozen = false,
}: ChatEditAvailability): string | null {
  if (isFrozen) {
    return "Chat is frozen.";
  }
  if (!hasEngineConfig) {
    return "Select an engine to edit messages.";
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return "External agent is unavailable.";
  }
  if (!isExternalEngine) {
    if (noLLMConfigsAvailable) {
      return "No LLM configs are available.";
    }
    if (!hasLLMConfig) {
      return "Select an LLM config to edit messages.";
    }
  }
  return null;
}
