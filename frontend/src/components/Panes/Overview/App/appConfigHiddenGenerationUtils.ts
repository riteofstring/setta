import { useAIStore } from "state/definitions";
import { getErrorDetail } from "utils/endpointUtils";
import { EngineTypeEnum } from "utils/generatedTypes";

type HiddenGenerationResourceLoadState = {
  allLLMConfigsInitialLoadComplete: boolean;
  apiKeysInitialLoadComplete: boolean;
  engineConfigsInitialLoadComplete: boolean;
  externalAgentHealthInitialLoadComplete: boolean;
};

export type HiddenGenerationEngineConfig = {
  id: string;
  engineType: EngineTypeEnum;
  settaLlmConfigId?: string | null;
  externalAgentConfigId?: string | null;
};

export type HiddenGenerationEngineSelection = {
  engineConfigId: string | null;
  isExternalEngine: boolean;
  forceNewChat: boolean;
};

export type ExternalAgentHealthStatus = {
  available: boolean;
  supported: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function areHiddenGenerationResourcesLoaded(
  state: HiddenGenerationResourceLoadState,
): boolean {
  return (
    state.allLLMConfigsInitialLoadComplete &&
    state.apiKeysInitialLoadComplete &&
    state.engineConfigsInitialLoadComplete &&
    state.externalAgentHealthInitialLoadComplete
  );
}

export function waitForHiddenGenerationResourcesLoaded(): Promise<void> {
  if (areHiddenGenerationResourcesLoaded(useAIStore.getState())) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const unsubscribe = useAIStore.subscribe((state) => {
      if (!areHiddenGenerationResourcesLoaded(state)) {
        return;
      }
      unsubscribe();
      resolve();
    });
  });
}

function pickHiddenGenerationEngine(args: {
  engineConfigs: HiddenGenerationEngineConfig[];
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): {
  engineConfigId: string | null;
  isExternalEngine: boolean;
} {
  for (const config of args.engineConfigs) {
    if (
      config.engineType === EngineTypeEnum.setta_llm &&
      isHiddenGenerationEngineUsable({
        config,
        availableLLMConfigIds: args.availableLLMConfigIds,
        externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
        defaultLLMConfigId: args.defaultLLMConfigId,
      })
    ) {
      return { engineConfigId: config.id, isExternalEngine: false };
    }
  }
  for (const config of args.engineConfigs) {
    if (
      config.engineType === EngineTypeEnum.external_agent &&
      isHiddenGenerationEngineUsable({
        config,
        availableLLMConfigIds: args.availableLLMConfigIds,
        externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
        defaultLLMConfigId: args.defaultLLMConfigId,
      })
    ) {
      return { engineConfigId: config.id, isExternalEngine: true };
    }
  }
  return { engineConfigId: null, isExternalEngine: false };
}

function isHiddenGenerationEngineUsable(args: {
  config: HiddenGenerationEngineConfig;
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): boolean {
  if (args.config.engineType === EngineTypeEnum.setta_llm) {
    const llmConfigId = args.config.settaLlmConfigId ?? args.defaultLLMConfigId;
    return Boolean(llmConfigId && args.availableLLMConfigIds.has(llmConfigId));
  }
  if (args.config.engineType === EngineTypeEnum.external_agent) {
    const externalAgentConfigId = args.config.externalAgentConfigId ?? null;
    if (!externalAgentConfigId) {
      return false;
    }
    const health =
      args.externalAgentHealthByConfigId.get(externalAgentConfigId) ?? null;
    if (!health) {
      return false;
    }
    return health.available && health.supported;
  }
  return false;
}

export function resolveHiddenGenerationEngineSelection(args: {
  activeChatEngineConfigId: string | null;
  engineConfigs: HiddenGenerationEngineConfig[];
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): HiddenGenerationEngineSelection {
  const fallback = pickHiddenGenerationEngine({
    engineConfigs: args.engineConfigs,
    availableLLMConfigIds: args.availableLLMConfigIds,
    externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
    defaultLLMConfigId: args.defaultLLMConfigId,
  });

  if (!args.activeChatEngineConfigId) {
    return {
      engineConfigId: fallback.engineConfigId,
      isExternalEngine: fallback.isExternalEngine,
      forceNewChat: false,
    };
  }

  const activeChatEngine = args.engineConfigs.find(
    (config) => config.id === args.activeChatEngineConfigId,
  );
  if (
    activeChatEngine &&
    isHiddenGenerationEngineUsable({
      config: activeChatEngine,
      availableLLMConfigIds: args.availableLLMConfigIds,
      externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
      defaultLLMConfigId: args.defaultLLMConfigId,
    })
  ) {
    return {
      engineConfigId: activeChatEngine.id,
      isExternalEngine:
        activeChatEngine.engineType === EngineTypeEnum.external_agent,
      forceNewChat: false,
    };
  }

  const forceNewChat =
    Boolean(fallback.engineConfigId) &&
    fallback.engineConfigId !== args.activeChatEngineConfigId;

  return {
    engineConfigId: fallback.engineConfigId,
    isExternalEngine: fallback.isExternalEngine,
    forceNewChat,
  };
}

export async function resolveGenerationFailureMessage(
  response: Response,
): Promise<string> {
  const fallback = `Generation request failed (status ${response.status}).`;
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    return fallback;
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (isRecord(payload)) {
    const message = payload.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  }
  return fallback;
}

export function resolveHiddenGenerationErrorMessage(error: unknown): string {
  const detail = getErrorDetail(error);
  if (detail) {
    return detail;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Failed to send generation request to chat.";
}
