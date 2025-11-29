import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { ChatDetails, useAIStore } from "state/definitions";
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
  BaseChatMessageUnion,
  ChatRoleEnum,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageImageUrlContent,
  MessageStartEvent,
  MessageTextContent,
  StreamingEventTypeEnum,
  ToolCall,
  ToolCallDeltaEvent,
  ToolResultEvent,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export async function loadLLMConfig() {
  const res = await route_get_llm_config();
  if (res200(res)) {
    useAIStore.setState({
      allLLMConfigs: res.data,
      llmConfigInitialLoadComplete: true,
      llmConfigLoadError: null,
    });
  } else {
    useAIStore.setState({
      llmConfigInitialLoadComplete: true,
      llmConfigLoadError: "Failed to load LLM config",
    });
  }
}

export async function loadLLMApiKeys(filepath?: string) {
  const state = useAIStore.getState();
  const targetFilepath = filepath ?? state.apiKeysFilepath;
  const res = await route_get_llm_api_keys(targetFilepath);
  if (res200(res)) {
    useAIStore.setState({
      apiKeys: res.data.apiKeys,
      apiKeysFilepath: res.data.filepath,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
  } else {
    useAIStore.setState({
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: "Failed to load LLM API keys",
    });
  }
}

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
  };
}

export async function getLLMChat(chatId: string) {
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  if (res200(res)) {
    const { messages, waitingForResponse, llmConfig } = res.data;
    useAIStore.setState((state) => ({
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(state.chatDetails[chatId] ?? {}),
          messages,
          waitingForResponse,
          llmConfig: llmConfig,
        },
      },
    }));
  }
}

export async function createNewLLMChat() {
  useAIStore.setState({
    viewHistory: false,
  });
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
  deepThink,
  llmConfigId: string,
) {
  if (!message.trim()) return;

  // Add user message immediately for responsive UI
  const userMessage = {
    id: createNewId(),
    role: ChatRoleEnum.user,
    content: createMessageTextContent({ text: message }),
  };

  const res = await route_get_llm_response({
    projectConfigId: getCurrProjectConfigId(),
    message: userMessage,
    deepThink,
    chatId,
    llmConfigId,
  });
  if (res200(res)) {
    const returnedChatId = res.data;
    await getLLMChat(returnedChatId);
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const { chatId, chunk } = msg;
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
          const block = ensureTextContentBlock(newContent, delta.index);
          block.text += delta.text;
          mutated = true;
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
  updateChatDetails(chatId, (details) => {
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
        if (toolCalls.some((entry) => entry.id === chunk.tool_call_id)) {
          return null;
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
  });
}

function handleToolResult(chatId: string, chunk: ToolResultEvent) {
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.result),
    };
  });
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
}

function ensureTextContentBlock(
  content: Array<MessageTextContent | MessageImageUrlContent>,
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

function createToolCallPlaceholder(chunk: ToolCallDeltaEvent): ToolCall {
  return {
    id: chunk.tool_call_id,
    type: "function",
    function: {
      name: "",
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
