import { useAIStore } from "state/definitions";
import { getErrorCode, getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_create_agent_profile,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_delete_agent_profile,
  route_delete_external_agent_config,
  route_delete_prompt_template,
  route_get_agent_profiles,
  route_get_engine_configs,
  route_get_external_agent_configs,
  route_get_external_agent_health,
  route_get_llm_api_keys,
  route_get_llm_config,
  route_get_prompt_templates,
  route_set_llm_api_keys,
  route_set_llm_config,
  route_update_agent_profile,
  route_update_engine_config,
  route_update_external_agent_config,
  route_update_prompt_template,
} from "utils/generatedEndpoints";
import {
  AgentProfile,
  AllLLMConfigs,
  APIKeys,
  CreateAgentProfileRequestInput,
  CreateExternalAgentConfigRequestInput,
  CreatePromptTemplateRequestInput,
  DeleteAgentProfileRequestInput,
  DeleteExternalAgentConfigRequestInput,
  DeletePromptTemplateRequestInput,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  PromptTemplate,
  UpdateAgentProfileRequestInput,
  UpdateEngineConfigRequestInput,
  UpdateExternalAgentConfigRequestInput,
  UpdatePromptTemplateRequestInput,
} from "utils/generatedTypes";

let llmConfigLoadPromise: Promise<void> | null = null;
let llmApiKeysLoadPromise: Promise<void> | null = null;
let llmApiKeysSaveQueue: Promise<void> = Promise.resolve();

const MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE =
  "managed_api_keys_revision_conflict";
const MANAGED_API_KEYS_CORRUPT_ERROR_CODE = "managed_api_keys_store_corrupt";
const MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE =
  "managed_api_keys_store_unavailable";

type APIKeysMutation = (currentApiKeys: APIKeys) => APIKeys;

type ManagedAPIKeysSnapshotPayload = {
  apiKeys: APIKeys;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type ManagedAPIKeysErrorDetails = {
  detail: string | null;
  revision: number | null;
  errorCode: string | null;
  isCorrupt: boolean;
  isUnavailable: boolean;
};

type HasId = { id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function upsertById<T extends HasId>(items: Array<T>, entry: T): Array<T> {
  const index = items.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [...items, entry];
  }
  const next = [...items];
  next[index] = entry;
  return next;
}

function removeById<T extends HasId>(items: Array<T>, id: string): Array<T> {
  return items.filter((item) => item.id !== id);
}

function resolveManagedApiKeysErrorDetails(
  payload: unknown,
): ManagedAPIKeysErrorDetails {
  const detail = getErrorDetail(payload);
  const revision = extractApiKeysRevisionFromErrorPayload(payload);
  const errorCode = getErrorCode(payload);
  const isCorrupt = errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE;
  const isUnavailable = errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE;
  return {
    detail,
    revision,
    errorCode,
    isCorrupt,
    isUnavailable,
  };
}

function applyManagedApiKeysReadFailure(payload: unknown): void {
  const errorDetails = resolveManagedApiKeysErrorDetails(payload);
  useAIStore.setState((state) => ({
    apiKeys:
      errorDetails.isCorrupt || errorDetails.isUnavailable ? {} : state.apiKeys,
    apiKeysRevision: errorDetails.revision ?? state.apiKeysRevision,
    apiKeysAuthoritative: errorDetails.isCorrupt,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: errorDetails.detail ?? "Failed to load LLM API keys",
  }));
}

function applyManagedApiKeysWriteFailure({
  payload,
  fallbackMessage,
  fallbackAuthoritative,
}: {
  payload: unknown;
  fallbackMessage: string;
  fallbackAuthoritative: boolean;
}): {
  shouldRetryCorruptWrite: boolean;
} {
  const errorDetails = resolveManagedApiKeysErrorDetails(payload);
  if (errorDetails.isCorrupt) {
    useAIStore.setState((state) => ({
      apiKeys: {},
      apiKeysRevision: errorDetails.revision ?? state.apiKeysRevision,
      apiKeysAuthoritative: errorDetails.revision !== null,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError:
        errorDetails.detail ?? "Managed API key store is corrupt.",
    }));
    return {
      shouldRetryCorruptWrite: errorDetails.revision !== null,
    };
  }
  if (errorDetails.isUnavailable) {
    useAIStore.setState({
      apiKeys: {},
      apiKeysAuthoritative: false,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError:
        errorDetails.detail ?? "Managed API key store is unavailable.",
    });
    return { shouldRetryCorruptWrite: false };
  }
  useAIStore.setState({
    apiKeysAuthoritative: fallbackAuthoritative,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: errorDetails.detail ?? fallbackMessage,
  });
  return { shouldRetryCorruptWrite: false };
}

function extractApiKeysRevisionFromErrorPayload(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const revision = value.revision;
  if (
    typeof revision === "number" &&
    Number.isInteger(revision) &&
    revision >= 0
  ) {
    return revision;
  }
  return extractApiKeysRevisionFromErrorPayload(value.detail);
}

async function refreshLLMApiKeysSnapshotFromServer(): Promise<boolean> {
  const res = await route_get_llm_api_keys();
  if (res200(res)) {
    receiveLLMApiKeysSnapshotUpdate(res.data);
    return true;
  }
  applyManagedApiKeysReadFailure(res.data);
  return false;
}

async function persistLLMApiKeysMutation(
  mutation: APIKeysMutation,
): Promise<boolean> {
  const MAX_RETRIES = 3;
  for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount += 1) {
    const state = useAIStore.getState();
    const nextApiKeys = mutation(state.apiKeys);
    const res = await route_set_llm_api_keys({
      apiKeys: nextApiKeys,
      expectedRevision: state.apiKeysRevision,
    });
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(res.data);
      return true;
    }
    const errorCode = getErrorCode(res.data);
    if (
      res.status === 409 &&
      errorCode === MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
    ) {
      const refreshed = await refreshLLMApiKeysSnapshotFromServer();
      if (!refreshed) {
        return false;
      }
      continue;
    }
    if (
      res.status === 409 &&
      errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE
    ) {
      const writeFailureResult = applyManagedApiKeysWriteFailure({
        payload: res.data,
        fallbackMessage: "Managed API key store is corrupt.",
        fallbackAuthoritative: false,
      });
      if (!writeFailureResult.shouldRetryCorruptWrite) {
        return false;
      }
      continue;
    }
    if (
      res.status === 503 &&
      errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
    ) {
      applyManagedApiKeysWriteFailure({
        payload: res.data,
        fallbackMessage: "Managed API key store is unavailable.",
        fallbackAuthoritative: false,
      });
      return false;
    }
    applyManagedApiKeysWriteFailure({
      payload: res.data,
      fallbackMessage: "Failed to save LLM API keys",
      fallbackAuthoritative: false,
    });
    return false;
  }
  useAIStore.setState({
    apiKeysAuthoritative: false,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: "Failed to save LLM API keys after retrying conflicts.",
  });
  return false;
}

function receiveExternalAgentHealthUpdate(
  payload: Array<ExternalAgentPreflightStatus>,
) {
  useAIStore.setState({
    externalAgentHealth: payload,
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: null,
    externalAgentHealthLoading: false,
  });
}

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

export async function loadLLMApiKeys() {
  if (llmApiKeysLoadPromise) {
    await llmApiKeysLoadPromise;
    return;
  }
  llmApiKeysLoadPromise = (async () => {
    const res = await route_get_llm_api_keys();
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(res.data);
      return;
    }
    applyManagedApiKeysReadFailure(res.data);
  })();
  try {
    await llmApiKeysLoadPromise;
  } finally {
    llmApiKeysLoadPromise = null;
  }
}

export function receiveLLMConfigUpdate(payload: AllLLMConfigs) {
  useAIStore.setState({
    allLLMConfigs: payload,
    allLLMConfigsInitialLoadComplete: true,
    allLLMConfigsLoadError: null,
  });
}

export function receiveLLMApiKeysSnapshotUpdate(
  payload: ManagedAPIKeysSnapshotPayload,
) {
  const isCorrupt =
    payload.corrupt === true ||
    payload.errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE;
  const isUnavailable =
    payload.errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE;
  let apiKeysLoadError: string | null = null;
  if (isCorrupt) {
    apiKeysLoadError = payload.message ?? "Managed API key store is corrupt.";
  } else if (isUnavailable) {
    apiKeysLoadError =
      payload.message ?? "Managed API key store is unavailable.";
  }
  useAIStore.setState({
    apiKeys: payload.apiKeys,
    apiKeysRevision: payload.revision,
    apiKeysAuthoritative: !isUnavailable,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError,
  });
}

export async function mutateAndSaveLLMApiKeys(
  mutation: APIKeysMutation,
): Promise<boolean> {
  let didPersist = false;
  const runMutation = async () => {
    didPersist = await persistLLMApiKeysMutation(mutation);
  };
  llmApiKeysSaveQueue = llmApiKeysSaveQueue.then(runMutation, runMutation);
  await llmApiKeysSaveQueue;
  return didPersist;
}

export async function loadAgentProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.agentProfilesLoading) {
    return;
  }
  if (!force && state.agentProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ agentProfilesLoading: true });
  const res = await route_get_agent_profiles();
  if (res200(res)) {
    receiveAgentProfilesUpdate(res.data);
  } else {
    useAIStore.setState({
      agentProfilesInitialLoadComplete: true,
      agentProfilesLoadError: "Failed to load agent profiles",
      agentProfilesLoading: false,
    });
  }
}

export function receiveAgentProfilesUpdate(payload: Array<AgentProfile>) {
  useAIStore.setState({
    agentProfiles: payload,
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
    agentProfilesLoading: false,
  });
}

export async function loadPromptTemplates(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.promptTemplatesLoading) {
    return;
  }
  if (!force && state.promptTemplatesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ promptTemplatesLoading: true });
  const res = await route_get_prompt_templates();
  if (res200(res)) {
    receivePromptTemplatesUpdate(res.data);
  } else {
    useAIStore.setState({
      promptTemplatesInitialLoadComplete: true,
      promptTemplatesLoadError: "Failed to load prompt templates",
      promptTemplatesLoading: false,
    });
  }
}

export function receivePromptTemplatesUpdate(payload: Array<PromptTemplate>) {
  useAIStore.setState({
    promptTemplates: payload,
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
    promptTemplatesLoading: false,
  });
}

export async function loadExternalAgentConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentConfigsLoading) {
    return;
  }
  if (!force && state.externalAgentConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentConfigsLoading: true });
  const res = await route_get_external_agent_configs();
  if (res200(res)) {
    receiveExternalAgentConfigsUpdate(res.data);
  } else {
    useAIStore.setState({
      externalAgentConfigsInitialLoadComplete: true,
      externalAgentConfigsLoadError: "Failed to load external agent configs",
      externalAgentConfigsLoading: false,
    });
  }
}

export async function loadExternalAgentHealth(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentHealthLoading) {
    return;
  }
  if (!force && state.externalAgentHealthInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentHealthLoading: true });
  const res = await route_get_external_agent_health();
  if (res200(res)) {
    receiveExternalAgentHealthUpdate(res.data);
  } else {
    useAIStore.setState({
      externalAgentHealthInitialLoadComplete: true,
      externalAgentHealthLoadError: "Failed to load external agent health",
      externalAgentHealthLoading: false,
    });
  }
}

export function receiveExternalAgentConfigsUpdate(
  payload: Array<ExternalAgentConfig>,
) {
  useAIStore.setState({
    externalAgentConfigs: payload,
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
    externalAgentConfigsLoading: false,
  });
  void loadExternalAgentHealth(true);
}

export async function loadEngineConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.engineConfigsLoading) {
    return;
  }
  if (!force && state.engineConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ engineConfigsLoading: true });
  const res = await route_get_engine_configs();
  if (res200(res)) {
    receiveEngineConfigsUpdate(res.data);
  } else {
    useAIStore.setState({
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: "Failed to load engine configs",
      engineConfigsLoading: false,
    });
  }
}

export function receiveEngineConfigsUpdate(payload: Array<EngineConfig>) {
  useAIStore.setState({
    engineConfigs: payload,
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
    engineConfigsLoading: false,
  });
}

export async function createAgentProfile(
  payload: CreateAgentProfileRequestInput,
): Promise<AgentProfile | null> {
  const res = await route_create_agent_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to create agent profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function updateAgentProfile(
  payload: UpdateAgentProfileRequestInput,
): Promise<AgentProfile | null> {
  const res = await route_update_agent_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to update agent profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteAgentProfile(
  payload: DeleteAgentProfileRequestInput,
): Promise<boolean> {
  const res = await route_delete_agent_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to delete agent profile",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    agentProfiles: removeById(state.agentProfiles, payload.profileId),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return true;
}

export async function updateEngineConfig(
  payload: UpdateEngineConfigRequestInput,
): Promise<EngineConfig | null> {
  const res = await route_update_engine_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      engineConfigsLoadError: "Failed to update engine config",
    });
    return null;
  }
  const config = res.data;
  useAIStore.setState((state) => ({
    engineConfigs: upsertById(state.engineConfigs, config),
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
  }));
  return config;
}

export async function createPromptTemplate(
  payload: CreatePromptTemplateRequestInput,
): Promise<PromptTemplate | null> {
  const res = await route_create_prompt_template(payload);
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to create prompt template",
    });
    return null;
  }
  const template = res.data;
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function updatePromptTemplate(
  payload: UpdatePromptTemplateRequestInput,
): Promise<PromptTemplate | null> {
  const res = await route_update_prompt_template(payload);
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to update prompt template",
    });
    return null;
  }
  const template = res.data;
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function deletePromptTemplate(
  payload: DeletePromptTemplateRequestInput,
): Promise<boolean> {
  const res = await route_delete_prompt_template(payload);
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to delete prompt template",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    promptTemplates: removeById(state.promptTemplates, payload.templateId),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return true;
}

export async function createExternalAgentConfig(
  payload: CreateExternalAgentConfigRequestInput,
): Promise<ExternalAgentConfig | null> {
  const res = await route_create_external_agent_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to create external agent config",
    });
    return null;
  }
  const config = res.data;
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function updateExternalAgentConfig(
  payload: UpdateExternalAgentConfigRequestInput,
): Promise<ExternalAgentConfig | null> {
  const res = await route_update_external_agent_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to update external agent config",
    });
    return null;
  }
  const config = res.data;
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function deleteExternalAgentConfig(
  payload: DeleteExternalAgentConfigRequestInput,
): Promise<boolean> {
  const res = await route_delete_external_agent_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to delete external agent config",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    externalAgentConfigs: removeById(
      state.externalAgentConfigs,
      payload.configId,
    ),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return true;
}
