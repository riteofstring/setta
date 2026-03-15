import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import {
  route_get_llm_config,
  route_set_llm_config,
} from "utils/generatedEndpoints";
import { type AllLLMConfigs } from "utils/generatedTypes";

let llmConfigLoadPromise: Promise<void> | null = null;

export async function loadLLMConfig() {
  if (llmConfigLoadPromise) {
    await llmConfigLoadPromise;
    return;
  }
  llmConfigLoadPromise = (async () => {
    const res = await route_get_llm_config();
    if (res200(res)) {
      receiveLLMConfigUpdate(res.data);
      return;
    }
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to load LLM config",
    });
  })();
  try {
    await llmConfigLoadPromise;
  } finally {
    llmConfigLoadPromise = null;
  }
}

export async function saveLLMConfig(
  config: AllLLMConfigs,
): Promise<AllLLMConfigs | null> {
  const res = await route_set_llm_config(config);
  if (!res200(res)) {
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to save LLM config",
    });
    return null;
  }
  receiveLLMConfigUpdate(res.data);
  return res.data;
}

export function receiveLLMConfigUpdate(payload: AllLLMConfigs) {
  useAIStore.setState({
    allLLMConfigs: payload,
    allLLMConfigsInitialLoadComplete: true,
    allLLMConfigsLoadError: null,
  });
}

export { mutateAndSaveLLMApiKeys } from "./aiManagedApiKeyPersistence";
export {
  loadLLMApiKeys,
  receiveLLMApiKeysSnapshotUpdate,
} from "./aiManagedApiKeyState";
