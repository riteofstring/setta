import {
  receiveAgenticScopeViolationEdges,
  SCOPE_VIOLATION_TIMEOUT_MS,
} from "state/actions/aiFollow";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  isManagedChatSection,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  clearChatStreamActive,
  isChatStreamActive,
  isSectionStreamActive,
  markChatStreamActive,
  recordFinalizedMessage,
  shouldPersistOnMessageStop,
} from "state/aiStreamingTracker";
import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
  clearAppSpecPatchStream,
} from "state/appSpecPatchStreaming";
import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useAppDefinition,
  useAppPreview,
  useLocalStorage,
  useProjectState,
  useToolArgumentPreview,
  type ZustandProjectState,
} from "state/definitions";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_create_agent_profile,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_create_transcription_profile,
  route_delete_agent_profile,
  route_delete_external_agent_config,
  route_delete_prompt_template,
  route_delete_transcription_profile,
  route_get_agent_profiles,
  route_get_agent_runs,
  route_get_engine_configs,
  route_get_external_agent_chat,
  route_get_external_agent_configs,
  route_get_external_agent_health,
  route_get_llm_api_keys,
  route_get_llm_chat,
  route_get_llm_config,
  route_get_llm_response,
  route_get_prompt_templates,
  route_get_transcription_profiles,
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
  route_set_chat_section_chat_id,
  route_set_chat_section_state,
  route_start_transcription_session,
  route_stop_external_agent_run,
  route_stop_llm_chat,
  route_stop_transcription_session,
  route_append_transcription_audio,
  route_cancel_transcription_session,
  route_update_agent_profile,
  route_update_engine_config,
  route_update_external_agent_config,
  route_update_prompt_template,
  route_update_transcription_profile,
} from "utils/generatedEndpoints";
import {
  AgentProfile,
  AgentRun,
  AgentRunStatusEnum,
  AllLLMConfigs,
  APIKeys,
  AppDefinition,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatPermissionMode,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  ChatSectionBranch,
  ChatSectionState,
  CreateAgentProfileRequestInput,
  CreateExternalAgentConfigRequestInput,
  createMessageTextContent,
  createMessageThinkingContent,
  CreatePromptTemplateRequestInput,
  CreateTranscriptionProfileRequestInput,
  DeleteAgentProfileRequestInput,
  DeleteExternalAgentConfigRequestInput,
  DeletePromptTemplateRequestInput,
  DeleteTranscriptionProfileRequestInput,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageImageUrlContent,
  MessageStartEvent,
  MessageTextContent,
  MessageThinkingContent,
  PromptTemplate,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
  StreamingEventTypeEnum,
  StartTranscriptionSessionResponse,
  ToolArgumentPreviewDeltaEvent,
  ToolCall,
  ToolCallDeltaEvent,
  ToolChatMessage,
  ToolResultEvent,
  TranscriptionProfile,
  TranscriptionSessionDeltaResponse,
  UpdateAgentProfileRequestInput,
  UpdateEngineConfigRequestInput,
  UpdateExternalAgentConfigRequestInput,
  UpdatePromptTemplateRequestInput,
  UpdateTranscriptionProfileRequestInput,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";
import { extractAgenticScopeViolation } from "./agenticScopeViolation";
import { buildEditedMessageHistory } from "./chatBranches";
import { mergeChatMessages } from "./chatMergeUtils";

const scopeViolationToastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
let llmConfigLoadPromise: Promise<void> | null = null;
let llmApiKeysLoadPromise: Promise<void> | null = null;
let agentRunsLoadPromise: Promise<void> | null = null;

type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

type ChatAppGenerationContext = {
  mode: AppGenerationMode | null;
  referenceImageUrl?: string | null;
  referenceImageNotes?: string | null;
};

const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return "";
  }
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function startTranscriptionSession(
  transcriptionProfileId: string,
  language: string | null = null,
): Promise<StartTranscriptionSessionResponse | null> {
  if (!transcriptionProfileId) {
    return null;
  }
  const res = await route_start_transcription_session({
    transcriptionProfileId,
    language,
  });
  if (!res200(res)) {
    const detail = getErrorDetail(res.data) ?? "Provider transcription failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    return null;
  }
  return res.data;
}

export async function appendTranscriptionAudio(
  sessionId: string,
  audioPcm16: ArrayBuffer,
  sampleRateHz: number,
  channels: number,
): Promise<TranscriptionSessionDeltaResponse | null> {
  if (!sessionId || audioPcm16.byteLength === 0) {
    return null;
  }
  const res = await route_append_transcription_audio({
    sessionId,
    audioPcm16Base64: encodeArrayBufferBase64(audioPcm16),
    sampleRateHz,
    channels,
  });
  if (!res200(res)) {
    const detail = getErrorDetail(res.data) ?? "Provider transcription failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    return null;
  }
  return res.data;
}

export async function stopTranscriptionSession(
  sessionId: string,
): Promise<TranscriptionSessionDeltaResponse | null> {
  if (!sessionId) {
    return null;
  }
  const res = await route_stop_transcription_session({ sessionId });
  if (!res200(res)) {
    const detail = getErrorDetail(res.data) ?? "Provider transcription failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    return null;
  }
  return res.data;
}

export async function cancelTranscriptionSession(
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) {
    return true;
  }
  const res = await route_cancel_transcription_session({ sessionId });
  return res200(res);
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

export async function loadLLMApiKeys() {
  if (llmApiKeysLoadPromise) {
    await llmApiKeysLoadPromise;
    return;
  }
  llmApiKeysLoadPromise = (async () => {
    const res = await route_get_llm_api_keys();
    if (res200(res)) {
      receiveLLMApiKeysUpdate(res.data);
      return;
    }
    useAIStore.setState({
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: "Failed to load LLM API keys",
    });
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

export function receiveLLMApiKeysUpdate(payload: APIKeys) {
  useAIStore.setState({
    apiKeys: payload,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: null,
  });
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

export async function loadAgentRuns() {
  if (agentRunsLoadPromise) {
    await agentRunsLoadPromise;
    return;
  }
  agentRunsLoadPromise = (async () => {
    const res = await route_get_agent_runs();
    if (res200(res)) {
      receiveAgentRunsUpdate(res.data);
    } else {
      useAIStore.setState({
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

function receiveAgentRunsUpdate(payload: Array<AgentRun>) {
  useAIStore.setState({
    agentRuns: payload,
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
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

export async function loadTranscriptionProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.transcriptionProfilesLoading) {
    return;
  }
  if (!force && state.transcriptionProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ transcriptionProfilesLoading: true });
  const res = await route_get_transcription_profiles();
  if (res200(res)) {
    receiveTranscriptionProfilesUpdate(res.data);
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

type HasId = { id: string };

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

export async function createTranscriptionProfile(
  payload: CreateTranscriptionProfileRequestInput,
): Promise<TranscriptionProfile | null> {
  const res = await route_create_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to create transcription profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function updateTranscriptionProfile(
  payload: UpdateTranscriptionProfileRequestInput,
): Promise<TranscriptionProfile | null> {
  const res = await route_update_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to update transcription profile",
    });
    return null;
  }
  const profile = res.data;
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteTranscriptionProfile(
  payload: DeleteTranscriptionProfileRequestInput,
): Promise<boolean> {
  const res = await route_delete_transcription_profile(payload);
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to delete transcription profile",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    transcriptionProfiles: removeById(
      state.transcriptionProfiles,
      payload.profileId,
    ),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    projectChatTranscriptionProfileId:
      state.projectChatTranscriptionProfileId === payload.profileId
        ? null
        : state.projectChatTranscriptionProfileId,
  }));
  return true;
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

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
  };
}

type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
};

function getStopChatResponseSnapshot(
  chatId: string | null | undefined,
): StopChatResponseSnapshot {
  const state = useAIStore.getState();
  const currentDetails =
    typeof chatId === "string"
      ? state.chatDetails[chatId] ?? getDefaultChatDetails()
      : state.pendingChatDetails ?? getDefaultChatDetails();
  return {
    waitingForResponse: currentDetails.waitingForResponse,
    toolCallArguments: { ...currentDetails.toolCallArguments },
  };
}

function restoreStoppedChatResponseLocally(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
) {
  const restoreDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: snapshot.waitingForResponse,
    toolCallArguments: { ...snapshot.toolCallArguments },
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, restoreDetails);
    return;
  }
  updatePendingChatDetails(restoreDetails);
}

function stopChatResponseLocally(
  chatId: string | null | undefined,
): StopChatResponseSnapshot {
  const snapshot = getStopChatResponseSnapshot(chatId);
  const stopDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: false,
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, stopDetails);
  } else {
    updatePendingChatDetails(stopDetails);
  }
  clearAllAppSpecPatchStreams();
  return snapshot;
}

async function resolveLatestRunningExternalRunIdWithRefresh(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  if (runId) {
    return runId;
  }
  await loadAgentRuns();
  runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  return runId;
}

async function stopExternalChatResponse({
  chatId,
  projectConfigId,
  sectionId,
  failureMessage,
  localSnapshot,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  failureMessage: string;
  localSnapshot: StopChatResponseSnapshot;
}): Promise<boolean> {
  const refreshChatAndResolveWaiting = async (): Promise<{
    hydrated: boolean;
    waitingForResponse: boolean;
  }> => {
    const hydrated = await getExternalAgentChat(
      chatId,
      projectConfigId,
      sectionId,
    );
    const waitingForResponse = Boolean(
      useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
    );
    return { hydrated, waitingForResponse };
  };

  const runId = await resolveLatestRunningExternalRunIdWithRefresh(
    chatId,
    projectConfigId,
  );
  if (!runId) {
    const refreshState = await refreshChatAndResolveWaiting();
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      return true;
    }
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
    return false;
  }
  const response = await route_stop_external_agent_run({ runId });
  if (res200(response)) {
    void loadAgentRuns();
    return true;
  }
  const refreshState = await refreshChatAndResolveWaiting();
  if (refreshState.hydrated && !refreshState.waitingForResponse) {
    return true;
  }
  if (!refreshState.hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
  return false;
}

export async function stopProjectChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId);
  if (typeof chatId !== "string") {
    return true;
  }

  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId: null,
      failureMessage: "Failed to stop project chat.",
      localSnapshot,
    });
  }

  const response = await route_stop_llm_chat({ chatId });
  if (res200(response)) {
    return true;
  }
  const hydrated = await getLLMChat(chatId);
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(
    "Failed to stop project chat.",
    SettaNotificationTypeEnum.warning,
  );
  return false;
}

export async function stopManagedSectionChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  projectConfigId: string,
  sectionId: string,
): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId);
  if (typeof chatId !== "string") {
    return true;
  }
  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId,
      sectionId,
      failureMessage: "Failed to stop section chat.",
      localSnapshot,
    });
  }
  const response = await route_stop_llm_chat({ chatId });
  if (res200(response)) {
    return true;
  }
  const hydrated = await getLLMChat(chatId, sectionId);
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(
    "Failed to stop section chat.",
    SettaNotificationTypeEnum.warning,
  );
  return false;
}

function mergeChatSectionState(
  currentState: ChatSectionState,
  incoming: {
    messages: Array<BaseChatMessageUnion>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  },
  preserveWaitingForResponse: boolean,
): ChatSectionState {
  // Treat backend order as canonical, but keep any more-complete local copies.
  const mergedMessages = mergeChatMessages(
    incoming.messages ?? [],
    currentState.messages ?? [],
  );
  const nextWaitingForResponse = preserveWaitingForResponse
    ? Boolean(incoming.waitingForResponse || currentState.waitingForResponse)
    : Boolean(incoming.waitingForResponse);
  const nextToolCallArguments = preserveWaitingForResponse
    ? {
        ...(currentState.toolCallArguments ?? {}),
        ...(incoming.toolCallArguments ?? {}),
      }
    : { ...(incoming.toolCallArguments ?? {}) };
  return {
    messages: mergedMessages,
    inputText: currentState.inputText ?? "",
    waitingForResponse: nextWaitingForResponse,
    toolCallArguments: nextToolCallArguments,
    activeBranchId: currentState.activeBranchId ?? null,
    branches: { ...(currentState.branches ?? {}) },
  };
}

function applyChatDetailsToSectionState({
  sectionId,
  messages,
  waitingForResponse,
  toolCallArguments,
}: {
  sectionId: string;
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
}): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    const preserveWaitingForResponse = isSectionStreamActive(sectionId);
    nextState = mergeChatSectionState(
      currentState,
      {
        messages,
        waitingForResponse,
        toolCallArguments,
      },
      preserveWaitingForResponse,
    );
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      inputText: nextState.inputText,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

export function initializePendingChatDetails() {
  useAIStore.setState({
    pendingChatDetails: getDefaultChatDetails(),
  });
}

function initializePendingChatDetailsWithMessages(
  messages: Array<BaseChatMessageUnion>,
) {
  useAIStore.setState({
    pendingChatDetails: {
      ...getDefaultChatDetails(),
      messages,
      waitingForResponse: true,
    },
  });
}

export function clearPendingChatDetails() {
  useAIStore.setState({ pendingChatDetails: null });
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<boolean> {
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  if (res200(res)) {
    const { messages, waitingForResponse, llmConfig } = res.data;
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const preserveWaitingForResponse = isChatStreamActive(chatId);
      const nextWaitingForResponse = preserveWaitingForResponse
        ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
        : Boolean(waitingForResponse);
      // Treat backend order as canonical, but keep any more-complete local copies.
      const nextMessages = mergeChatMessages(
        messages,
        existingDetails?.messages ?? [],
      );
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(existingDetails ?? {}),
            messages: nextMessages,
            waitingForResponse: nextWaitingForResponse,
            llmConfig: llmConfig,
          },
        },
      };
    });
    if (sectionId) {
      const nextState = applyChatDetailsToSectionState({
        sectionId,
        messages,
        waitingForResponse,
        toolCallArguments: {},
      });
      persistChatSectionState({
        projectConfigId,
        sectionId,
        nextState,
        reason: "hydrate-llm-chat",
      });
    }
    return true;
  }
  return false;
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<boolean> {
  const res = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  if (res200(res)) {
    const { messages, waitingForResponse, toolCallArguments } = res.data;
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const preserveWaitingForResponse = isChatStreamActive(chatId);
      const nextWaitingForResponse = preserveWaitingForResponse
        ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
        : Boolean(waitingForResponse);
      // Treat backend order as canonical, but keep any more-complete local copies.
      const nextMessages = mergeChatMessages(
        messages,
        existingDetails?.messages ?? [],
      );
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(existingDetails ?? {}),
            messages: nextMessages,
            waitingForResponse: nextWaitingForResponse,
            toolCallArguments,
            llmConfig: null,
          },
        },
      };
    });
    if (sectionId) {
      const nextState = applyChatDetailsToSectionState({
        sectionId,
        messages,
        waitingForResponse,
        toolCallArguments,
      });
      const resolvedProjectConfigId =
        projectConfigId ?? getCurrProjectConfigId();
      persistChatSectionState({
        projectConfigId: resolvedProjectConfigId,
        sectionId,
        nextState,
        reason: "hydrate-external-chat",
      });
    }
    return true;
  }
  return false;
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  options: {
    messageId?: string;
    agentProfileId?: string | null;
    sectionId?: string | null;
    executionSettings?: ChatExecutionSettings | null;
    appGeneration?: ChatAppGenerationContext | null;
  } = {},
): Promise<string | null> {
  const trimmed = message.trim();
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    return null;
  }
  const resolvedExecutionSettings =
    options.executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const appGeneration = options.appGeneration ?? null;

  // Add user message immediately for responsive UI
  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const userMessage = {
    id: options.messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
  };
  const userMessageId = userMessage.id;

  applyOptimisticUserMessage(chatId, userMessage);

  try {
    const projectConfigId = getCurrProjectConfigId();
    const appGenerationMode = appGeneration?.mode ?? null;
    const appSpecStreamingEnabledForSubmit =
      appGenerationMode === null
        ? false
        : useLocalStorage.getState().appSpecStreamingEnabled;
    const res = await route_get_llm_response({
      message: userMessage,
      thinking,
      chatId,
      engineConfigId,
      agentProfileId: options.agentProfileId ?? null,
      appSpecStreamingEnabled: appSpecStreamingEnabledForSubmit,
      appGenerationMode: appGenerationMode,
      appGenerationReferenceImageUrl: appGeneration?.referenceImageUrl ?? null,
      appGenerationReferenceImageNotes:
        appGeneration?.referenceImageNotes ?? null,
      projectConfigId,
      sectionId: options.sectionId ?? null,
      allowUnscoped: options.sectionId == null,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (res200(res)) {
      const returnedChatId = res.data ?? chatId ?? null;
      if (returnedChatId) {
        if (isExternalEngine) {
          await getExternalAgentChat(
            returnedChatId,
            projectConfigId,
            options.sectionId ?? undefined,
          );
        } else {
          await getLLMChat(returnedChatId, options.sectionId ?? undefined);
        }
      }
      return returnedChatId;
    }
    const failureDetail =
      getErrorDetail(res.data) ??
      (typeof res.status === "number"
        ? `Chat request failed (status ${res.status}).`
        : "Chat request failed.");
    throw new Error(failureDetail);
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    rollbackOptimisticUserMessage(chatId, userMessageId);
    throw err;
  }
}

export async function submitEditedMessage({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  isExternalEngine,
  agentProfileId,
  sectionId,
  executionSettings,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  agentProfileId?: string | null;
  sectionId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
}): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const editedMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content,
    attachments,
  };
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }
  initializePendingChatDetailsWithMessages(nextMessages);
  const projectConfigId = getCurrProjectConfigId();

  const setSectionChatId = async (nextChatId: string | null) => {
    if (!sectionId) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: nextChatId,
        });
      },
      send: () =>
        route_set_chat_section_chat_id({
          projectConfigId,
          sectionId,
          chatId: nextChatId,
        }),
    });
  };

  if (sectionId) {
    await setSectionChatId(null);
  } else {
    useAIStore.setState({ activeChatId: null });
  }

  try {
    const res = await route_get_llm_response({
      message: editedMessage,
      thinking,
      chatId: null,
      engineConfigId: resolvedEngineConfigId,
      agentProfileId: agentProfileId ?? null,
      projectConfigId,
      sectionId: sectionId ?? null,
      allowUnscoped: sectionId == null,
      branchParentChatId: parentChatId,
      branchFromMessageId: messageId,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (!res200(res)) {
      const detail =
        getErrorDetail(res.data) ??
        (res.status
          ? `AI request failed (status ${res.status}).`
          : "AI request failed.");
      addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
      clearPendingChatDetails();
      if (sectionId) {
        await setSectionChatId(parentChatId);
      } else {
        useAIStore.setState({ activeChatId: parentChatId });
      }
      return null;
    }
    const returnedChatId = res.data ?? null;
    if (returnedChatId) {
      if (isExternalEngine) {
        await getExternalAgentChat(
          returnedChatId,
          projectConfigId,
          sectionId ?? undefined,
        );
      } else {
        await getLLMChat(returnedChatId, sectionId ?? undefined);
      }
      void loadAgentRuns();
      if (sectionId) {
        await setSectionChatId(returnedChatId);
        commitPendingChatDetails(returnedChatId);
      } else {
        finalizePendingChatDetails(returnedChatId);
      }
    } else {
      clearPendingChatDetails();
    }
    return returnedChatId;
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    clearPendingChatDetails();
    if (sectionId) {
      await setSectionChatId(parentChatId);
    } else {
      useAIStore.setState({ activeChatId: parentChatId });
    }
    throw err;
  }
}

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await route_respond_external_agent_approval({
    approvalId,
    approved,
  });
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await route_respond_external_agent_question({
    toolCallId,
    answers,
  });
  return res200(res);
}

async function findLatestRunningExternalRunId(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  const runs = agentRuns.filter((run) => {
    if (run.status !== AgentRunStatusEnum.running) {
      return false;
    }
    const inputs = run.inputs ?? {};
    const runType = typeof inputs.runType === "string" ? inputs.runType : null;
    if (runType !== "external_agent") {
      return false;
    }
    const runChatId = typeof inputs.chatId === "string" ? inputs.chatId : null;
    if (runChatId !== chatId) {
      return false;
    }
    const runProjectConfigId =
      typeof inputs.projectConfigId === "string"
        ? inputs.projectConfigId
        : null;
    if (projectConfigId && runProjectConfigId !== projectConfigId) {
      return false;
    }
    return true;
  });
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a));
  return runs[0]?.id ?? null;
}

function applyStreamingChunkToSection(
  sectionId: string,
  chunk: LLMStreamingResponse["chunk"],
  projectConfigId: string,
) {
  const nextState = applyChatSectionStreamDelta(sectionId, chunk);
  if (chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA) {
    applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.TOOL_RESULT) {
    maybeApplyAppDefinitionToolResult(chunk.result);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    clearToolArgumentPreviewByToolCallId(
      projectConfigId,
      chunk.result.tool_call_id,
    );
    handleAgenticScopeViolation(chunk.result, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    recordFinalizedMessage(sectionId, chunk.message.id);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    const toolCallIds =
      chunk.message.role === ChatRoleEnum.assistant
        ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
        : [];
    clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_STOP) {
    if (!shouldPersistOnMessageStop(sectionId, chunk.message_id)) {
      return;
    }
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const { chatId, chunk } = msg;
  const projectConfigId = msg.projectConfigId ?? getCurrProjectConfigId();
  let sectionId = msg.sectionId;
  if (shouldIgnoreResponsePlaceholderChunk(chunk)) {
    return;
  }
  if (!sectionId && chatId) {
    sectionId = resolveSectionIdForChatId(chatId);
  }
  const isManagedSection = sectionId
    ? isManagedChatSection(useProjectState.getState(), sectionId)
    : false;
  const shouldUpdateChatDetails = !sectionId || isManagedSection;

  const shouldMarkActive =
    chunk.type === StreamingEventTypeEnum.MESSAGE_START ||
    chunk.type === StreamingEventTypeEnum.DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_CALL_DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA;
  if (shouldMarkActive) {
    markChatStreamActive(chatId, sectionId);
  }
  if (
    chunk.type === StreamingEventTypeEnum.MESSAGE_STOP ||
    chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED
  ) {
    clearChatStreamActive(chatId, sectionId);
  }
  if (sectionId) {
    applyStreamingChunkToSection(sectionId, chunk, projectConfigId);
  }
  if (shouldUpdateChatDetails) {
    if (!sectionId) {
      promotePendingChatDetailsIfNeeded(chatId);
    }
    switch (chunk.type) {
      case StreamingEventTypeEnum.MESSAGE_START:
        handleMessageStart(chatId, chunk);
        return;
      case StreamingEventTypeEnum.DELTA:
        handleMessageDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_CALL_DELTA:
        handleToolCallDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA:
        if (sectionId) {
          updateChatDetails(chatId, (details) =>
            applyToolCallDelta(details, chunk),
          );
          return;
        }
        handleToolArgumentPreviewDelta(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.TOOL_RESULT:
        if (sectionId) {
          updateChatDetails(chatId, (details) => {
            return {
              ...details,
              messages: upsertMessage(details.messages, chunk.result),
            };
          });
          clearToolArgumentPreviewByToolCallId(
            projectConfigId,
            chunk.result.tool_call_id,
          );
          return;
        }
        handleToolResult(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.MESSAGE_STOP:
        handleMessageStop(chatId);
        return;
      case StreamingEventTypeEnum.MESSAGE_FINALIZED:
        handleMessageFinalized(chatId, chunk, projectConfigId);
        return;
      default:
        return chunk satisfies never;
    }
  }
}

function isResponsePlaceholderId(
  messageId: string | null | undefined,
): boolean {
  if (!messageId) {
    return false;
  }
  return messageId.startsWith("rs_") || messageId.startsWith("resp_");
}

function shouldIgnoreResponsePlaceholderChunk(
  chunk: LLMStreamingResponse["chunk"],
): boolean {
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_START) {
    return isResponsePlaceholderId(chunk.message.id);
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    return isResponsePlaceholderId(chunk.message.id);
  }
  if (
    chunk.type === StreamingEventTypeEnum.DELTA ||
    chunk.type === StreamingEventTypeEnum.MESSAGE_STOP
  ) {
    return isResponsePlaceholderId(chunk.message_id);
  }
  return false;
}

type ChatSectionStreamChunk = LLMStreamingResponse["chunk"];

type RunPayload = Record<string, unknown>;

function buildChatStateFromAgentRun(run: AgentRun): ChatSectionState {
  const outputMessages = extractRunMessages(run.outputs);
  if (outputMessages) {
    return buildChatSectionState(
      outputMessages,
      run.status === AgentRunStatusEnum.running,
    );
  }

  const inputMessages = extractRunMessages(run.inputs) ?? [];
  return buildChatSectionState(
    inputMessages,
    run.status === AgentRunStatusEnum.running,
  );
}

function buildChatSectionState(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean,
): ChatSectionState {
  return {
    messages: [...messages],
    inputText: "",
    waitingForResponse,
    toolCallArguments: {},
  };
}

function extractRunMessages(
  payload: RunPayload | null,
): Array<BaseChatMessageUnion> | null {
  if (!payload) {
    return null;
  }
  const raw = payload.messages;
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw as Array<BaseChatMessageUnion>;
}

export async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }
  const resolveFromRuns = (runs: AgentRun[]): string | null => {
    const matchingRuns = runs.filter(
      (run) => getRunInputString(run, "chatId") === chatId,
    );
    const runsWithEngine = matchingRuns.filter((run) =>
      getRunInputString(run, "engineConfigId"),
    );
    if (runsWithEngine.length === 0) {
      return null;
    }
    const [latestRun] = [...runsWithEngine].sort(
      (a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a),
    );
    return latestRun ? getRunInputString(latestRun, "engineConfigId") : null;
  };

  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  let resolved = resolveFromRuns(agentRuns);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveFromRuns(agentRuns);
  }
  if (resolved) {
    return resolved;
  }
  const { chatDetails, engineConfigs } = useAIStore.getState();
  const llmConfigId = chatDetails[chatId]?.llmConfig?.id ?? null;
  if (!llmConfigId) {
    return null;
  }
  const matchingEngine = engineConfigs.find(
    (config) => config.settaLlmConfigId === llmConfigId,
  );
  return matchingEngine?.id ?? null;
}

function applyChatSectionStreamDelta(
  sectionId: string,
  chunk: ChatSectionStreamChunk,
): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

export function persistChatSectionState({
  projectConfigId,
  sectionId,
  nextState,
  reason,
}: {
  projectConfigId: string;
  sectionId: string;
  nextState: ChatSectionState | null;
  reason: string;
}): void {
  if (!nextState) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        messages: nextState.messages,
        inputText: nextState.inputText,
        waitingForResponse: nextState.waitingForResponse,
        toolCallArguments: nextState.toolCallArguments,
        activeBranchId: nextState.activeBranchId,
        branches: nextState.branches,
      });
    },
    send: (frontendOpId) =>
      route_set_chat_section_state({
        projectConfigId,
        sectionId,
        state: nextState,
        frontendOpId,
      }),
  });
}

function handleMessageStart(chatId: string, chunk: MessageStartEvent) {
  updateChatDetails(chatId, (details) => ({
    ...details,
    messages: upsertMessage(details.messages, chunk.message),
    waitingForResponse: true,
  }));
}

function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  if (!chunk.content || chunk.content.length === 0) {
    return;
  }
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: applyMessageDeltaToChatMessages(details.messages, chunk),
      waitingForResponse: true,
    };
  });
}

function handleToolCallDelta(chatId: string, chunk: ToolCallDeltaEvent) {
  updateChatDetails(chatId, (details) => applyToolCallDelta(details, chunk));
}

function handleAgenticScopeViolation(
  toolResult: ToolResultEvent["result"],
  projectConfigId: string,
): void {
  const violation = extractAgenticScopeViolation(toolResult);
  if (!violation) {
    return;
  }
  receiveAgenticScopeViolationEdges({
    projectConfigId,
    edges: violation.edges,
  });
  const existingTimeout = scopeViolationToastTimeouts.get(projectConfigId);
  if (existingTimeout !== undefined) {
    globalThis.clearTimeout(existingTimeout);
    const timeoutId = globalThis.setTimeout(() => {
      scopeViolationToastTimeouts.delete(projectConfigId);
    }, SCOPE_VIOLATION_TIMEOUT_MS);
    scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
    return;
  }
  const notice = `${violation.message} Add the missing agentic edge(s) shown on the canvas. Use Project Chat for full access.`;
  addTemporaryNotification(notice, SettaNotificationTypeEnum.warning);
  const timeoutId = globalThis.setTimeout(() => {
    scopeViolationToastTimeouts.delete(projectConfigId);
  }, SCOPE_VIOLATION_TIMEOUT_MS);
  scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
}

const APP_DEFINITION_TOOL_NAMES = new Set([
  "setta__set_app_definition",
  "setta__update_app_definition",
  "setta__stream_app_definition",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractToolStructuredContent(
  toolResult: unknown,
): Record<string, unknown> | null {
  if (!isRecord(toolResult)) {
    return null;
  }
  const structured = toolResult.structuredContent;
  if (!structured) {
    return null;
  }
  if (!isRecord(structured)) {
    return null;
  }
  return structured;
}

function maybeApplyAppDefinitionToolResult(toolMessage: ToolChatMessage): void {
  const toolName =
    typeof toolMessage.tool_name === "string" ? toolMessage.tool_name : null;
  if (!toolName || !APP_DEFINITION_TOOL_NAMES.has(toolName)) {
    return;
  }
  if (toolMessage.is_error) {
    if (toolName === "setta__stream_app_definition") {
      clearAppSpecPatchStream(toolMessage.tool_call_id);
      // Keep the last streamed preview visible even if the tool call fails validation.
      // Otherwise the preview disappears while the AI iterates on fixes.
    }
    return;
  }
  const structured = extractToolStructuredContent(toolMessage.result);
  if (!structured) {
    return;
  }
  const hasSpec = Object.prototype.hasOwnProperty.call(structured, "appSpec");
  const hasDefinition = Object.prototype.hasOwnProperty.call(
    structured,
    "appDefinition",
  );
  if (!hasSpec && !hasDefinition) {
    return;
  }

  const nextSpec = hasSpec ? (structured.appSpec as unknown) : undefined;
  const nextDefinition = hasDefinition
    ? (structured.appDefinition as unknown)
    : undefined;

  useAppDefinition.setState((state) => ({
    appSpec: nextSpec === undefined ? state.appSpec : nextSpec ?? null,
    appDefinition:
      nextDefinition === undefined
        ? state.appDefinition
        : ((nextDefinition ?? null) as AppDefinition | null),
  }));
  useAppPreview.setState({
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  });
  if (toolName === "setta__stream_app_definition") {
    clearAppSpecPatchStream(toolMessage.tool_call_id);
  }
  addTemporaryNotification("App spec updated.");
}

function handleToolResult(
  chatId: string,
  chunk: ToolResultEvent,
  projectConfigId: string,
) {
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.result),
    };
  });
  clearToolArgumentPreviewByToolCallId(
    projectConfigId,
    chunk.result.tool_call_id,
  );
  handleAgenticScopeViolation(chunk.result, projectConfigId);
  maybeApplyAppDefinitionToolResult(chunk.result);
}

function handleMessageStop(chatId: string) {
  updateChatDetails(chatId, (details) => ({
    ...details,
    waitingForResponse: false,
  }));
  clearAllAppSpecPatchStreams();
}

function handleMessageFinalized(
  chatId: string,
  chunk: MessageFinalizedEvent,
  projectConfigId: string,
) {
  const targetId = chunk.message.id;
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.message, targetId),
      waitingForResponse: false,
      toolCallArguments: {},
    };
  });
  const toolCallIds: string[] =
    chunk.message.role === "assistant"
      ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
      : [];
  clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
}

function handleToolArgumentPreviewDelta(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    // For app spec patch streaming, the `arguments_delta` includes the entire JSON tool
    // arguments payload (including the growing patches string). Updating chatDetails on
    // every tiny delta can overwhelm React. We only need the patch preview for live
    // rendering, so keep chat updates minimal.
    ensureToolCallPlaceholder(chatId, chunk);
    applyToolArgumentPreviewDeltaToPreviewStore(chunk);
    return;
  }

  updateChatDetails(chatId, (details) => applyToolCallDelta(details, chunk));
  applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
}

function ensureToolCallPlaceholder(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
) {
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    if (!existingDetails) {
      return state;
    }
    const { messages, changed } = updateMessageById(
      existingDetails.messages,
      chunk.message_id,
      (message) => {
        const toolCalls = [...(message.tool_calls ?? [])];
        const existingIndex = toolCalls.findIndex(
          (entry) => entry.id === chunk.tool_call_id,
        );
        if (existingIndex !== -1) {
          const existingCall = toolCalls[existingIndex];
          if (existingCall.function.name === chunk.tool_name) {
            return null;
          }
          toolCalls[existingIndex] = {
            ...existingCall,
            function: {
              ...existingCall.function,
              name: chunk.tool_name,
            },
          };
          return { ...message, tool_calls: toolCalls };
        }
        toolCalls.push(
          createToolCallPlaceholder({
            tool_call_id: chunk.tool_call_id,
            tool_name: chunk.tool_name,
          }),
        );
        return { ...message, tool_calls: toolCalls };
      },
    );
    if (!changed) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...existingDetails,
          messages,
        },
      },
    };
  });
}

function applyToolArgumentPreviewDeltaToPreviewStore(
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId?: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    const nextSpec = applyAppSpecPatchPreviewDelta({
      toolCallId: chunk.tool_call_id,
      previewValueDelta: chunk.preview_value_delta,
    });
    if (nextSpec) {
      useAppPreview.setState({ aiPreviewSpecOverride: nextSpec });
    }
    return;
  }
  const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
  useToolArgumentPreview.setState((state) => {
    const previewState =
      state.byProjectConfigId[resolvedProjectConfigId] ??
      (state.byProjectConfigId[resolvedProjectConfigId] =
        createToolArgumentPreviewProjectState());
    const previewDelta = chunk.preview_value_delta;
    const toolCallId = chunk.tool_call_id;
    switch (chunk.preview_kind) {
      case "code": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing = previewState.previewCodeBySectionId[sectionId];
          previewState.previewCodeBySectionId[sectionId] = applyPreviewDelta(
            existing,
            previewDelta,
            toolCallId,
          );
        }
        return;
      }
      case "paramValue": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        const paramIds = chunk.target_ids_by_type.codeObj ?? [];
        if (sectionIds.length === 0 || paramIds.length === 0) {
          return;
        }
        for (const sectionId of sectionIds) {
          const paramEntries =
            previewState.previewParamValueBySectionAndParamId[sectionId] ??
            (previewState.previewParamValueBySectionAndParamId[sectionId] = {});
          for (const paramInfoId of paramIds) {
            const existing = paramEntries[paramInfoId];
            paramEntries[paramInfoId] = applyPreviewDelta(
              existing,
              previewDelta,
              toolCallId,
            );
          }
        }
        return;
      }
      case "callableName": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing =
            previewState.previewCallableNameBySectionId[sectionId];
          previewState.previewCallableNameBySectionId[sectionId] =
            applyPreviewDelta(existing, previewDelta, toolCallId);
        }
        return;
      }
      default: {
        chunk.preview_kind satisfies never;
        return;
      }
    }
  });
}

function applyToolCallDelta(
  details: ChatDetails,
  chunk: {
    message_id: string;
    tool_call_id: string;
    tool_name: string | null;
    arguments_delta: string;
  },
): ChatDetails {
  const toolCallArguments = {
    ...details.toolCallArguments,
    [chunk.tool_call_id]:
      (details.toolCallArguments?.[chunk.tool_call_id] ?? "") +
      chunk.arguments_delta,
  };
  const { messages, changed } = updateMessageById(
    details.messages,
    chunk.message_id,
    (message) => {
      const toolCalls = [...(message.tool_calls ?? [])];
      const existingIndex = toolCalls.findIndex(
        (entry) => entry.id === chunk.tool_call_id,
      );
      if (existingIndex !== -1) {
        if (!chunk.tool_name) {
          return null;
        }
        const existingCall = toolCalls[existingIndex];
        if (existingCall.function.name === chunk.tool_name) {
          return null;
        }
        toolCalls[existingIndex] = {
          ...existingCall,
          function: {
            ...existingCall.function,
            name: chunk.tool_name,
          },
        };
        return { ...message, tool_calls: toolCalls };
      }
      toolCalls.push(createToolCallPlaceholder(chunk));
      return { ...message, tool_calls: toolCalls };
    },
  );
  return {
    ...details,
    toolCallArguments,
    ...(changed ? { messages } : {}),
  };
}

function createToolArgumentPreviewProjectState(): ToolArgumentPreviewProjectState {
  return {
    previewCodeBySectionId: {},
    previewParamValueBySectionAndParamId: {},
    previewCallableNameBySectionId: {},
  };
}

function applyPreviewDelta(
  existing: ToolArgumentPreviewEntry | undefined,
  previewDelta: string,
  toolCallId: string,
): ToolArgumentPreviewEntry {
  if (!existing || existing.toolCallId !== toolCallId) {
    return { value: previewDelta, toolCallId };
  }
  if (!previewDelta) {
    return existing;
  }
  return { value: existing.value + previewDelta, toolCallId };
}

function clearToolArgumentPreviewByToolCallId(
  projectConfigId: string,
  toolCallId: string,
) {
  clearToolArgumentPreviewByToolCallIds(projectConfigId, [toolCallId]);
}

function clearToolArgumentPreviewByToolCallIds(
  projectConfigId: string,
  toolCallIds: string[],
) {
  if (toolCallIds.length === 0) {
    return;
  }
  const toolCallIdSet = new Set(toolCallIds);
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCallableNameBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
    for (const [sectionId, paramEntries] of Object.entries(
      previewState.previewParamValueBySectionAndParamId,
    )) {
      for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
        if (toolCallIdSet.has(entry.toolCallId)) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

function ensureTextContentBlock(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
  index: number,
): MessageTextContent {
  while (content.length <= index) {
    content.push(createMessageTextContent({ text: "" }));
  }
  const block = content[index];
  if (!block || block.type !== "text") {
    const nextBlock = createMessageTextContent({ text: "" });
    content[index] = nextBlock;
    return nextBlock;
  }
  return block;
}

function ensureThinkingContentBlock(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
  index: number,
): MessageThinkingContent {
  while (content.length <= index) {
    content.push(createMessageThinkingContent({ thinking: "" }));
  }
  const block = content[index];
  if (!block || block.type !== "thinking") {
    const nextBlock = createMessageThinkingContent({ thinking: "" });
    content[index] = nextBlock;
    return nextBlock;
  }
  return block as MessageThinkingContent;
}

function createToolCallPlaceholder(chunk: {
  tool_call_id: string;
  tool_name: string | null;
}): ToolCall {
  return {
    id: chunk.tool_call_id,
    type: "function",
    function: {
      name: chunk.tool_name ?? "",
      arguments: {},
    },
  };
}

function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetails) => ChatDetails | null,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails = {
      ...getDefaultChatDetails(),
      ...(state.chatDetails[chatId] ?? {}),
    };
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: nextDetails,
      },
    };
  });
}

function updatePendingChatDetails(
  updater: (details: ChatDetails) => ChatDetails | null,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails =
      state.pendingChatDetails ?? getDefaultChatDetails();
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return {
      pendingChatDetails: nextDetails,
    };
  });
}

function mergeChatDetails(
  existingDetails: ChatDetails,
  pendingDetails: ChatDetails,
  preserveWaitingForResponse: boolean,
): ChatDetails {
  const nextWaitingForResponse = preserveWaitingForResponse
    ? pendingDetails.waitingForResponse || existingDetails.waitingForResponse
    : pendingDetails.waitingForResponse;
  return {
    ...existingDetails,
    ...pendingDetails,
    messages: mergeChatMessages(
      existingDetails.messages,
      pendingDetails.messages,
    ),
    toolCallArguments: {
      ...existingDetails.toolCallArguments,
      ...pendingDetails.toolCallArguments,
    },
    waitingForResponse: nextWaitingForResponse,
  };
}

function promotePendingChatDetailsIfNeeded(chatId: string) {
  useAIStore.setState((state) => {
    if (!chatId) {
      return state;
    }
    const activeChatId = state.activeChatId;
    if (activeChatId !== null && activeChatId !== undefined) {
      return state;
    }
    if (!state.pendingChatDetails) {
      return state;
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingDetails = state.pendingChatDetails;
    const preserveWaitingForResponse = isChatStreamActive(chatId);
    const mergedDetails = mergeChatDetails(
      existingDetails,
      pendingDetails,
      preserveWaitingForResponse,
    );
    return {
      activeChatId: chatId,
      pendingChatDetails: null,
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergedDetails,
      },
    };
  });
}

export function finalizePendingChatDetails(chatId: string) {
  useAIStore.setState((state) => {
    const pendingDetails = state.pendingChatDetails;
    const shouldSetActive =
      state.activeChatId === null ||
      state.activeChatId === undefined ||
      state.activeChatId === chatId;
    const needsActiveUpdate = shouldSetActive && state.activeChatId !== chatId;
    if (!pendingDetails && !needsActiveUpdate) {
      return state;
    }
    const nextState: Partial<ReturnType<typeof useAIStore.getState>> = {};
    if (pendingDetails) {
      const existingDetails =
        state.chatDetails[chatId] ?? getDefaultChatDetails();
      nextState.chatDetails = {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      };
      nextState.pendingChatDetails = null;
    }
    if (shouldSetActive) {
      nextState.activeChatId = chatId;
    }
    return nextState;
  });
}

function commitPendingChatDetails(chatId: string) {
  useAIStore.setState((state) => {
    const pendingDetails = state.pendingChatDetails;
    if (!pendingDetails) {
      return {};
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      pendingChatDetails: null,
    };
  });
}

function applyOptimisticUserMessage(
  chatId: string | null,
  userMessage: BaseChatMessageUnion,
) {
  const updater = (details: ChatDetails) => ({
    ...details,
    messages: [...details.messages, userMessage],
    waitingForResponse: true,
  });
  if (chatId === null) {
    updatePendingChatDetails(updater);
    return;
  }
  updateChatDetails(chatId, updater);
}

function rollbackOptimisticUserMessage(
  chatId: string | null,
  userMessageId: string,
) {
  const updater = (details: ChatDetails) => ({
    ...details,
    messages: details.messages.filter(
      (message) => message.id !== userMessageId,
    ),
    waitingForResponse: false,
  });
  if (chatId === null) {
    updatePendingChatDetails(updater);
    return;
  }
  updateChatDetails(chatId, updater);
}

function updateMessageById(
  messages: Array<BaseChatMessageUnion>,
  messageId: string | null,
  updater: (message: BaseChatMessageUnion) => BaseChatMessageUnion | null,
): { messages: Array<BaseChatMessageUnion>; changed: boolean } {
  if (!messageId) {
    return { messages, changed: false };
  }
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return { messages, changed: false };
  }
  const updatedMessage = updater(messages[index]);
  if (!updatedMessage) {
    return { messages, changed: false };
  }
  const nextMessages = [...messages];
  nextMessages[index] = updatedMessage;
  return { messages: nextMessages, changed: true };
}

function upsertMessage(
  messages: Array<BaseChatMessageUnion>,
  message: BaseChatMessageUnion,
  targetId: string | null = null,
) {
  const idToUse = targetId ?? message.id;
  const existingIndex = messages.findIndex((entry) => entry.id === idToUse);
  if (existingIndex === -1) {
    return [...messages, message];
  }
  const nextMessages = [...messages];
  nextMessages[existingIndex] = message;
  return nextMessages;
}

function getChatSectionStateFromStore(
  state: ZustandProjectState,
  sectionId: string,
): ChatSectionState | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }
  const effective = {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  };
  if (effective.type !== SectionTypeEnum.Chat) {
    return null;
  }
  const chatImpl = effective as {
    type: SectionTypeEnum.Chat;
    messages: BaseChatMessageUnion[];
    inputText: string;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
    activeBranchId?: string | null;
    branches?: Record<string, ChatSectionBranch>;
  };
  return {
    messages: [...(chatImpl.messages ?? [])],
    inputText: chatImpl.inputText ?? "",
    waitingForResponse: Boolean(chatImpl.waitingForResponse),
    toolCallArguments: { ...(chatImpl.toolCallArguments ?? {}) },
    activeBranchId: chatImpl.activeBranchId ?? null,
    branches: { ...(chatImpl.branches ?? {}) },
  };
}

type ChatIdLookupCache = {
  projectConfigId: string;
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  sections: ZustandProjectState["sections"];
  map: Map<string, string>;
};

let chatIdLookupCache: ChatIdLookupCache | null = null;

function buildChatIdLookup(state: ZustandProjectState): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      continue;
    }
    const core = state.sections[sectionId];
    if (!core) {
      continue;
    }
    const effective = {
      ...impl,
      ...core.sharedModifier,
      ...variant.modifier,
    };
    if (effective.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const candidate =
      typeof effective.chatId === "string" && effective.chatId.trim()
        ? effective.chatId
        : null;
    if (!candidate) {
      continue;
    }
    lookup.set(candidate, sectionId);
  }
  return lookup;
}

function resolveSectionIdForChatId(chatId: string): string | null {
  const state = useProjectState.getState();
  const shouldRebuild =
    !chatIdLookupCache ||
    chatIdLookupCache.projectConfigId !== state.projectConfig.id ||
    chatIdLookupCache.sectionVariantMap !==
      state.projectConfig.sectionVariantMap ||
    chatIdLookupCache.sectionVariants !== state.sectionVariants ||
    chatIdLookupCache.sectionImpls !== state.sectionImpls ||
    chatIdLookupCache.sections !== state.sections;
  if (shouldRebuild) {
    chatIdLookupCache = {
      projectConfigId: state.projectConfig.id,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sections: state.sections,
      map: buildChatIdLookup(state),
    };
  }
  return chatIdLookupCache.map.get(chatId) ?? null;
}

function applyStreamDeltaToChatSectionState(
  state: ChatSectionState,
  chunk: ChatSectionStreamChunk,
): ChatSectionState {
  let messages = [...state.messages];
  let toolCallArguments = { ...state.toolCallArguments };
  let waitingForResponse = state.waitingForResponse;
  const inputText = state.inputText;
  const activeBranchId = state.activeBranchId ?? null;
  const branches = { ...(state.branches ?? {}) };

  const syncActiveBranchMessages = (
    nextMessages: Array<BaseChatMessageUnion>,
  ) => {
    if (!activeBranchId) {
      return branches;
    }
    const activeBranch = branches[activeBranchId];
    if (!activeBranch) {
      return branches;
    }
    return {
      ...branches,
      [activeBranchId]: {
        ...activeBranch,
        messages: nextMessages,
      },
    };
  };

  switch (chunk.type) {
    case StreamingEventTypeEnum.MESSAGE_START: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = true;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.DELTA: {
      messages = applyMessageDeltaToChatMessages(messages, chunk);
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_CALL_DELTA: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_RESULT: {
      messages = upsertMessage(messages, chunk.result);
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_STOP: {
      waitingForResponse = false;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_FINALIZED: {
      const messageToUpsert =
        chunk.message.role === ChatRoleEnum.assistant
          ? mergeFinalizedAssistantMessage(
              messages,
              chunk.message as AssistantChatMessage,
            )
          : chunk.message;
      messages = upsertMessage(messages, messageToUpsert);
      waitingForResponse = false;
      toolCallArguments = {};
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    default: {
      chunk satisfies never;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
  }
}

function mergeFinalizedAssistantMessage(
  messages: Array<BaseChatMessageUnion>,
  message: AssistantChatMessage,
): AssistantChatMessage {
  if (message.content.length > 0) {
    return message;
  }
  const existing = messages.find((entry) => entry.id === message.id);
  if (!existing || existing.role !== ChatRoleEnum.assistant) {
    return message;
  }
  const existingContent = existing.content ?? [];
  if (existingContent.length === 0) {
    return message;
  }
  return {
    ...message,
    content: [...existingContent],
  };
}

function applyMessageDeltaToChatMessages(
  messages: Array<BaseChatMessageUnion>,
  chunk: MessageDeltaEvent,
): Array<BaseChatMessageUnion> {
  if (!chunk.content || chunk.content.length === 0) {
    return messages;
  }
  const { messages: updatedMessages, assistant } = ensureAssistantMessage(
    messages,
    chunk.message_id,
  );
  let mutated = false;
  const content = [...assistant.content];
  for (const delta of chunk.content ?? []) {
    if (delta.type === "text_delta") {
      const index = normalizeChatContentIndex(delta.index, content.length);
      const block = ensureTextContentBlock(content, index);
      if (delta.text) {
        block.text += delta.text;
        mutated = true;
      }
      continue;
    }
    if (delta.type === "thinking_delta") {
      const index = normalizeChatContentIndex(delta.index, content.length);
      const block = ensureThinkingContentBlock(content, index);
      const thinkingUpdate = delta.thinking ?? "";
      const summaryUpdate = delta.summary;
      const signatureUpdate = delta.signature;
      let blockMutated = false;
      if (thinkingUpdate) {
        block.thinking += thinkingUpdate;
        blockMutated = true;
      }
      if (summaryUpdate !== undefined && summaryUpdate !== null) {
        block.summary = summaryUpdate;
        blockMutated = true;
      }
      if (signatureUpdate !== undefined) {
        block.signature = signatureUpdate ?? "";
        blockMutated = true;
      }
      if (blockMutated) {
        mutated = true;
      }
      continue;
    }
    delta satisfies never;
  }
  if (!mutated) {
    return updatedMessages;
  }
  assistant.content = content;
  return updatedMessages;
}

function applyToolCallDeltaToChatMessages(
  messages: Array<BaseChatMessageUnion>,
  toolCallArguments: Record<string, string>,
  chunk: ToolCallDeltaEvent | ToolArgumentPreviewDeltaEvent,
): {
  messages: Array<BaseChatMessageUnion>;
  toolCallArguments: Record<string, string>;
} {
  const nextToolCallArguments = {
    ...toolCallArguments,
    [chunk.tool_call_id]:
      (toolCallArguments[chunk.tool_call_id] ?? "") + chunk.arguments_delta,
  };
  const { messages: updatedMessages, assistant } = ensureAssistantMessage(
    messages,
    chunk.message_id,
  );
  const toolCalls = [...(assistant.tool_calls ?? [])];
  const existingIndex = toolCalls.findIndex(
    (entry) => entry.id === chunk.tool_call_id,
  );
  if (existingIndex === -1) {
    toolCalls.push(createToolCallPlaceholder(chunk));
  } else if (chunk.tool_name) {
    const existingCall = toolCalls[existingIndex];
    if (existingCall.function.name !== chunk.tool_name) {
      toolCalls[existingIndex] = {
        ...existingCall,
        function: {
          ...existingCall.function,
          name: chunk.tool_name,
        },
      };
    }
  }
  assistant.tool_calls = toolCalls.length > 0 ? toolCalls : null;
  return {
    messages: updatedMessages,
    toolCallArguments: nextToolCallArguments,
  };
}

function ensureAssistantMessage(
  messages: Array<BaseChatMessageUnion>,
  messageId: string,
): {
  messages: Array<BaseChatMessageUnion>;
  assistant: AssistantChatMessage;
} {
  const existingIndex = messages.findIndex((entry) => entry.id === messageId);
  if (existingIndex !== -1) {
    const existing = messages[existingIndex];
    if (existing.role === ChatRoleEnum.assistant) {
      const assistant: AssistantChatMessage = {
        ...existing,
        content: [...existing.content],
        tool_calls: existing.tool_calls ? [...existing.tool_calls] : null,
      };
      const nextMessages = [...messages];
      nextMessages[existingIndex] = assistant;
      return { messages: nextMessages, assistant };
    }
  }
  const assistant: AssistantChatMessage = {
    id: messageId,
    role: ChatRoleEnum.assistant,
    content: [],
    tool_calls: null,
  };
  return { messages: [...messages, assistant], assistant };
}

function normalizeChatContentIndex(
  index: number | null | undefined,
  currentLength: number,
): number {
  if (index === null || index === undefined) {
    return Math.max(currentLength - 1, 0);
  }
  if (index < 0) {
    return 0;
  }
  return index;
}
