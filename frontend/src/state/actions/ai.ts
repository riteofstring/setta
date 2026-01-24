import {
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useProjectState,
  useToolArgumentPreview,
  type ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_create_agent_profile,
  route_create_engine_config,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_delete_agent_profile,
  route_delete_engine_config,
  route_delete_external_agent_config,
  route_delete_prompt_template,
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
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
  route_update_agent_profile,
  route_update_engine_config,
  route_update_external_agent_config,
  route_update_prompt_template,
} from "utils/generatedEndpoints";
import {
  AgentProfile,
  AgentRun,
  AgentRunStatusEnum,
  AllLLMConfigs,
  APIKeys,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  ChatSectionState,
  CreateAgentProfileRequestInput,
  CreateEngineConfigRequestInput,
  CreateExternalAgentConfigRequestInput,
  createMessageTextContent,
  createMessageThinkingContent,
  CreatePromptTemplateRequestInput,
  DeleteAgentProfileRequestInput,
  DeleteEngineConfigRequestInput,
  DeleteExternalAgentConfigRequestInput,
  DeletePromptTemplateRequestInput,
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
  StreamingEventTypeEnum,
  ToolArgumentPreviewDeltaEvent,
  ToolCall,
  ToolCallDeltaEvent,
  ToolResultEvent,
  UpdateAgentProfileRequestInput,
  UpdateEngineConfigRequestInput,
  UpdateExternalAgentConfigRequestInput,
  UpdatePromptTemplateRequestInput,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export async function loadLLMConfig() {
  const res = await route_get_llm_config();
  if (res200(res)) {
    receiveLLMConfigUpdate(res.data);
  } else {
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to load LLM config",
    });
  }
}

export async function loadLLMApiKeys() {
  const res = await route_get_llm_api_keys();
  if (res200(res)) {
    receiveLLMApiKeysUpdate(res.data);
  } else {
    useAIStore.setState({
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: "Failed to load LLM API keys",
    });
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

export async function loadAgentProfiles() {
  const res = await route_get_agent_profiles();
  if (res200(res)) {
    receiveAgentProfilesUpdate(res.data);
  } else {
    useAIStore.setState({
      agentProfilesInitialLoadComplete: true,
      agentProfilesLoadError: "Failed to load agent profiles",
    });
  }
}

export function receiveAgentProfilesUpdate(payload: Array<AgentProfile>) {
  useAIStore.setState({
    agentProfiles: payload,
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  });
}

export async function loadAgentRuns() {
  const res = await route_get_agent_runs();
  if (res200(res)) {
    receiveAgentRunsUpdate(res.data);
  } else {
    useAIStore.setState({
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
    });
  }
}

function receiveAgentRunsUpdate(payload: Array<AgentRun>) {
  useAIStore.setState({
    agentRuns: payload,
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
  });
}

export async function loadPromptTemplates() {
  const res = await route_get_prompt_templates();
  if (res200(res)) {
    receivePromptTemplatesUpdate(res.data);
  } else {
    useAIStore.setState({
      promptTemplatesInitialLoadComplete: true,
      promptTemplatesLoadError: "Failed to load prompt templates",
    });
  }
}

export function receivePromptTemplatesUpdate(payload: Array<PromptTemplate>) {
  useAIStore.setState({
    promptTemplates: payload,
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  });
}

export async function loadExternalAgentConfigs() {
  const res = await route_get_external_agent_configs();
  if (res200(res)) {
    receiveExternalAgentConfigsUpdate(res.data);
  } else {
    useAIStore.setState({
      externalAgentConfigsInitialLoadComplete: true,
      externalAgentConfigsLoadError: "Failed to load external agent configs",
    });
  }
}

export async function loadExternalAgentHealth() {
  const res = await route_get_external_agent_health();
  if (res200(res)) {
    receiveExternalAgentHealthUpdate(res.data);
  } else {
    useAIStore.setState({
      externalAgentHealthInitialLoadComplete: true,
      externalAgentHealthLoadError: "Failed to load external agent health",
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
  });
  void loadExternalAgentHealth();
}

function receiveExternalAgentHealthUpdate(
  payload: Array<ExternalAgentPreflightStatus>,
) {
  useAIStore.setState({
    externalAgentHealth: payload,
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: null,
  });
}

export async function loadEngineConfigs() {
  const res = await route_get_engine_configs();
  if (res200(res)) {
    receiveEngineConfigsUpdate(res.data);
  } else {
    useAIStore.setState({
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: "Failed to load engine configs",
    });
  }
}

export function receiveEngineConfigsUpdate(payload: Array<EngineConfig>) {
  useAIStore.setState({
    engineConfigs: payload,
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
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

async function createEngineConfig(
  payload: CreateEngineConfigRequestInput,
): Promise<EngineConfig | null> {
  const res = await route_create_engine_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      engineConfigsLoadError: "Failed to create engine config",
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

async function deleteEngineConfig(
  payload: DeleteEngineConfigRequestInput,
): Promise<boolean> {
  const res = await route_delete_engine_config(payload);
  if (!res200(res)) {
    useAIStore.setState({
      engineConfigsLoadError: "Failed to delete engine config",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    engineConfigs: removeById(state.engineConfigs, payload.configId),
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
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

export function initializePendingChatDetails() {
  useAIStore.setState({
    pendingChatDetails: getDefaultChatDetails(),
  });
}

export function clearPendingChatDetails() {
  useAIStore.setState({ pendingChatDetails: null });
}

export async function getLLMChat(chatId: string) {
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  if (res200(res)) {
    const { messages, waitingForResponse, llmConfig } = res.data;
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const nextWaitingForResponse = waitingForResponse
        ? existingDetails?.waitingForResponse ?? true
        : false; // keep false once streaming finishes to avoid stale flips
      const nextMessages = nextWaitingForResponse
        ? mergeChatMessages(existingDetails?.messages ?? [], messages)
        : messages;
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
  }
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
) {
  const res = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  if (res200(res)) {
    const { messages, waitingForResponse, toolCallArguments } = res.data;
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const nextWaitingForResponse = waitingForResponse
        ? existingDetails?.waitingForResponse ?? true
        : false;
      const nextMessages = nextWaitingForResponse
        ? mergeChatMessages(existingDetails?.messages ?? [], messages)
        : messages;
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
  }
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  messageId?: string,
  agentProfileId?: string | null,
): Promise<string | null> {
  if (!message.trim() || !engineConfigId) {
    return null;
  }

  // Add user message immediately for responsive UI
  const userMessage = {
    id: messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content: [createMessageTextContent({ text: message })],
  };
  const userMessageId = userMessage.id;

  applyOptimisticUserMessage(chatId, userMessage);

  try {
    const projectConfigId = getCurrProjectConfigId();
    const res = await route_get_llm_response({
      message: userMessage,
      thinking,
      chatId,
      engineConfigId,
      agentProfileId: agentProfileId ?? null,
      projectConfigId,
    });
    if (res200(res)) {
      const returnedChatId = res.data ?? chatId ?? null;
      if (returnedChatId) {
        if (isExternalEngine) {
          await getExternalAgentChat(returnedChatId, projectConfigId);
        } else {
          await getLLMChat(returnedChatId);
        }
      }
      return returnedChatId;
    }
    rollbackOptimisticUserMessage(chatId, userMessageId);
    return null;
  } catch (err) {
    rollbackOptimisticUserMessage(chatId, userMessageId);
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

export async function findLatestRunningExternalRunId(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  const res = await route_get_agent_runs();
  if (!res200(res)) {
    return null;
  }
  const runs = res.data.filter((run) => {
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

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const { chatId, chunk } = msg;
  const sectionId = msg.sectionId;
  if (sectionId) {
    applyChatSectionStreamDelta(sectionId, chunk);
    if (chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA) {
      applyToolArgumentPreviewDeltaToPreviewStore(chunk);
      return;
    }
    if (chunk.type === StreamingEventTypeEnum.TOOL_RESULT) {
      clearToolArgumentPreviewByToolCallId(
        getCurrProjectConfigId(),
        chunk.result.tool_call_id,
      );
      return;
    }
    if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
      const toolCallIds =
        chunk.message.role === ChatRoleEnum.assistant
          ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
          : [];
      clearToolArgumentPreviewByToolCallIds(
        getCurrProjectConfigId(),
        toolCallIds,
      );
      return;
    }
    return;
  }
  promotePendingChatDetailsIfNeeded(chatId);
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
      handleToolArgumentPreviewDelta(chatId, chunk);
      return;
    case StreamingEventTypeEnum.TOOL_RESULT:
      handleToolResult(chatId, chunk);
      return;
    case StreamingEventTypeEnum.MESSAGE_STOP:
      handleMessageStop(chatId);
      return;
    case StreamingEventTypeEnum.MESSAGE_FINALIZED:
      handleMessageFinalized(chatId, chunk);
      return;
    default:
      return chunk satisfies never;
  }
}

type ChatSectionStreamChunk = LLMStreamingResponse["chunk"];

type RunPayload = Record<string, unknown>;

export function buildChatStateFromAgentRun(run: AgentRun): ChatSectionState {
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

function getRunLastUpdatedMs(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}

function applyChatSectionStreamDelta(
  sectionId: string,
  chunk: ChatSectionStreamChunk,
): void {
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    const nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
    });
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

function handleToolResult(chatId: string, chunk: ToolResultEvent) {
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.result),
    };
  });
  clearToolArgumentPreviewByToolCallId(
    getCurrProjectConfigId(),
    chunk.result.tool_call_id,
  );
}

function handleMessageStop(chatId: string) {
  updateChatDetails(chatId, (details) => ({
    ...details,
    waitingForResponse: false,
  }));
}

function handleMessageFinalized(chatId: string, chunk: MessageFinalizedEvent) {
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
  clearToolArgumentPreviewByToolCallIds(getCurrProjectConfigId(), toolCallIds);
}

function handleToolArgumentPreviewDelta(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
) {
  updateChatDetails(chatId, (details) => applyToolCallDelta(details, chunk));
  applyToolArgumentPreviewDeltaToPreviewStore(chunk);
}

function applyToolArgumentPreviewDeltaToPreviewStore(
  chunk: ToolArgumentPreviewDeltaEvent,
) {
  const projectConfigId = getCurrProjectConfigId();
  useToolArgumentPreview.setState((state) => {
    const previewState =
      state.byProjectConfigId[projectConfigId] ??
      (state.byProjectConfigId[projectConfigId] =
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
      return {};
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
      return {};
    }
    return {
      pendingChatDetails: nextDetails,
    };
  });
}

function mergeChatMessages(
  existing: Array<BaseChatMessageUnion>,
  incoming: Array<BaseChatMessageUnion>,
): Array<BaseChatMessageUnion> {
  if (incoming.length === 0) {
    return [...existing];
  }
  const merged = [...existing];
  const indexById = new Map<string, number>();
  merged.forEach((message, index) => {
    indexById.set(message.id, index);
  });
  for (const message of incoming) {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
    } else {
      merged[existingIndex] = message;
    }
  }
  return merged;
}

function mergeChatDetails(
  existingDetails: ChatDetails,
  pendingDetails: ChatDetails,
): ChatDetails {
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
    waitingForResponse:
      pendingDetails.waitingForResponse || existingDetails.waitingForResponse,
  };
}

function promotePendingChatDetailsIfNeeded(chatId: string) {
  useAIStore.setState((state) => {
    if (state.activeChatId !== null) {
      return {};
    }
    if (!state.pendingChatDetails) {
      return {};
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingDetails = state.pendingChatDetails;
    const mergedDetails = mergeChatDetails(existingDetails, pendingDetails);
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
    const needsActiveUpdate =
      shouldSetActive && state.activeChatId !== chatId;
    if (!pendingDetails && !needsActiveUpdate) {
      return {};
    }
    const nextState: Partial<ReturnType<typeof useAIStore.getState>> = {};
    if (pendingDetails) {
      const existingDetails =
        state.chatDetails[chatId] ?? getDefaultChatDetails();
      nextState.chatDetails = {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(existingDetails, pendingDetails),
      };
      nextState.pendingChatDetails = null;
    }
    if (shouldSetActive) {
      nextState.activeChatId = chatId;
    }
    return nextState;
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
  };
  return {
    messages: [...(chatImpl.messages ?? [])],
    inputText: chatImpl.inputText ?? "",
    waitingForResponse: Boolean(chatImpl.waitingForResponse),
    toolCallArguments: { ...(chatImpl.toolCallArguments ?? {}) },
  };
}

function applyStreamDeltaToChatSectionState(
  state: ChatSectionState,
  chunk: ChatSectionStreamChunk,
): ChatSectionState {
  let messages = [...state.messages];
  let toolCallArguments = { ...state.toolCallArguments };
  let waitingForResponse = state.waitingForResponse;
  const inputText = state.inputText;

  switch (chunk.type) {
    case StreamingEventTypeEnum.MESSAGE_START: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = true;
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
    case StreamingEventTypeEnum.DELTA: {
      messages = applyMessageDeltaToChatMessages(messages, chunk);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
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
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
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
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
    case StreamingEventTypeEnum.TOOL_RESULT: {
      messages = upsertMessage(messages, chunk.result);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_STOP: {
      waitingForResponse = false;
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_FINALIZED: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = false;
      toolCallArguments = {};
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
    default: {
      chunk satisfies never;
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
      };
    }
  }
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
