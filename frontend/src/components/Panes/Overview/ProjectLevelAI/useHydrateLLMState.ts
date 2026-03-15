import { useEffect } from "react";
import { loadLLMConfig } from "state/actions/aiLLMConfiguration";
import { loadLLMApiKeys } from "state/actions/aiManagedApiKeys";
import { useAIStore } from "state/definitions";

export function useHydrateLLMState() {
  const { apiKeysInitialLoadComplete, allLLMConfigsInitialLoadComplete } =
    useAIStore((x) => ({
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      allLLMConfigsInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
    }));

  useEffect(() => {
    if (!apiKeysInitialLoadComplete) {
      void loadLLMApiKeys();
    }
    if (!allLLMConfigsInitialLoadComplete) {
      void loadLLMConfig();
    }
  }, [apiKeysInitialLoadComplete, allLLMConfigsInitialLoadComplete]);
}
