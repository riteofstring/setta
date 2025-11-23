import _ from "lodash";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { ChatDetails, useAIStore, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_llm_chat,
  route_get_all_llm_chat_metadata,
  route_get_llm_chat,
  route_get_llm_response,
  route_get_uuid_mapping_for_llm,
} from "utils/generatedEndpoints";
import {
  ChatMessage,
  ChatRoleEnum,
  IDToUUIDForLLM,
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
import { getSectionType, getSectionVariant } from "./sectionInfos";

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolResults: {},
    toolCallArguments: {},
    waitingForResponse: false,
    streamTarget: null,
  };
}

export async function getLLMChat(chatId: string) {
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  if (res200(res)) {
    const { messages, toolResults, waitingForResponse } = res.data;
    useAIStore.setState((state) => ({
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(state.chatDetails[chatId] ?? {}),
          messages,
          toolResults,
          waitingForResponse,
        },
      },
      currentChatId: chatId,
    }));
  } else {
    useAIStore.setState({ currentChatId: null });
  }
}

export async function createNewLLMChat() {
  useAIStore.setState({
    currentChatId: null,
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

export function goToChat(id) {
  useAIStore.setState({ currentChatId: id, viewHistory: false });
}

export async function submitMessage(message: string, deepThink) {
  if (!message.trim()) return;

  // Add user message immediately for responsive UI
  const userMessage = {
    id: createNewId(),
    role: ChatRoleEnum.user,
    content: createMessageTextContent({ text: message }),
  };

  const state = useAIStore.getState();

  const res = await route_get_llm_response({
    projectConfigId: getCurrProjectConfigId(),
    model: state.userSelectedLLM,
    message: userMessage,
    deepThink,
    chatId: state.currentChatId,
  });
  if (res200(res)) {
    const chatId = res.data;
    await getLLMChat(chatId);
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
  updateChatDetails(chatId, (details) => ({
    ...details,
    toolResults: {
      ...(details.toolResults ?? {}),
      [chunk.result.tool_call_id]: chunk.result,
    },
  }));
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
    const idx = details.messages.findIndex(
      (message) => message.id === targetId,
    );
    const nextMessages =
      idx === -1
        ? [...details.messages, chunk.message]
        : [
            ...details.messages.slice(0, idx),
            chunk.message,
            ...details.messages.slice(idx + 1),
          ];
    return {
      ...details,
      messages: nextMessages,
      waitingForResponse: false,
      streamTarget: null,
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

type ChatDetailsState = ChatDetails;

function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetailsState) => ChatDetailsState | null,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetailsState = {
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
  messages: Array<ChatMessage>,
  messageId: string | null,
  updater: (message: ChatMessage) => ChatMessage | null,
): { messages: Array<ChatMessage>; changed: boolean } {
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

function streamInto(chatId, streamTarget, content) {
  const { sectionId, before, after, contentToInsert } = streamTarget;

  let currentContentToInsert;
  useProjectState.setState((x) => {
    const sectionType = getSectionType(sectionId, x);
    const sectionVariant = getSectionVariant(sectionId, x);
    // Update current streamed content
    currentContentToInsert = contentToInsert + content;
    const newContent = [before, currentContentToInsert, after]
      .filter(Boolean)
      .join("\n");

    if (sectionType === UITypeNameEnum.CODE) {
      // Reconstruct the text with the updated streamed content in the middle
      sectionVariant.code = newContent;
    } else if (sectionType === UITypeNameEnum.TEXT_BLOCK) {
      sectionVariant.description = newContent;
    }
  });

  // Store the updated streamed content for next time
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: {
            sectionId,
            before,
            after,
            contentToInsert: currentContentToInsert,
          },
        },
      },
    };
  });
}

export function startStreamingInto({ sectionId, insertAtLine, chatId }) {
  // Get the current code
  let currText;
  const sectionType = getSectionType(sectionId);
  switch (sectionType) {
    case UITypeNameEnum.CODE:
      currText = getSectionVariant(sectionId).code;
      break;
    case UITypeNameEnum.TEXT_BLOCK:
      currText = getSectionVariant(sectionId).description;
      break;
    default:
      throw new Error(
        `Cannot write text into a ${sectionType} section. Section must of type CODE or TEXT_BLOCK`,
      );
  }

  const lines = currText.split("\n");
  const totalLines = lines.length;

  // Initialize streaming state
  let beforeLines = "";
  let afterLines = "";

  // Handle insertAtLine if specified
  if (!_.isNil(insertAtLine)) {
    // Convert to 0-indexed for array operations
    const insertIndex = insertAtLine - 1;

    // Validate insertion point
    if (insertAtLine < 1 || (totalLines > 0 && insertAtLine > totalLines + 1)) {
      throw new Error(
        `Invalid insertAtLine: ${insertAtLine}. Valid range is 1 to ${totalLines + 1}.`,
      );
    }

    // Split the code at the insertion point
    beforeLines = lines.slice(0, insertIndex).join("\n");
    afterLines = lines.slice(insertIndex).join("\n");
  } else {
    // If no insertion point, append to the end
    beforeLines = currText;
    afterLines = "";
  }

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: {
            sectionId,
            before: beforeLines,
            after: afterLines,
            contentToInsert: "",
          },
        },
      },
    };
  });
}

export function stopStreamingInto({ chatId }) {
  const { chatDetails } = useAIStore.getState();
  const chatStreamTarget = chatDetails[chatId]?.streamTarget;
  if (!chatStreamTarget) {
    return "";
  }
  const { sectionId } = chatStreamTarget;
  const code = getSectionVariant(sectionId).code;

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: null,
        },
      },
    };
  });

  return code;
}

export function deleteTextRange({ sectionId, startLine, endLine }) {
  // Update the state
  let updatedCode;
  useProjectState.setState((x) => {
    const sectionVariant = getSectionVariant(sectionId, x);
    if (_.isNil(startLine) && _.isNil(endLine)) {
      updatedCode = "";
    } else {
      const lines = sectionVariant.code.split("\n");
      const totalLines = lines.length;
      const [start, end] = convertAndValidateLineNumbers(
        startLine,
        endLine,
        totalLines,
      );

      // Delete the specified range by keeping everything before start and after end
      const updatedLines = [...lines.slice(0, start), ...lines.slice(end)];

      // Join the lines back together
      updatedCode = updatedLines.join("\n");
    }
    sectionVariant.code = updatedCode;
  });

  return updatedCode;
}

export function getCurrentCode({ sectionId, startLine, endLine }) {
  const code = getSectionVariant(sectionId).code;

  // If no line parameters are provided, return the entire code
  if (_.isNil(startLine) && _.isNil(endLine)) {
    return code;
  }

  const lines = code.split("\n");
  const [start, end] = convertAndValidateLineNumbers(
    startLine,
    endLine,
    lines.length,
  );

  // Extract and return the requested lines
  return lines.slice(start, end).join("\n");
}

// inputs are 1-indexed line numbers
// outputs are standard 0-indexed indices for array operations
function convertAndValidateLineNumbers(startLine, endLine, totalLines) {
  // Handle empty code case (totalLines could be 0)
  if (totalLines === 0) {
    if (!_.isNil(startLine) || !_.isNil(endLine)) {
      throw new Error(`Cannot specify line numbers for empty code.`);
    }
    return [0, 0]; // Safe values for empty arrays
  }

  // Convert to 0-indexed for array access, and provide defaults
  const start = !_.isNil(startLine) ? startLine - 1 : 0;
  const end = !_.isNil(endLine) ? endLine : totalLines;

  // Validate line numbers
  if (start < 0 || start >= totalLines) {
    throw new Error(
      `Invalid startLine: ${startLine}. Valid range is 1 to ${totalLines}.`,
    );
  }

  if (end < 1 || end > totalLines) {
    throw new Error(
      `Invalid endLine: ${endLine}. Valid range is 1 to ${totalLines}.`,
    );
  }

  if (start > end - 1) {
    throw new Error(
      `startLine (${startLine}) must be less than or equal to endLine (${endLine}).`,
    );
  }

  return [start, end];
}

export function updateUUIDMappingForLLM(idToUUIDForLLM: IDToUUIDForLLM) {
  useAIStore.setState({ idToUUIDForLLM });
}

export async function getUUIDMappingForLLM() {
  const res = await route_get_uuid_mapping_for_llm();
  if (res200(res)) {
    updateUUIDMappingForLLM(res.data);
  }
}
