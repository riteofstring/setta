type ChatEditAvailability = {
  hasEngineConfig: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable?: boolean;
  isFrozen?: boolean;
};

function getNonExternalChatEditDisabledReason(args: {
  hasLLMConfig: boolean;
  noLLMConfigsAvailable: boolean;
}): string | null {
  if (args.noLLMConfigsAvailable) {
    return "No LLM configs are available.";
  }
  return args.hasLLMConfig ? null : "Select an LLM config to edit messages.";
}

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
  if (isExternalEngine) {
    return externalEngineAvailable ? null : "External agent is unavailable.";
  }
  return getNonExternalChatEditDisabledReason({
    hasLLMConfig,
    noLLMConfigsAvailable,
  });
}
