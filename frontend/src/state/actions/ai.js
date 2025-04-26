import C from "constants/constants.json";
import _ from "lodash";
import {
  dbDeleteLLMChat,
  dbGetAllLLMChatMetadata,
  dbGetLLMChat,
  dbGetLLMResponse,
  dbGetUUIDMappingForLLM,
} from "requests/ai";
import { useAIStore, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { getSectionVariant } from "./sectionInfos";

export function getDefaultChatDetails() {
  return {
    messages: [],
    toolResults: {},
    waitingForResponse: false,
    streamTarget: null,
  };
}

export async function getLLMChat(chatId) {
  const projectConfigId = useSectionInfos.getState().projectConfig.id;
  const res = await dbGetLLMChat(chatId, projectConfigId);
  if (res.status == 200) {
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
  }
}

export async function createNewLLMChat() {
  useAIStore.setState({
    currentChatId: null,
    viewHistory: false,
  });
}

export async function getAllLLMChatMetadata() {
  const res = await dbGetAllLLMChatMetadata();
  if (res.status == 200) {
    useAIStore.setState({ allChatMetadata: res.data });
  }
}

export async function deleteLLMChat(chatId) {
  await dbDeleteLLMChat(chatId);
  await getAllLLMChatMetadata();
}

export function goToChat(id) {
  useAIStore.setState({ currentChatId: id, viewHistory: false });
}

export async function submitMessage(message, deepThink) {
  if (!message.trim()) return;

  // Add user message immediately for responsive UI
  const userMessage = {
    id: createNewId(),
    role: C.LLM_USER_ROLE,
    content: [{ type: C.LLM_TEXT, text: message }],
  };

  const state = useAIStore.getState();

  try {
    const res = await dbGetLLMResponse(
      state.userSelectedLLM,
      userMessage,
      deepThink,
      state.currentChatId,
    );
    if (res.status == 200) {
      const chatId = res.data;
      await getLLMChat(chatId);
    }
  } catch (error) {
    // Error handling
    const errorMsg = {
      role: C.LLM_ASSISTANT_ROLE,
      content: `Sorry, there was a problem with the API: ${error.message || "Unknown error"}.`,
    };
    // TODO: show error message in chat area
    console.error(errorMsg);
  }
}

export function receiveLLMResponseChunk(msg) {
  try {
    const { chatId, assistantMessageId, chunk } = msg;
    const { chatDetails } = useAIStore.getState();
    if (
      chatDetails[chatId]?.streamTarget &&
      chunk.type === C.LLM_CONTENT_BLOCK_DELTA &&
      chunk.delta.type === C.LLM_TEXT_DELTA
    ) {
      streamInto(chatId, chatDetails[chatId].streamTarget, chunk.delta.text);
    }

    // Handle different chunk types
    switch (chunk.type) {
      case C.LLM_MESSAGE_START:
        llmMessageStart(chatId, chunk);
        return;
      case C.LLM_CONTENT_BLOCK_START:
        llmContentBlockStart(chatId, assistantMessageId, chunk);
        return;
      case C.LLM_CONTENT_BLOCK_DELTA:
        llmContentBlockDelta(chatId, assistantMessageId, chunk);
        return;
      case C.LLM_CONTENT_BLOCK_STOP:
        llmContentBlockStop(chatId, assistantMessageId, chunk);
        return;
      case C.LLM_TOOL_RESULT:
        llmToolResult(chatId, chunk);
        return;
      case C.LLM_FULL_MESSAGE_STOP:
        llmFullMessageStop(chatId, chunk);
        return;
    }
  } catch (e) {
    console.error("Error parsing streaming chunk:", e);
  }
}

function llmMessageStart(chatId, chunk) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: [...(currDetails?.messages ?? []), chunk.message],
        },
      },
    };
  });
}

function llmContentBlockStart(chatId, assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    const messageIndex = currMessages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }

    // Create new content array with the updated chunk
    const message = currMessages[messageIndex];
    const newContentArray = [...message.content];
    while (newContentArray.length <= chunk.index) {
      newContentArray.push(null);
    }
    newContentArray[chunk.index] = chunk.content_block;

    // Create updated message
    const updatedMessage = { ...message, content: newContentArray };

    // Create new messages array using spread operations
    const newMessages = [
      ...currMessages.slice(0, messageIndex),
      updatedMessage,
      ...currMessages.slice(messageIndex + 1),
    ];

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
        },
      },
    };
  });
}

function llmContentBlockDelta(chatId, assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    const messageIndex = currMessages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }
    const message = currMessages[messageIndex];
    const newContentArray = [...message.content];
    const currMsg = newContentArray[chunk.index];
    let updated = true;
    switch (chunk.delta.type) {
      case C.LLM_TEXT_DELTA:
        currMsg.text += chunk.delta.text;
        break;
      case C.LLM_THINKING_DELTA:
        currMsg.thinking += chunk.delta.thinking;
        break;
      case C.LLM_SIGNATURE_DELTA:
        currMsg.signature = chunk.delta.signature;
        break;
      case C.LLM_INPUT_JSON_DELTA:
        if (typeof currMsg.input !== "string") {
          currMsg.input = "";
        }
        currMsg.input += chunk.delta.partial_json;
        break;
      default:
        updated = false;
    }

    if (!updated) {
      return {};
    }

    // Create updated message
    const updatedMessage = { ...message, content: newContentArray };

    // Create new messages array using spread operations
    const newMessages = [
      ...currMessages.slice(0, messageIndex),
      updatedMessage,
      ...currMessages.slice(messageIndex + 1),
    ];

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
        },
      },
    };
  });
}

function llmContentBlockStop(chatId, assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    const messageIndex = currMessages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }
    const message = currMessages[messageIndex];
    const newContentArray = [...message.content];
    const currMsg = newContentArray[chunk.index];
    if (currMsg.type === C.LLM_TOOL_USE) {
      if (currMsg.input) {
        currMsg.input = JSON.parse(currMsg.input);
      } else {
        currMsg.input = {};
      }
    } else {
      return {};
    }

    // Create updated message
    const updatedMessage = { ...message, content: newContentArray };

    // Create new messages array using spread operations
    const newMessages = [
      ...currMessages.slice(0, messageIndex),
      updatedMessage,
      ...currMessages.slice(messageIndex + 1),
    ];

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
        },
      },
    };
  });
}

function llmToolResult(chatId, chunk) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          toolResults: {
            ...(currDetails?.toolResults ?? {}),
            [chunk.tool_use_id]: chunk,
          },
        },
      },
    };
  });
}

function llmFullMessageStop(chatId, chunk) {
  const { messages, toolResults } = chunk;
  console.log("messages", messages);
  useAIStore.setState((state) => {
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          messages,
          toolResults,
          waitingForResponse: false,
          streamTarget: null,
        },
      },
    };
  });
}

function streamInto(chatId, streamTarget, content) {
  const { sectionId, before, after, contentToInsert } = streamTarget;

  let currentContentToInsert;
  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(sectionId, x);
    // Update current streamed content
    currentContentToInsert = contentToInsert + content;

    // Reconstruct the code with the updated streamed content in the middle
    sectionVariant.code = [before, currentContentToInsert, after]
      .filter(Boolean)
      .join("\n");
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

export function updateUUIDMappingForLLM(idToUUIDForLLM) {
  console.log("updateUUIDMappingForLLM", idToUUIDForLLM);
  useAIStore.setState({ idToUUIDForLLM });
}

export async function getUUIDMappingForLLM() {
  const res = await dbGetUUIDMappingForLLM();
  console.log("getUUIDMappingForLLM", res);
  if (res.status === 200) {
    updateUUIDMappingForLLM(res.data);
  }
}
