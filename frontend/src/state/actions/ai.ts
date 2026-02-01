import { createAgenticEdgeFromSections } from "state/actions/agenticEdges";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useProjectState,
  useShareSession,
  useToolArgumentPreview,
  type ZustandProjectState,
} from "state/definitions";
import { normalizeToolName, resolveToolCallArguments } from "utils/claudeTools";
import { res200 } from "utils/endpointUtils";
import {
  route_create_agent_profile,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_create_top_level_section,
  route_delete_agent_profile,
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
  route_set_chat_section_state,
  route_set_section_name,
  route_update_agent_profile,
  route_update_engine_config,
  route_update_external_agent_config,
  route_update_prompt_template,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeKindEnum,
  AgentProfile,
  AgentRun,
  AgentRunStatusEnum,
  AllLLMConfigs,
  APIKeys,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ChatSectionState,
  CreateAgentProfileRequestInput,
  CreateExternalAgentConfigRequestInput,
  createMessageTextContent,
  createMessageThinkingContent,
  CreatePromptTemplateRequestInput,
  DeleteAgentProfileRequestInput,
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
  ToolChatMessage,
  ToolResultEvent,
  UpdateAgentProfileRequestInput,
  UpdateEngineConfigRequestInput,
  UpdateExternalAgentConfigRequestInput,
  UpdatePromptTemplateRequestInput,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

type SubAgentSectionInfo = {
  sectionId: string | null;
  parentSectionId: string;
  createdAtMs: number;
};

const SUB_AGENT_TOOL_NAMES = new Set([
  "task",
  "run_agent_profile",
  "subagent",
  "sub_agent",
]);
const subAgentSectionsByCallId = new Map<string, SubAgentSectionInfo>();
const pendingSubAgentResultsByCallId = new Map<string, ToolChatMessage>();

function buildSubAgentKey(projectConfigId: string, toolCallId: string): string {
  return `${projectConfigId}:${toolCallId}`;
}

function normalizeSubAgentToolName(
  name: string | null | undefined,
): string | null {
  const normalized = normalizeToolName(name) ?? name;
  if (!normalized) {
    return null;
  }
  const trimmed = normalized.trim();
  if (!trimmed) {
    return null;
  }
  const tail = trimmed.includes("__")
    ? trimmed.split("__").slice(-1)[0]
    : trimmed;
  const dotTail = tail.includes(".") ? tail.split(".").slice(-1)[0] : tail;
  const lower = dotTail.trim().toLowerCase();
  return lower ? lower : null;
}

function extractStringArg(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) {
    return null;
  }
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }
  }
  return null;
}

function resolveSubAgentProfileId(args: unknown): string | null {
  return (
    extractStringArg(args, ["profileId", "agentProfileId"]) ??
    extractStringArg(isRecord(args) ? args.inputs : null, [
      "profileId",
      "agentProfileId",
    ])
  );
}

function resolveSubAgentLabel(
  toolName: string,
  args: unknown,
  profiles: AgentProfile[],
): string {
  const label =
    extractStringArg(args, [
      "subagent",
      "subAgent",
      "agent",
      "agentName",
      "name",
      "task",
      "description",
      "prompt",
      "query",
      "instructions",
    ]) ??
    extractStringArg(isRecord(args) ? args.inputs : null, [
      "subagent",
      "subAgent",
      "agent",
      "agentName",
      "name",
      "task",
      "description",
      "prompt",
      "query",
      "instructions",
    ]);
  if (label) {
    return label;
  }
  const profileId = resolveSubAgentProfileId(args);
  if (profileId) {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (profile?.name) {
      return profile.name;
    }
    return `Profile ${profileId.slice(0, 8)}`;
  }
  if (toolName === "task") {
    return "Task";
  }
  if (toolName === "run_agent_profile") {
    return "Agent profile";
  }
  return "Sub-agent";
}

function resolveSubAgentPrompt(args: unknown): string | null {
  if (typeof args === "string" && args.trim()) {
    return args.trim();
  }
  return (
    extractStringArg(args, [
      "task",
      "description",
      "prompt",
      "query",
      "instructions",
      "input",
      "message",
      "content",
    ]) ??
    extractStringArg(isRecord(args) ? args.inputs : null, [
      "task",
      "description",
      "prompt",
      "query",
      "instructions",
      "input",
      "message",
      "content",
    ])
  );
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const sliceLength = Math.max(0, maxLength - 3);
  return `${value.slice(0, sliceLength)}...`;
}

function sanitizeSectionName(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-_]+$/g, "")
    .trim();
  return cleaned || fallback;
}

function buildSubAgentMessages(
  toolCall: ToolCall,
  label: string,
  parentLabel: string | null,
): Array<BaseChatMessageUnion> {
  const messages: Array<BaseChatMessageUnion> = [];
  const displayLabel = truncateLabel(label, 120);
  const title = parentLabel
    ? `Sub-agent spawned from ${parentLabel}: ${displayLabel}`
    : `Sub-agent: ${displayLabel}`;
  const prompt = resolveSubAgentPrompt(toolCall.function?.arguments);
  const toolCallCopy: ToolCall = {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: { ...toolCall.function.arguments },
    },
  };
  messages.push({
    id: createNewId(),
    role: ChatRoleEnum.system,
    content: [createMessageTextContent({ text: title })],
  });
  if (prompt) {
    messages.push({
      id: createNewId(),
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: prompt })],
    });
  }
  const assistantMessage: AssistantChatMessage = {
    id: createNewId(),
    role: ChatRoleEnum.assistant,
    content: [],
    tool_calls: [toolCallCopy],
  };
  messages.push(assistantMessage);
  return messages;
}

function buildSubAgentResultMessage(
  toolResult: ToolChatMessage,
): AssistantChatMessage | null {
  const contentItems: MessageTextContent[] = [];
  if (Array.isArray(toolResult.content)) {
    for (const entry of toolResult.content) {
      if (entry.type === "text" && entry.text?.trim()) {
        contentItems.push(createMessageTextContent({ text: entry.text }));
      }
    }
  }
  if (contentItems.length === 0) {
    const rawResult = toolResult.result;
    if (typeof rawResult === "string" && rawResult.trim()) {
      contentItems.push(createMessageTextContent({ text: rawResult }));
    } else if (rawResult !== null && rawResult !== undefined) {
      const serialized = JSON.stringify(rawResult, null, 2);
      const text = serialized ?? String(rawResult);
      if (text.trim()) {
        contentItems.push(createMessageTextContent({ text }));
      }
    }
  }
  if (contentItems.length === 0) {
    return null;
  }
  return {
    id: createNewId(),
    role: ChatRoleEnum.assistant,
    content: contentItems,
    tool_calls: null,
  };
}

async function createSubAgentSection({
  projectConfigId,
  parentSectionId,
  toolCall,
  label,
  agentProfileId,
  toolCallArguments,
}: {
  projectConfigId: string;
  parentSectionId: string;
  toolCall: ToolCall;
  label: string;
  agentProfileId: string | null;
  toolCallArguments: Record<string, string>;
}): Promise<void> {
  console.log(
    "[createSubAgentSection] start",
    JSON.stringify({
      projectConfigId,
      parentSectionId,
      toolCallId: toolCall.id,
      toolCallName: toolCall.function?.name ?? null,
      label,
      agentProfileId,
      toolCallArgumentsKeys: Object.keys(toolCallArguments ?? {}),
    }),
  );
  if (useShareSession.getState().isShareMode) {
    console.log(
      "[createSubAgentSection] share-mode-skip",
      JSON.stringify({ projectConfigId, parentSectionId, toolCallId: toolCall.id }),
    );
    return;
  }
  const state = useProjectState.getState();
  let parentImpl;
  try {
    parentImpl = getCurrEffectiveSectionImplOfType(
      state,
      parentSectionId,
      SectionTypeEnum.Chat,
    );
  } catch {
    console.log(
      "[createSubAgentSection] missing-parent-impl",
      JSON.stringify({ projectConfigId, parentSectionId, toolCallId: toolCall.id }),
    );
    return;
  }
  const parentCore = state.sections[parentSectionId];
  const parentLabel = parentCore?.displayName?.trim()
    ? parentCore.displayName.trim()
    : parentCore?.name ?? null;
  const messages = buildSubAgentMessages(toolCall, label, parentLabel);
  console.log(
    "[createSubAgentSection] create-section",
    JSON.stringify({
      projectConfigId,
      parentSectionId,
      parentLabel,
      toolCallId: toolCall.id,
      messageCount: messages.length,
      engineConfigId: parentImpl.engineConfigId,
      managed: parentImpl.managed,
    }),
  );
  const response = await route_create_top_level_section({
    projectConfigId,
    implType: SectionTypeEnum.Chat,
    implOverrides: {
      type: SectionTypeEnum.Chat,
      managed: parentImpl.managed,
      engineConfigId: parentImpl.engineConfigId,
      agentProfileId: agentProfileId ?? parentImpl.agentProfileId,
      thinking: parentImpl.thinking,
      messages,
      inputText: "",
      waitingForResponse: true,
      toolCallArguments,
    },
  });
  console.log(
    "[createSubAgentSection] create-section-response",
    JSON.stringify({
      projectConfigId,
      parentSectionId,
      toolCallId: toolCall.id,
      ok: res200(response),
      response,
    }),
  );
  if (!res200(response)) {
    const failedKey = buildSubAgentKey(projectConfigId, toolCall.id);
    subAgentSectionsByCallId.delete(failedKey);
    pendingSubAgentResultsByCallId.delete(failedKey);
    return;
  }
  const childSectionId = response.data.sectionId;
  const displayLabel = truncateLabel(label, 48);
  const sectionName = sanitizeSectionName(
    `Sub-agent - ${displayLabel}`,
    "Sub-agent",
  );
  console.log(
    "[createSubAgentSection] created",
    JSON.stringify({
      projectConfigId,
      parentSectionId,
      childSectionId,
      toolCallId: toolCall.id,
      displayLabel,
      sectionName,
    }),
  );
  void route_set_section_name({
    projectConfigId,
    sectionId: childSectionId,
    name: sectionName,
  });
  console.log(
    "[createSubAgentSection] set-name-dispatch",
    JSON.stringify({
      projectConfigId,
      sectionId: childSectionId,
      name: sectionName,
    }),
  );
  createAgenticEdgeFromSections({
    sourceSectionId: parentSectionId,
    targetSectionId: childSectionId,
    kind: AgenticEdgeKindEnum.chat_chat,
  });
  console.log(
    "[createSubAgentSection] edge-created",
    JSON.stringify({
      projectConfigId,
      parentSectionId,
      childSectionId,
      toolCallId: toolCall.id,
    }),
  );
  const key = buildSubAgentKey(projectConfigId, toolCall.id);
  const existing = subAgentSectionsByCallId.get(key);
  if (existing) {
    existing.sectionId = childSectionId;
  } else {
    subAgentSectionsByCallId.set(key, {
      sectionId: childSectionId,
      parentSectionId,
      createdAtMs: Date.now(),
    });
  }
  const pendingResult = pendingSubAgentResultsByCallId.get(key);
  if (pendingResult) {
    console.log(
      "[createSubAgentSection] pending-tool-result",
      JSON.stringify({
        projectConfigId,
        childSectionId,
        toolCallId: toolCall.id,
      }),
    );
    pendingSubAgentResultsByCallId.delete(key);
    appendSubAgentToolResult(childSectionId, pendingResult);
    subAgentSectionsByCallId.delete(key);
  }
}

function appendSubAgentToolResult(
  sectionId: string,
  toolResult: ToolChatMessage,
): void {
  console.log(
    "[appendSubAgentToolResult] start",
    JSON.stringify({
      sectionId,
      toolCallId: toolResult.tool_call_id,
      toolName: toolResult.tool_name ?? null,
      isError: toolResult.is_error,
    }),
  );
  const projectConfigId = getCurrProjectConfigId();
  const state = useProjectState.getState();
  let impl;
  try {
    impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
  } catch {
    console.log(
      "[appendSubAgentToolResult] missing-impl",
      JSON.stringify({ sectionId, toolCallId: toolResult.tool_call_id }),
    );
    return;
  }
  const existingToolResult = impl.messages.find(
    (message) =>
      message.role === ChatRoleEnum.tool &&
      message.tool_call_id === toolResult.tool_call_id,
  );
  if (existingToolResult) {
    console.log(
      "[appendSubAgentToolResult] already-present",
      JSON.stringify({ sectionId, toolCallId: toolResult.tool_call_id }),
    );
    return;
  }
  const resultMessage = buildSubAgentResultMessage(toolResult);
  const nextMessages = resultMessage
    ? [...impl.messages, toolResult, resultMessage]
    : [...impl.messages, toolResult];
  const nextState: ChatSectionState = {
    messages: nextMessages,
    inputText: impl.inputText ?? "",
    waitingForResponse: false,
    toolCallArguments: impl.toolCallArguments ?? {},
  };
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(draft, sectionId, {
        messages: nextMessages,
        inputText: nextState.inputText,
        waitingForResponse: nextState.waitingForResponse,
        toolCallArguments: nextState.toolCallArguments,
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
  console.log(
    "[appendSubAgentToolResult] dispatched",
    JSON.stringify({
      sectionId,
      toolCallId: toolResult.tool_call_id,
      messageCount: nextMessages.length,
    }),
  );
}

function handleSubAgentToolCalls(
  sectionId: string,
  message: MessageFinalizedEvent["message"],
): void {
  if (useShareSession.getState().isShareMode) {
    console.log(
      "[handleSubAgentToolCalls] share-mode-skip",
      JSON.stringify({ sectionId }),
    );
    return;
  }
  if (message.role !== ChatRoleEnum.assistant) {
    console.log(
      "[handleSubAgentToolCalls] non-assistant",
      JSON.stringify({ sectionId, role: message.role }),
    );
    return;
  }
  const toolCalls = message.tool_calls ?? [];
  if (toolCalls.length === 0) {
    console.log(
      "[handleSubAgentToolCalls] no-tool-calls",
      JSON.stringify({ sectionId }),
    );
    return;
  }
  console.log(
    "[handleSubAgentToolCalls] tool-calls",
    JSON.stringify({
      sectionId,
      toolCallIds: toolCalls.map((toolCall) => toolCall.id),
      toolCallNames: toolCalls.map((toolCall) => toolCall.function?.name ?? null),
    }),
  );
  const projectConfigId = getCurrProjectConfigId();
  const state = useProjectState.getState();
  let parentImpl;
  try {
    parentImpl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
  } catch {
    console.log(
      "[handleSubAgentToolCalls] missing-parent-impl",
      JSON.stringify({ sectionId, projectConfigId }),
    );
    return;
  }
  const toolCallArguments = parentImpl.toolCallArguments ?? {};
  const profiles = useAIStore.getState().agentProfiles;
  for (const toolCall of toolCalls) {
    const normalizedName = normalizeSubAgentToolName(toolCall.function?.name);
    if (!normalizedName || !SUB_AGENT_TOOL_NAMES.has(normalizedName)) {
      console.log(
        "[handleSubAgentToolCalls] skip-tool",
        JSON.stringify({
          sectionId,
          toolCallId: toolCall.id,
          toolCallName: toolCall.function?.name ?? null,
          normalizedName,
        }),
      );
      continue;
    }
    const key = buildSubAgentKey(projectConfigId, toolCall.id);
    if (subAgentSectionsByCallId.has(key)) {
      console.log(
        "[handleSubAgentToolCalls] already-tracked",
        JSON.stringify({ sectionId, toolCallId: toolCall.id }),
      );
      continue;
    }
    const args = resolveToolCallArguments(toolCall, toolCallArguments);
    const label = resolveSubAgentLabel(normalizedName, args, profiles);
    const agentProfileId = resolveSubAgentProfileId(args);
    console.log(
      "[handleSubAgentToolCalls] create-sub-agent",
      JSON.stringify({
        sectionId,
        toolCallId: toolCall.id,
        normalizedName,
        label,
        agentProfileId,
        args,
      }),
    );
    const toolCallWithArgs = isRecord(args)
      ? {
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: args,
          },
        }
      : toolCall;
    subAgentSectionsByCallId.set(key, {
      sectionId: null,
      parentSectionId: sectionId,
      createdAtMs: Date.now(),
    });
    void createSubAgentSection({
      projectConfigId,
      parentSectionId: sectionId,
      toolCall: toolCallWithArgs,
      label,
      agentProfileId,
      toolCallArguments: toolCallArguments[toolCall.id]
        ? { [toolCall.id]: toolCallArguments[toolCall.id] }
        : {},
    }).catch((error) => {
      console.warn(
        "[createSubAgentSection] failed",
        JSON.stringify({ error: String(error), sectionId, projectConfigId }),
      );
      subAgentSectionsByCallId.delete(key);
      pendingSubAgentResultsByCallId.delete(key);
    });
  }
}

function handleSubAgentToolResult(toolResult: ToolChatMessage): void {
  const projectConfigId = getCurrProjectConfigId();
  const key = buildSubAgentKey(projectConfigId, toolResult.tool_call_id);
  const info = subAgentSectionsByCallId.get(key);
  if (!info) {
    console.log(
      "[handleSubAgentToolResult] no-section",
      JSON.stringify({
        toolCallId: toolResult.tool_call_id,
        toolName: toolResult.tool_name ?? null,
      }),
    );
    return;
  }
  if (!info.sectionId) {
    console.log(
      "[handleSubAgentToolResult] pending-section",
      JSON.stringify({
        toolCallId: toolResult.tool_call_id,
        parentSectionId: info.parentSectionId,
      }),
    );
    pendingSubAgentResultsByCallId.set(key, toolResult);
    return;
  }
  console.log(
    "[handleSubAgentToolResult] append",
    JSON.stringify({
      toolCallId: toolResult.tool_call_id,
      sectionId: info.sectionId,
    }),
  );
  appendSubAgentToolResult(info.sectionId, toolResult);
  subAgentSectionsByCallId.delete(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
    nextState = mergeChatSectionState(currentState, {
      messages,
      waitingForResponse,
      toolCallArguments,
    });
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      inputText: nextState.inputText,
    });
  });
  return nextState;
}

function mergeChatSectionState(
  currentState: ChatSectionState,
  incoming: {
    messages: Array<BaseChatMessageUnion>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  },
): ChatSectionState {
  const mergedMessages = mergeChatMessages(
    currentState.messages ?? [],
    incoming.messages ?? [],
  );
  return {
    messages: mergedMessages,
    inputText: currentState.inputText ?? "",
    waitingForResponse:
      currentState.waitingForResponse || incoming.waitingForResponse,
    toolCallArguments: {
      ...(currentState.toolCallArguments ?? {}),
      ...(incoming.toolCallArguments ?? {}),
    },
  };
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<void> {
  const projectConfigId = getCurrProjectConfigId();
  console.log(
    "[getLLMChat] request",
    JSON.stringify({ chatId, projectConfigId, sectionId: sectionId ?? null }),
  );
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  console.log("[getLLMChat] response", JSON.stringify(res));
  if (res200(res)) {
    const { messages, waitingForResponse, llmConfig } = res.data;
    console.log(
      "[getLLMChat] apply",
      JSON.stringify({
        chatId,
        messageCount: messages.length,
        waitingForResponse,
        llmConfigId: llmConfig.id,
      }),
    );
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const nextWaitingForResponse = waitingForResponse
        ? existingDetails?.waitingForResponse ?? true
        : false; // keep false once streaming finishes to avoid stale flips
      const nextMessages = mergeChatMessages(
        existingDetails?.messages ?? [],
        messages,
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
        sectionId,
        nextState,
        reason: "hydrate-llm-chat",
      });
    }
  }
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<void> {
  console.log(
    "[getExternalAgentChat] request",
    JSON.stringify({ chatId, projectConfigId, sectionId: sectionId ?? null }),
  );
  const res = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  console.log("[getExternalAgentChat] response", JSON.stringify(res));
  if (res200(res)) {
    const { messages, waitingForResponse, toolCallArguments } = res.data;
    console.log(
      "[getExternalAgentChat] apply",
      JSON.stringify({
        chatId,
        messageCount: messages.length,
        waitingForResponse,
        toolCallArgumentsCount: Object.keys(toolCallArguments ?? {}).length,
      }),
    );
    useAIStore.setState((state) => {
      const existingDetails = state.chatDetails[chatId];
      const nextWaitingForResponse = waitingForResponse
        ? existingDetails?.waitingForResponse ?? true
        : false;
      const nextMessages = mergeChatMessages(
        existingDetails?.messages ?? [],
        messages,
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
      persistChatSectionState({
        sectionId,
        nextState,
        reason: "hydrate-external-chat",
      });
    }
  }
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  messageId?: string,
  agentProfileId?: string | null,
  sectionId?: string | null,
): Promise<string | null> {
  const trimmed = message.trim();
  console.log(
    "[submitMessage] start",
    JSON.stringify({
      chatId,
      hasText: Boolean(trimmed),
      messageLength: message.length,
      attachmentsCount: attachments.length,
      thinking,
      engineConfigId,
      isExternalEngine,
      messageId: messageId ?? null,
      agentProfileId: agentProfileId ?? null,
      sectionId: sectionId ?? null,
    }),
  );
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    console.log(
      "[submitMessage] early-exit",
      JSON.stringify({
        reason:
          !engineConfigId
            ? "missing-engine-config"
            : "empty-message-and-attachments",
        chatId,
        attachmentsCount: attachments.length,
      }),
    );
    return null;
  }

  // Add user message immediately for responsive UI
  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const userMessage = {
    id: messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
  };
  const userMessageId = userMessage.id;

  console.log(
    "[submitMessage] optimistic-user-message",
    JSON.stringify({
      chatId,
      userMessageId,
      contentCount: content.length,
      attachmentsCount: attachments.length,
    }),
  );
  applyOptimisticUserMessage(chatId, userMessage);

  try {
    const projectConfigId = getCurrProjectConfigId();
    console.log(
      "[submitMessage] route_get_llm_response request",
      JSON.stringify({
        chatId,
        projectConfigId,
        sectionId: sectionId ?? null,
        engineConfigId,
        thinking,
        agentProfileId: agentProfileId ?? null,
        userMessageId,
        attachmentsCount: attachments.length,
        contentCount: content.length,
        isExternalEngine,
      }),
    );
    const res = await route_get_llm_response({
      message: userMessage,
      thinking,
      chatId,
      engineConfigId,
      agentProfileId: agentProfileId ?? null,
      projectConfigId,
      sectionId: sectionId ?? null,
    });
    console.log(
      "[submitMessage] route_get_llm_response response",
      JSON.stringify(res),
    );
    if (res200(res)) {
      const returnedChatId = res.data ?? chatId ?? null;
      console.log(
        "[submitMessage] route_get_llm_response ok",
        JSON.stringify({
          returnedChatId,
          wasExternal: isExternalEngine,
          projectConfigId,
        }),
      );
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
      }
      return returnedChatId;
    }
    rollbackOptimisticUserMessage(chatId, userMessageId);
    console.log(
      "[submitMessage] route_get_llm_response rejected",
      JSON.stringify({
        chatId,
        userMessageId,
      }),
    );
    return null;
  } catch (err) {
    rollbackOptimisticUserMessage(chatId, userMessageId);
    console.error(
      "[submitMessage] exception",
      JSON.stringify({
        chatId,
        userMessageId,
        error: String(err),
      }),
    );
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

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const { chatId, chunk } = msg;
  const sectionId = msg.sectionId;
  console.log(
    "[receiveLLMResponseChunk] incoming",
    JSON.stringify({ chatId, sectionId, chunk }),
  );
  if (shouldIgnoreResponsePlaceholderChunk(chunk)) {
    console.log(
      "[receiveLLMResponseChunk] ignored-placeholder",
      JSON.stringify({ chatId, sectionId, chunkType: chunk.type }),
    );
    return;
  }
  if (sectionId) {
    const nextState = applyChatSectionStreamDelta(sectionId, chunk);
    if (
      chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED ||
      chunk.type === StreamingEventTypeEnum.TOOL_RESULT
    ) {
      persistChatSectionState({
        sectionId,
        nextState,
        reason: chunk.type,
      });
    }
    if (chunk.type === StreamingEventTypeEnum.TOOL_RESULT) {
      handleSubAgentToolResult(chunk.result);
    }
    if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
      handleSubAgentToolCalls(sectionId, chunk.message);
    }
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
  if (!chatId) {
    return;
  }
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
): ChatSectionState | null {
  console.log(
    "[applyChatSectionStreamDelta] incoming",
    JSON.stringify({ sectionId, chunk }),
  );
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      console.log(
        "[applyChatSectionStreamDelta] missing-state",
        JSON.stringify({ sectionId, chunkType: chunk.type }),
      );
      return;
    }
    nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
    });
  });
  return nextState;
}

export function persistChatSectionState({
  sectionId,
  nextState,
  reason,
}: {
  sectionId: string;
  nextState: ChatSectionState | null;
  reason: string;
}): void {
  if (!nextState) {
    console.log(
      "[persistChatSectionState] missing-state",
      JSON.stringify({ sectionId, reason }),
    );
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  console.log(
    "[persistChatSectionState] send",
    JSON.stringify({
      sectionId,
      reason,
      messageCount: nextState.messages.length,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArgumentsCount: Object.keys(nextState.toolCallArguments).length,
    }),
  );
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        messages: nextState.messages,
        inputText: nextState.inputText,
        waitingForResponse: nextState.waitingForResponse,
        toolCallArguments: nextState.toolCallArguments,
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
  if (existing.length === 0) {
    return [...incoming];
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
      continue;
    }
    merged[existingIndex] = pickMoreCompleteMessage(
      merged[existingIndex],
      message,
    );
  }
  return merged;
}

function pickMoreCompleteMessage(
  existing: BaseChatMessageUnion,
  incoming: BaseChatMessageUnion,
): BaseChatMessageUnion {
  if (existing.role !== incoming.role) {
    return incoming;
  }
  const existingScore = getMessageCompletenessScore(existing);
  const incomingScore = getMessageCompletenessScore(incoming);
  if (incomingScore > existingScore) {
    return incoming;
  }
  if (existingScore > incomingScore) {
    return existing;
  }
  return incoming;
}

function getMessageCompletenessScore(message: BaseChatMessageUnion): number {
  let score = 0;
  if (message.role === ChatRoleEnum.assistant) {
    score = getAssistantMessageScore(message);
  } else if (message.role === ChatRoleEnum.tool) {
    score = getToolMessageScore(message);
  } else {
    score = getContentScore(message.content);
  }
  return score + getAttachmentScore(message);
}

function getAssistantMessageScore(message: AssistantChatMessage): number {
  let score = getContentScore(message.content);
  const toolCalls = message.tool_calls ?? [];
  score += toolCalls.length * 5;
  for (const toolCall of toolCalls) {
    if (toolCall.function?.name) {
      score += toolCall.function.name.length;
    }
    if (toolCall.function?.arguments) {
      score += getPayloadSize(toolCall.function.arguments);
    }
  }
  return score;
}

function getAttachmentScore(message: BaseChatMessageUnion): number {
  if (!("attachments" in message)) {
    return 0;
  }
  const attachments = message.attachments;
  if (!Array.isArray(attachments)) {
    return 0;
  }
  return attachments.length * 8;
}

function getToolMessageScore(message: ToolChatMessage): number {
  let score = 0;
  score += getPayloadSize(message.arguments);
  score += getPayloadSize(message.result);
  if (message.completed_at) {
    score += 5;
  }
  if (Array.isArray(message.content)) {
    score += message.content.length * 4;
    for (const entry of message.content) {
      if (entry.type === "text") {
        score += entry.text.length;
        continue;
      }
      if (entry.type === "resource") {
        if ("text" in entry.resource) {
          score += entry.resource.text.length;
        } else {
          score += 4;
        }
        continue;
      }
      score += 2;
    }
  }
  return score;
}

function getContentScore(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
): number {
  let score = 0;
  for (const item of content) {
    if (item.type === "text") {
      score += item.text.length;
      continue;
    }
    if (item.type === "thinking") {
      score += item.thinking.length;
      score += item.summary?.length ?? 0;
      score += item.signature?.length ?? 0;
      continue;
    }
    if (item.type === "image_url") {
      score += 8;
    }
  }
  return score;
}

function getPayloadSize(payload: unknown): number {
  if (payload === null || payload === undefined) {
    return 0;
  }
  if (typeof payload === "string") {
    return payload.length;
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return 4;
  }
  if (Array.isArray(payload)) {
    return payload.length * 4;
  }
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
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
    const needsActiveUpdate = shouldSetActive && state.activeChatId !== chatId;
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
