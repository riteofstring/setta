import {
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useChatSectionChatIds,
  useProjectState,
  useToolArgumentPreview,
  type ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_llm_chat,
  route_get_all_llm_chat_metadata,
  route_get_llm_api_keys,
  route_get_llm_chat,
  route_get_llm_config,
  route_get_llm_response,
} from "utils/generatedEndpoints";
import {
  AllLLMConfigs,
  APIKeys,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  ChatSectionState,
  createMessageTextContent,
  createMessageThinkingContent,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageImageUrlContent,
  MessageStartEvent,
  MessageTextContent,
  MessageThinkingContent,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  ToolArgumentPreviewDeltaEvent,
  ToolCall,
  ToolCallDeltaEvent,
  ToolResultEvent,
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

type ChatSectionChatId = string | null | undefined;
export type ChatSectionChatIdUpdate =
  | ChatSectionChatId
  | ((current: ChatSectionChatId) => ChatSectionChatId);

export function setChatSectionChatIdLocal(
  sectionId: string,
  next: ChatSectionChatIdUpdate,
): ChatSectionChatId {
  const current = useChatSectionChatIds.getState().bySectionId[sectionId];
  const resolved = typeof next === "function" ? next(current) : next;
  useChatSectionChatIds.setState((state) => ({
    bySectionId: { ...state.bySectionId, [sectionId]: resolved },
  }));
  return resolved;
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
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(existingDetails ?? {}),
            messages,
            waitingForResponse: nextWaitingForResponse,
            llmConfig: llmConfig,
          },
        },
      };
    });
  }
}

export async function getAllLLMChatMetadata() {
  const res = await route_get_all_llm_chat_metadata();
  if (res200(res)) {
    useAIStore.setState({ allChatMetadata: res.data });
  }
}

export async function deleteLLMChat(chatId: string) {
  await route_delete_llm_chat({ chatId });
  await getAllLLMChatMetadata();
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  deepThink: boolean,
  llmConfigId: string,
  messageId?: string,
): Promise<string | null> {
  if (!message.trim()) {
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
      deepThink,
      chatId,
      llmConfigId,
      projectConfigId,
    });
    if (res200(res)) {
      const returnedChatId = res.data ?? chatId ?? null;
      if (returnedChatId) {
        await getLLMChat(returnedChatId);
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
    messages: [...details.messages, chunk.message],
    waitingForResponse: true,
  }));
}

function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  if (!chunk.content || chunk.content.length === 0) {
    return;
  }
  updateChatDetails(chatId, (details) => {
    const { messages, changed } = updateMessageById(
      details.messages,
      chunk.message_id,
      (message) => {
        let mutated = false;
        const newContent = [...message.content];
        for (const delta of chunk.content ?? []) {
          switch (delta.type) {
            case "thinking_delta": {
              const block = ensureThinkingContentBlock(newContent, delta.index);
              const thinkingUpdate = delta.thinking ?? "";
              const signatureUpdate = delta.signature;
              let blockMutated = false;
              if (thinkingUpdate) {
                block.thinking += thinkingUpdate;
                blockMutated = true;
              }
              if (signatureUpdate !== undefined) {
                block.signature = signatureUpdate ?? "";
                blockMutated = true;
              }
              if (blockMutated) {
                mutated = true;
              }
              break;
            }
            case "text_delta": {
              const block = ensureTextContentBlock(newContent, delta.index);
              block.text += delta.text;
              mutated = true;
              break;
            }
            default: {
              delta satisfies never;
              break;
            }
          }
        }
        if (!mutated) {
          return null;
        }
        return { ...message, content: newContent };
      },
    );
    if (!changed) {
      return null;
    }
    return {
      ...details,
      messages,
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
      const signatureUpdate = delta.signature;
      let blockMutated = false;
      if (thinkingUpdate) {
        block.thinking += thinkingUpdate;
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
