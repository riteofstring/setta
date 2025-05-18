import C from "constants/constants.json";
import _ from "lodash";
import {
  dbDeleteLLMChat,
  dbGetAllLLMChatMetadata,
  dbGetLLMChat,
  dbGetLLMResponse,
  dbGetUUIDMappingForLLM,
} from "requests/ai";
import { useAIStore, useProjectState } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { getSectionType, getSectionVariant } from "./sectionInfos";

export function getDefaultChatDetails() {
  return {
    messages: [],
    toolResults: {},
    waitingForResponse: false,
    streamTarget: null,
  };
}

export async function getLLMChat(chatId) {
  const projectConfigId = useProjectState.getState().projectConfig.id;
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
  useProjectState.setState((x) => {
    const sectionType = getSectionType(sectionId, x);
    const sectionVariant = getSectionVariant(sectionId, x);
    // Update current streamed content
    currentContentToInsert = contentToInsert + content;
    const newContent = [before, currentContentToInsert, after]
      .filter(Boolean)
      .join("\n");

    if (sectionType === C.CODE) {
      // Reconstruct the text with the updated streamed content in the middle
      sectionVariant.code = newContent;
    } else if (sectionType === C.TEXT_BLOCK) {
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

/**
 * Start streaming text into a section. Text can be streamed into sections of type CODE and TEXT_BLOCK. After you call this tool, everything you respond with will be redirected and written to this section. For example, if you start writing code into a CODE section, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context or a TEXT_BLOCK section, but not in a CODE section. If you want to replace code, use the deleteCodeRange tool first. Then use insertAtLine to specify the line number where new code should appear.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section that you want to start writing into.
 * @param {integer} [insertAtLine] Optional line number (1-indexed) to insert at. If omitted, appends to the end.
 */
export function startStreamingInto({ sectionId, insertAtLine, chatId }) {
  // Get the current code
  let currText;
  const sectionType = getSectionType(sectionId);
  switch (sectionType) {
    case C.CODE:
      currText = getSectionVariant(sectionId).code;
      break;
    case C.TEXT_BLOCK:
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

/**
 * Stop streaming text into a section.
 * @SETTA_MCP_TOOL
 * @returns {string} the seciton's text with all the changes applied.
 */
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

/**
 * Delete a range of text from a CODE or TEXT_BLOCK section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the text with the specified range deleted.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
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

/**
 * Get the current code that's in a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to retrieve code from.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the requested code from the code block.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
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

export function updateUUIDMappingForLLM(idToUUIDForLLM) {
  useAIStore.setState({ idToUUIDForLLM });
}

export async function getUUIDMappingForLLM() {
  const res = await dbGetUUIDMappingForLLM();
  if (res.status === 200) {
    updateUUIDMappingForLLM(res.data);
  }
}
