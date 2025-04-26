import C from "constants/constants.json";
import _ from "lodash";
import {
  dbDeleteLLMChat,
  dbGetAllLLMChatMetadata,
  dbGetLLMChat,
  dbGetLLMResponse,
} from "requests/ai";
import { useAIStore, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { getSectionVariant } from "./sectionInfos";

export async function getLLMChat(chatId) {
  console.log("getLLMChat", chatId);
  const projectConfigId = useSectionInfos.getState().projectConfig.id;
  const res = await dbGetLLMChat(chatId, projectConfigId);
  console.log("res", res);
  if (res.status == 200) {
    const { messages, toolResults, waitingForResponse } = res.data;
    useAIStore.setState((state) => ({
      messages,
      toolResults,
      currentChatId: chatId,
      waitingForResponse: {
        ...state.waitingForResponse,
        [chatId]: waitingForResponse,
      },
    }));
  }
}

export async function createNewLLMChat() {
  useAIStore.setState({
    currentChatId: null,
    messages: [],
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

function resetStreamingResponseState(chatId) {
  useAIStore.setState((state) => ({
    waitingForResponse: { ...state.waitingForResponse, [chatId]: false },
    streamTarget: { ...state.streamTarget, [chatId]: null },
  }));
}

export async function submitMessage(message, deepThink) {
  if (!message.trim()) return;

  // Add user message immediately for responsive UI
  const userMessage = {
    id: createNewId(),
    role: C.LLM_USER_ROLE,
    content: [{ type: C.LLM_TEXT, text: message }],
  };

  useAIStore.setState((state) => ({
    messages: [...state.messages, userMessage],
  }));

  const state = useAIStore.getState();

  try {
    const res = await dbGetLLMResponse(
      state.userSelectedLLM,
      userMessage,
      deepThink,
      state.currentChatId,
    );
    console.log("res", res);
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
    const { streamTarget } = useAIStore.getState();
    if (
      streamTarget[chatId] &&
      chunk.type === C.LLM_CONTENT_BLOCK_DELTA &&
      chunk.delta.type === C.LLM_TEXT_DELTA
    ) {
      streamInto(chatId, streamTarget, chunk.delta.text);
    }

    // Handle different chunk types
    switch (chunk.type) {
      case C.LLM_MESSAGE_START:
        llmMessageStart(chunk);
        return;
      case C.LLM_CONTENT_BLOCK_START:
        llmContentBlockStart(assistantMessageId, chunk);
        return;
      case C.LLM_CONTENT_BLOCK_DELTA:
        llmContentBlockDelta(assistantMessageId, chunk);
        return;
      case C.LLM_CONTENT_BLOCK_STOP:
        llmContentBlockStop(assistantMessageId, chunk);
        return;
      case C.LLM_TOOL_RESULT:
        llmToolResult(chunk);
        return;
      case C.LLM_FULL_MESSAGE_STOP:
        llmFullMessageStop(chatId);
        return;
      case C.LLM_FULL_MESSAGE_STOPPED_BY_USER:
        llmFullMessageStoppedByUser(chatId, chunk);
        return;
    }
  } catch (e) {
    console.error("Error parsing streaming chunk:", e);
  }
}

function llmMessageStart(chunk) {
  useAIStore.setState((state) => ({
    messages: [...state.messages, chunk.message],
  }));
}

function llmContentBlockStart(assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const messageIndex = state.messages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }

    // Create new content array with the updated chunk
    const message = state.messages[messageIndex];
    const newContentArray = [...message.content];
    while (newContentArray.length <= chunk.index) {
      newContentArray.push(null);
    }
    newContentArray[chunk.index] = chunk.content_block;

    // Create updated message
    const updatedMessage = { ...message, content: newContentArray };

    // Create new messages array using spread operations
    const newMessages = [
      ...state.messages.slice(0, messageIndex),
      updatedMessage,
      ...state.messages.slice(messageIndex + 1),
    ];

    return { messages: newMessages };
  });
}

function llmContentBlockDelta(assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const messageIndex = state.messages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }
    const message = state.messages[messageIndex];
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
        currMsgsignature = chunk.delta.signature;
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
      ...state.messages.slice(0, messageIndex),
      updatedMessage,
      ...state.messages.slice(messageIndex + 1),
    ];

    return { messages: newMessages };
  });
}

function llmContentBlockStop(assistantMessageId, chunk) {
  useAIStore.setState((state) => {
    const messageIndex = state.messages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {}; // No changes to state
    }
    const message = state.messages[messageIndex];
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
      ...state.messages.slice(0, messageIndex),
      updatedMessage,
      ...state.messages.slice(messageIndex + 1),
    ];

    return { messages: newMessages };
  });
}

function llmToolResult(chunk) {
  useAIStore.setState((state) => ({
    toolResults: { ...state.toolResults, [chunk.tool_use_id]: chunk },
  }));
}

function llmFullMessageStop(chatId) {
  resetStreamingResponseState(chatId);
}

function llmFullMessageStoppedByUser(chatId, chunk) {
  const { messages, toolResults } = chunk;
  useAIStore.setState({ messages, toolResults });
  resetStreamingResponseState(chatId);
}

function streamInto(chatId, streamTarget, content) {
  const { sectionId, before, after, contentToInsert } = streamTarget[chatId];

  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(sectionId, x);
    // Update current streamed content
    const currentContentToInsert = contentToInsert + content;

    // Reconstruct the code with the updated streamed content in the middle
    sectionVariant.code = [before, currentContentToInsert, after]
      .filter(Boolean)
      .join("\n");

    // Store the updated streamed content for next time
    useAIStore.setState((state) => ({
      streamTarget: {
        ...state.streamTarget,
        [chatId]: {
          sectionId,
          before,
          after,
          contentToInsert: currentContentToInsert,
        },
      },
    }));
  });
}

/**
 * Start streaming text into a specific code block. You can think of a code block like a source code file. After you call this tool, everything you respond with will be redirected and written to this code block. For example, if you start writing Python code, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context, but not in a python code context. If you want to replace code, use the deleteCodeRange tool first. Then use insertAtLine to specify the line number where new code should appear.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 * @param {integer} [insertAtLine] Optional line number (1-indexed) to insert at. If omitted, appends to the end.
 * @return {string} A string containing the current code in the code block before modification.
 */
export function startStreamingInto({ sectionId, insertAtLine, chatId }) {
  console.log("startStreamingInto", sectionId, insertAtLine, chatId)
  // Get the current code
  const currCode = getCurrentCode({ sectionId });
  const lines = currCode.split("\n");
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
    beforeLines = currCode;
    afterLines = "";
  }

  // Set streaming target and store line segments
  useAIStore.setState((state) => ({
    streamTarget: {
      ...state.streamTarget,
      [chatId]: {
        sectionId,
        before: beforeLines,
        after: afterLines,
        contentToInsert: "",
      },
    },
  }));

  return currCode;
}

/**
 * Stop streaming text into the code block.
 * @SETTA_MCP_TOOL
 * @returns {string} the code with all the changes applied.
 */
export function stopStreamingInto({ chatId }) {
  console.log("startStreamingInto", chatId)
  const { streamTarget } = useAIStore.getState();
  const chatStreamTarget = streamTarget[chatId];
  if (!chatStreamTarget) {
    return "";
  }
  const { sectionId } = chatStreamTarget;
  const code = getSectionVariant(sectionId).code;

  // Clear all streaming state
  useAIStore.setState((state) => ({
    streamTarget: { ...state.streamTarget, [chatId]: null },
  }));

  return code;
}

/**
 * Delete a range of code from a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the code with the specified range deleted.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
export function deleteCodeRange({ sectionId, startLine, endLine }) {
  // Update the state
  let updatedCode;
  useSectionInfos.setState((x) => {
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
