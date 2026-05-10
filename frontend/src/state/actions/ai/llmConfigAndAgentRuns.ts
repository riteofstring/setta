import {
  callOpenAPI,
  getErrorCode,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import {
  createAgentProfile as apiCreateAgentProfile,
  createExternalAgentConfig as apiCreateExternalAgentConfig,
  createPromptTemplate as apiCreatePromptTemplate,
  createTranscriptionProfile as apiCreateTranscriptionProfile,
  deleteAgentProfile as apiDeleteAgentProfile,
  deleteExternalAgentConfig as apiDeleteExternalAgentConfig,
  deletePromptTemplate as apiDeletePromptTemplate,
  deleteTranscriptionProfile as apiDeleteTranscriptionProfile,
  updateAgentProfile as apiUpdateAgentProfile,
  updateEngineConfig as apiUpdateEngineConfig,
  updateExternalAgentConfig as apiUpdateExternalAgentConfig,
  updatePromptTemplate as apiUpdatePromptTemplate,
  updateTranscriptionProfile as apiUpdateTranscriptionProfile,
  getAgentProfiles,
  getAgentRuns,
  getEngineConfigs,
  getExternalAgentConfigs,
  getExternalAgentHealth,
  getPromptTemplates,
  getTranscriptionProfiles,
  setLlmApiKeys,
} from "openapi/http";

import { type AIFollowIdsByType } from "state/actions/aiFollow";

import { ChatDetails, useAIStore } from "state/definitions";

import {
  collectChatAppGenerationDetailsByChatId,
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetailsByChatId,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGeneration";

import {
  AgentProfile,
  AgentRun,
  EngineConfig,
  ExternalAgentConfig,
  Template,
  TranscriptionProfile,
  UpdateEngineConfigRequest,
} from "utils/generatedTypes";

import {
  AGENT_RUNS_RETRY_DELAYS_MS,
  APIKeysMutation,
  applyManagedApiKeysWriteFailure,
  CreateAgentProfileBody,
  CreateExternalAgentConfigBody,
  CreatePromptTemplateBody,
  CreateTranscriptionProfileBody,
  DeleteAgentProfileBody,
  DeleteExternalAgentConfigBody,
  DeletePromptTemplateBody,
  DeleteTranscriptionProfileBody,
  ExternalAgentHealthStatus,
  MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
  MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
  MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
  normalizeAgentProfile,
  normalizeEngineConfig,
  normalizeExternalAgentConfig,
  normalizeExternalAgentHealth,
  normalizeLLMApiKeysSnapshot,
  normalizePromptTemplate,
  normalizeTranscriptionProfile,
  receiveLLMApiKeysSnapshotUpdate,
  refreshLLMApiKeysSnapshotFromServer,
  requireNonNull,
  UpdateAgentProfileBody,
  UpdateExternalAgentConfigBody,
  UpdatePromptTemplateBody,
  UpdateTranscriptionProfileBody,
} from "./apiKeysAndHealth";

let llmApiKeysSaveQueue: Promise<void> = Promise.resolve();

let agentRunsLoadPromise: Promise<void> | null = null;

let agentRunsRetryTimer: ReturnType<typeof setTimeout> | null = null;

let agentRunsTransientFailureCount = 0;

// eslint-disable-next-line complexity
async function persistLLMApiKeysMutation(
  mutation: APIKeysMutation,
): Promise<boolean> {
  const MAX_RETRIES = 3;
  for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount += 1) {
    const state = useAIStore.getState();
    const nextApiKeys = mutation(state.apiKeys);
    const res = await callOpenAPI(
      setLlmApiKeys({
        body: {
          apiKeys: nextApiKeys,
          expectedRevision: state.apiKeysRevision,
        },
      } as Parameters<typeof setLlmApiKeys>[0]),
    );
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(normalizeLLMApiKeysSnapshot(res.data));
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
  const res = await callOpenAPI(getAgentProfiles());
  if (res200(res)) {
    receiveAgentProfilesUpdate((res.data ?? []).map(normalizeAgentProfile));
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

function clearScheduledAgentRunsRetry(): void {
  if (!agentRunsRetryTimer) {
    return;
  }
  clearTimeout(agentRunsRetryTimer);
  agentRunsRetryTimer = null;
}

function scheduleAgentRunsRetry(transientFailureCount: number): void {
  if (agentRunsRetryTimer) {
    return;
  }
  const delayIndex = Math.max(
    0,
    Math.min(transientFailureCount - 1, AGENT_RUNS_RETRY_DELAYS_MS.length - 1),
  );
  const delayMs = AGENT_RUNS_RETRY_DELAYS_MS[delayIndex] ?? 2500;
  agentRunsRetryTimer = setTimeout(() => {
    agentRunsRetryTimer = null;
    void loadAgentRuns();
  }, delayMs);
}

export async function loadAgentRuns() {
  if (agentRunsLoadPromise) {
    await agentRunsLoadPromise;
    return;
  }
  const currentState = useAIStore.getState();
  if (
    currentState.agentRunsAuthorityState === "loading" &&
    !currentState.agentRunsInitialLoadComplete &&
    currentState.agentRunsLoadError === null
  ) {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  const currentAuthorityState = currentState.agentRunsAuthorityState;
  if (currentAuthorityState === "terminal_error") {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  if (currentAuthorityState !== "ready") {
    useAIStore.setState({
      agentRunsAuthorityState: "loading",
      agentRunsInitialLoadComplete: false,
    });
  }
  agentRunsLoadPromise = (async () => {
    const res = await callOpenAPI(getAgentRuns());
    if (res200(res)) {
      receiveAgentRunsUpdate(res.data);
    } else {
      agentRunsTransientFailureCount += 1;
      if (agentRunsTransientFailureCount <= AGENT_RUNS_RETRY_DELAYS_MS.length) {
        useAIStore.setState({
          agentRunsAuthorityState: "transient_error",
          agentRunsInitialLoadComplete: false,
          agentRunsLoadError: "Failed to load agent runs",
        });
        scheduleAgentRunsRetry(agentRunsTransientFailureCount);
        return;
      }
      clearScheduledAgentRunsRetry();
      useAIStore.setState({
        agentRunsAuthorityState: "terminal_error",
        agentRunsInitialLoadComplete: true,
        agentRunsLoadError: "Failed to load agent runs",
      });
    }
  })();
  try {
    await agentRunsLoadPromise;
  } finally {
    agentRunsLoadPromise = null;
  }
}

export function receiveAgentRunUpdate(payload: AgentRun) {
  useAIStore.setState((state) => {
    const existingIndex = state.agentRuns.findIndex(
      (candidate) => candidate.id === payload.id,
    );
    if (existingIndex === -1) {
      return {
        agentRuns: [payload, ...state.agentRuns],
      };
    }
    const nextRuns = state.agentRuns.slice();
    nextRuns[existingIndex] = payload;
    return {
      agentRuns: nextRuns,
    };
  });
}

function receiveAgentRunsUpdate(payload: Array<AgentRun>) {
  clearScheduledAgentRunsRetry();
  agentRunsTransientFailureCount = 0;
  useAIStore.setState((state) => ({
    agentRuns: payload,
    chatAppGenerationDetailsByChatId: mergeChatAppGenerationDetailsByChatId(
      state.chatAppGenerationDetailsByChatId,
      collectChatAppGenerationDetailsByChatId(payload),
    ),
    agentRunsAuthorityState: "ready",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
  }));
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
  const res = await callOpenAPI(getPromptTemplates());
  if (res200(res)) {
    receivePromptTemplatesUpdate((res.data ?? []).map(normalizePromptTemplate));
  } else {
    useAIStore.setState({
      promptTemplatesInitialLoadComplete: true,
      promptTemplatesLoadError: "Failed to load prompt templates",
      promptTemplatesLoading: false,
    });
  }
}

export function receivePromptTemplatesUpdate(payload: Array<Template>) {
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
  const res = await callOpenAPI(getExternalAgentConfigs());
  if (res200(res)) {
    receiveExternalAgentConfigsUpdate(
      (res.data ?? []).map(normalizeExternalAgentConfig),
    );
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
  const res = await callOpenAPI(getExternalAgentHealth());
  if (res200(res)) {
    receiveExternalAgentHealthUpdate(
      (res.data ?? []).map(normalizeExternalAgentHealth),
    );
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

function receiveExternalAgentHealthUpdate(
  payload: Array<ExternalAgentHealthStatus>,
) {
  useAIStore.setState({
    externalAgentHealth: payload,
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: null,
    externalAgentHealthLoading: false,
  });
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
  const res = await callOpenAPI(getEngineConfigs());
  if (res200(res)) {
    receiveEngineConfigsUpdate((res.data ?? []).map(normalizeEngineConfig));
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

export async function loadTranscriptionProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.transcriptionProfilesLoading) {
    return;
  }
  if (!force && state.transcriptionProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ transcriptionProfilesLoading: true });
  const res = await callOpenAPI(getTranscriptionProfiles());
  if (res200(res)) {
    receiveTranscriptionProfilesUpdate(
      (res.data ?? []).map(normalizeTranscriptionProfile),
    );
  } else {
    useAIStore.setState({
      transcriptionProfilesInitialLoadComplete: true,
      transcriptionProfilesLoadError: "Failed to load transcription profiles",
      transcriptionProfilesLoading: false,
    });
  }
}

export function receiveTranscriptionProfilesUpdate(
  payload: Array<TranscriptionProfile>,
) {
  useAIStore.setState({
    transcriptionProfiles: payload,
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    transcriptionProfilesLoading: false,
  });
}

type HasId = {
  id: string;
};

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

export async function createAgentProfile(
  payload: CreateAgentProfileBody,
): Promise<AgentProfile | null> {
  const res = await callOpenAPI(
    apiCreateAgentProfile({ body: payload } as Parameters<
      typeof apiCreateAgentProfile
    >[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to create agent profile",
    });
    return null;
  }
  const profile = normalizeAgentProfile(res.data);
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function updateAgentProfile(
  payload: UpdateAgentProfileBody,
): Promise<AgentProfile | null> {
  const res = await callOpenAPI(
    apiUpdateAgentProfile({
      body: {
        profile: requireNonNull(
          payload.profile,
          "updateAgentProfile requires a profile payload.",
        ),
      },
    } as Parameters<typeof apiUpdateAgentProfile>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to update agent profile",
    });
    return null;
  }
  const profile = normalizeAgentProfile(res.data);
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteAgentProfile(
  payload: DeleteAgentProfileBody,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeleteAgentProfile({ body: payload } as Parameters<
      typeof apiDeleteAgentProfile
    >[0]),
  );
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
  payload: UpdateEngineConfigRequest,
): Promise<EngineConfig | null> {
  const config = requireNonNull(
    payload.config,
    "updateEngineConfig requires a config payload.",
  );
  const body = {
    config: {
      ...config,
      defaults: config.defaults ?? {},
      runtimeSupport: config.runtimeSupport ?? { thinking: false },
    },
  } as Parameters<typeof apiUpdateEngineConfig>[0]["body"];
  const res = await callOpenAPI(
    apiUpdateEngineConfig({
      body,
    } as Parameters<typeof apiUpdateEngineConfig>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      engineConfigsLoadError: "Failed to update engine config",
    });
    return null;
  }
  const nextConfig = normalizeEngineConfig(res.data);
  useAIStore.setState((state) => ({
    engineConfigs: upsertById(state.engineConfigs, nextConfig),
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
  }));
  return nextConfig;
}

export async function createTranscriptionProfile(
  payload: CreateTranscriptionProfileBody,
): Promise<TranscriptionProfile | null> {
  const res = await callOpenAPI(
    apiCreateTranscriptionProfile({ body: payload } as Parameters<
      typeof apiCreateTranscriptionProfile
    >[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to create transcription profile",
    });
    return null;
  }
  const profile = normalizeTranscriptionProfile(res.data);
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function updateTranscriptionProfile(
  payload: UpdateTranscriptionProfileBody,
): Promise<TranscriptionProfile | null> {
  const res = await callOpenAPI(
    apiUpdateTranscriptionProfile({
      body: {
        profile: requireNonNull(
          payload.profile,
          "updateTranscriptionProfile requires a profile payload.",
        ),
      },
    } as Parameters<typeof apiUpdateTranscriptionProfile>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to update transcription profile",
    });
    return null;
  }
  const profile = normalizeTranscriptionProfile(res.data);
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteTranscriptionProfile(
  payload: DeleteTranscriptionProfileBody,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeleteTranscriptionProfile({ body: payload } as Parameters<
      typeof apiDeleteTranscriptionProfile
    >[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to delete transcription profile",
    });
    return false;
  }
  const profileId = requireNonNull(
    payload.profileId,
    "deleteTranscriptionProfile requires a profile id.",
  );
  useAIStore.setState((state) => ({
    transcriptionProfiles: removeById(state.transcriptionProfiles, profileId),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    projectChatTranscriptionProfileId:
      state.projectChatTranscriptionProfileId === profileId
        ? null
        : state.projectChatTranscriptionProfileId,
  }));
  return true;
}

export async function createPromptTemplate(
  payload: CreatePromptTemplateBody,
): Promise<Template | null> {
  const res = await callOpenAPI(
    apiCreatePromptTemplate({ body: payload } as Parameters<
      typeof apiCreatePromptTemplate
    >[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to create prompt template",
    });
    return null;
  }
  const template = normalizePromptTemplate(res.data);
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function updatePromptTemplate(
  payload: UpdatePromptTemplateBody,
): Promise<Template | null> {
  const res = await callOpenAPI(
    apiUpdatePromptTemplate({
      body: {
        template: requireNonNull(
          payload.template,
          "updatePromptTemplate requires a template payload.",
        ),
      },
    } as Parameters<typeof apiUpdatePromptTemplate>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to update prompt template",
    });
    return null;
  }
  const template = normalizePromptTemplate(res.data);
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function deletePromptTemplate(
  payload: DeletePromptTemplateBody,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeletePromptTemplate({ body: payload } as Parameters<
      typeof apiDeletePromptTemplate
    >[0]),
  );
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
  payload: CreateExternalAgentConfigBody,
): Promise<ExternalAgentConfig | null> {
  const body = {
    ...payload,
    settingsManagedBlock: payload.settingsManagedBlock ?? {},
  } as Parameters<typeof apiCreateExternalAgentConfig>[0]["body"];
  const res = await callOpenAPI(
    apiCreateExternalAgentConfig({
      body,
    } as Parameters<typeof apiCreateExternalAgentConfig>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to create external agent config",
    });
    return null;
  }
  const config = normalizeExternalAgentConfig(res.data);
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function updateExternalAgentConfig(
  payload: UpdateExternalAgentConfigBody,
): Promise<ExternalAgentConfig | null> {
  const requestedConfig = requireNonNull(
    payload.config,
    "updateExternalAgentConfig requires a config payload.",
  );
  const body = {
    config: {
      ...requestedConfig,
      envVarWhitelist: requestedConfig.envVarWhitelist ?? [],
      settingsManagedBlock: requestedConfig.settingsManagedBlock ?? undefined,
      settingsSources: requestedConfig.settingsSources ?? [],
    },
  } as Parameters<typeof apiUpdateExternalAgentConfig>[0]["body"];
  const res = await callOpenAPI(
    apiUpdateExternalAgentConfig({
      body,
    } as Parameters<typeof apiUpdateExternalAgentConfig>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to update external agent config",
    });
    return null;
  }
  const config = normalizeExternalAgentConfig(res.data);
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function deleteExternalAgentConfig(
  payload: DeleteExternalAgentConfigBody,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeleteExternalAgentConfig({ body: payload } as Parameters<
      typeof apiDeleteExternalAgentConfig
    >[0]),
  );
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

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
    contextUsage: null,
  };
}

export function getPendingChatAppGenerationDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails | null {
  return (
    state.pendingChatAppGenerationDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

export function setPendingChatAppGenerationDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
  nextDetails: ChatAppGenerationDetails | null,
): Partial<ReturnType<typeof useAIStore.getState>> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatAppGenerationDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatAppGenerationDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatAppGenerationDetailsBySurfaceId: nextBySurfaceId,
  };
}

export function getChatAppGenerationDetailsForTarget(
  state: ReturnType<typeof useAIStore.getState>,
  chatId: string | null,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails {
  if (chatId === null) {
    return (
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails()
    );
  }
  return (
    state.chatAppGenerationDetailsByChatId[chatId] ??
    getDefaultChatAppGenerationDetails()
  );
}

function normalizePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string | null {
  if (typeof surfaceId !== "string") {
    return null;
  }
  const normalizedSurfaceId = surfaceId.trim();
  if (!normalizedSurfaceId) {
    return null;
  }
  return normalizedSurfaceId;
}

export function requirePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string {
  const normalizedSurfaceId = normalizePendingChatSurfaceId(surfaceId);
  if (!normalizedSurfaceId) {
    throw new Error("Pending chat surface id is required.");
  }
  return normalizedSurfaceId;
}

export function getPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatDetails | null {
  return (
    state.pendingChatDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

export function setPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
  nextDetails: ChatDetails | null,
): Partial<ReturnType<typeof useAIStore.getState>> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatDetailsBySurfaceId: nextBySurfaceId,
  };
}

export type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIdsByChat: Record<string, true>;
  stopEligibleAssistantMessageId: string | null;
  followProjectConfigId: string | null;
  followToolArgumentIdsByType: AIFollowIdsByType | null;
};

export type StopChatResponseLocalOptions = {
  markInterruptedOptimistically?: boolean;
  pendingSurfaceId?: string | null;
  followProjectConfigId?: string | null;
};

export type ResolvedStopChatResponseLocalOptions = {
  markInterruptedOptimistically: boolean;
  pendingSurfaceId: string | null;
  followProjectConfigId: string | null;
};
