import _ from "lodash";
import { dbGetLLMResponse } from "requests/ai";
import { useAIStore, useSectionInfos } from "state/definitions";
import { getSectionVariant } from "./sectionInfos";

export function updateChatSession(id, newMessages) {
  if (!id) return;

  const { chatSessions } = useAIStore.getState();
  const existingIndex = chatSessions.findIndex((s) => s.id === id);

  // Create session update object
  const sessionUpdate = {
    id,
    messages: newMessages,
    lastUpdated: Date.now(),
    title: newMessages[0]?.content.substring(0, 30) || "New Chat",
  };

  // Clean direct updates with guard clauses
  if (existingIndex === -1) {
    // Add new session
    useAIStore.setState({ chatSessions: [...chatSessions, sessionUpdate] });
    return;
  }

  // Update existing session
  const updatedSessions = [...chatSessions];
  updatedSessions[existingIndex] = sessionUpdate;
  useAIStore.setState({ chatSessions: updatedSessions });
}

export function createNewChat() {
  const { messages, sessionId } = useAIStore.getState();

  // Save current chat only if it has content
  if (sessionId && messages.length > 0) {
    updateChatSession(sessionId, messages);
  }

  // Simple clean creation of new session
  const newSessionId = `session_${Date.now()}`;
  useAIStore.setState({
    sessionId: newSessionId,
    messages: [],
    viewHistory: false,
  });
}

export function switchToChat(id) {
  const { sessionId, messages, chatSessions } = useAIStore.getState();

  // Guard clause: already on this chat
  if (id === sessionId) {
    useAIStore.setState({ viewHistory: false });
    return;
  }

  // Save current chat if it has messages
  if (sessionId && messages.length > 0) {
    updateChatSession(sessionId, messages);
  }

  // Find requested chat
  const selectedChat = chatSessions.find((session) => session.id === id);

  // Guard clause: chat not found
  if (!selectedChat) return;

  // Switch to selected chat
  useAIStore.setState({
    sessionId: id,
    messages: selectedChat.messages,
    viewHistory: false,
  });
}

export function addMessageToChat(message, useSessionId = null) {
  const { messages, sessionId } = useAIStore.getState();
  const newMessages = [...messages, message];

  useAIStore.setState({ messages: newMessages });
  updateChatSession(useSessionId || sessionId, newMessages);

  return newMessages;
}

function resetStreamingResponseState() {
  useAIStore.setState({
    isLoading: false,
    streamTarget: null,
    streamTargetStartIdx: -1,
    currentBlockType: null,
    currentBlockIndex: null,
    currentJsonContent: "",
    currentToolName: "",
    currentAssistantMsgId: null,
  });
}

export async function submitMessage(userMessage, deepThink) {
  // Guard clause: empty message
  if (!userMessage.trim()) return;

  const { messages, sessionId, userSelectedLLM } = useAIStore.getState();

  useAIStore.setState({ isLoading: true });

  // Add user message immediately for responsive UI
  const userMsg = { role: "user", content: userMessage };
  const updatedMessages = [...messages, userMsg];
  useAIStore.setState({ messages: updatedMessages });

  // Create a placeholder for the assistant's message
  const assistantMsgId = Date.now().toString();
  const assistantMsg = {
    role: "assistant",
    content: "",
    id: assistantMsgId,
    streamSequence: [], // Ordered sequence of content chunks and tool interactions
  };

  useAIStore.setState({ currentAssistantMsgId: assistantMsgId });

  // Add empty assistant message that will be updated
  addMessageToChat(assistantMsg);

  try {
    dbGetLLMResponse(userSelectedLLM, userMessage, deepThink, sessionId);
  } catch (error) {
    // Error handling
    const errorMsg = {
      role: "assistant",
      content: `Sorry, there was a problem with the API: ${error.message || "Unknown error"}.`,
    };
    addMessageToChat(errorMsg);
    resetStreamingResponseState();
  }
}

export function receiveLLMResponseChunk(chunk) {
  try {
    // Get current state
    const currentState = useAIStore.getState();
    const currentMessages = currentState.messages;
    let {
      currentBlockType,
      currentBlockIndex,
      currentJsonContent,
      currentToolName,
      currentAssistantMsgId,
      sessionId,
    } = currentState;

    // Find the message we're updating
    const messageIndex = currentMessages.findIndex(
      (m) => m.id === currentAssistantMsgId,
    );
    if (messageIndex === -1) return;

    const updatedMessages = [...currentMessages];
    const currentMsg = { ...updatedMessages[messageIndex] };
    let endOfMessage = false;

    // Handle different chunk types
    switch (chunk.type) {
      case "content_block_start":
        // Track new content block start
        currentBlockType = chunk.block_type;
        currentBlockIndex = chunk.index;

        // If it's a tool_use block, prepare for JSON building
        if (currentBlockType === "tool_use") {
          currentJsonContent = "";

          // Use the tool_name from the event if available
          if (chunk.tool_name) {
            currentToolName = chunk.tool_name;
          } else {
            currentToolName = ""; // Fallback to known default
          }

          // Create a tool call entry immediately with the known name
          currentMsg.streamSequence.push({
            type: "tool_call",
            name: currentToolName,
            args: {},
            streaming: true,
            jsonSoFar: "",
          });
        }
        break;

      case "text":
        if (chunk.is_delta) {
          const { streamTarget } = useAIStore.getState();
          if (streamTarget) {
            streamInto(streamTarget, chunk.content);
            break;
          }

          // For text deltas, either add to existing content or create a new text chunk
          if (
            currentMsg.streamSequence.length > 0 &&
            currentMsg.streamSequence[currentMsg.streamSequence.length - 1]
              .type === "text"
          ) {
            // Add to existing text chunk
            const lastItem =
              currentMsg.streamSequence[currentMsg.streamSequence.length - 1];
            lastItem.content += chunk.content;
          } else {
            // Create a new text chunk
            currentMsg.streamSequence.push({
              type: "text",
              content: chunk.content,
            });
          }

          // Also update the main content for backward compatibility
          currentMsg.content += chunk.content;
        }
        break;

      case "thinking":
        if (chunk.is_delta) {
          // For thinking deltas, either add to existing content or create a new text chunk
          if (
            currentMsg.streamSequence.length > 0 &&
            currentMsg.streamSequence[currentMsg.streamSequence.length - 1]
              .type === "thinking"
          ) {
            // Add to existing text chunk
            const lastItem =
              currentMsg.streamSequence[currentMsg.streamSequence.length - 1];
            lastItem.content += chunk.content;
          } else {
            // Create a new text chunk
            currentMsg.streamSequence.push({
              type: "thinking",
              content: chunk.content,
            });
          }

          // Also update the main content for backward compatibility
          currentMsg.content += chunk.content;
        }
        break;

      case "json":
        if (chunk.is_delta && currentBlockType === "tool_use") {
          // Build up JSON content for the tool call
          currentJsonContent += chunk.content;

          // Find or update the tool call in the sequence
          let toolCallIndex = currentMsg.streamSequence.findIndex(
            (item) => item.type === "tool_call" && item.streaming === true,
          );

          if (toolCallIndex === -1) {
            // Create a new tool call entry without trying to parse the JSON yet
            currentMsg.streamSequence.push({
              type: "tool_call",
              name: currentToolName || "Loading...",
              args: {}, // Empty args until we have complete JSON
              streaming: true,
              jsonSoFar: currentJsonContent,
            });
          } else {
            // Update existing tool call - just store the raw JSON content for now
            currentMsg.streamSequence[toolCallIndex].jsonSoFar =
              currentJsonContent;
          }
        }
        break;

      case "content_block_stop":
        // Finalize a content block
        if (
          currentBlockType === "tool_use" &&
          chunk.index === currentBlockIndex
        ) {
          // Finalize the tool call JSON
          try {
            // Only try to parse the JSON if it's not empty
            if (currentJsonContent && currentJsonContent.trim() !== "") {
              try {
                const jsonObj = JSON.parse(currentJsonContent);

                // Find the streaming tool call
                let toolCallIndex = currentMsg.streamSequence.findIndex(
                  (item) =>
                    item.type === "tool_call" && item.streaming === true,
                );

                if (toolCallIndex !== -1) {
                  // Mark as no longer streaming and update with parsed JSON
                  currentMsg.streamSequence[toolCallIndex] = {
                    ...currentMsg.streamSequence[toolCallIndex],
                    streaming: false,
                    name:
                      jsonObj.name ||
                      currentMsg.streamSequence[toolCallIndex].name,
                    args: jsonObj,
                    jsonSoFar: null, // Clean up the partial JSON
                  };
                }
              } catch (e) {
                console.error("Error finalizing tool call JSON:", e);

                // Even if parsing fails, we should still mark the tool call as complete
                let toolCallIndex = currentMsg.streamSequence.findIndex(
                  (item) =>
                    item.type === "tool_call" && item.streaming === true,
                );

                if (toolCallIndex !== -1) {
                  currentMsg.streamSequence[toolCallIndex].streaming = false;
                }
              }
            } else {
              // For empty JSON, just mark any streaming tool call as complete
              let toolCallIndex = currentMsg.streamSequence.findIndex(
                (item) => item.type === "tool_call" && item.streaming === true,
              );

              if (toolCallIndex !== -1) {
                currentMsg.streamSequence[toolCallIndex].streaming = false;
              }
            }
          } catch (e) {
            console.error("Error in block_end handling:", e);
          }

          // Reset for the next block
          currentBlockType = null;
          currentJsonContent = "";
        }
        break;

      case "tool_result":
        // Add tool result to the sequence
        currentMsg.streamSequence.push({
          type: "tool_result",
          content: chunk.content,
        });
        break;

      case "message_stop":
        endOfMessage = true;
        break;
    }

    if (endOfMessage) {
      resetStreamingResponseState();
    } else {
      updatedMessages[messageIndex] = currentMsg;
      useAIStore.setState({
        messages: updatedMessages,
        currentBlockType,
        currentBlockIndex,
        currentJsonContent,
        currentToolName,
      });

      // Also update the chat session
      updateChatSession(sessionId, updatedMessages);
    }
  } catch (e) {
    console.error("Error parsing streaming chunk:", e);
  }
}

function streamInto(streamTarget, content) {
  const aiState = useAIStore.getState();

  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(streamTarget, x);
    // Get our cached line segments and current streamed content
    const beforeLines = aiState.streamBeforeLines;
    const afterLines = aiState.streamAfterLines;

    // Update current streamed content
    const currentStreamedContent = aiState.streamedContent + content;

    // Reconstruct the code with the updated streamed content in the middle
    sectionVariant.code = [beforeLines, currentStreamedContent, afterLines]
      .filter(Boolean)
      .join("\n");

    // Store the updated streamed content for next time
    useAIStore.setState({
      streamedContent: currentStreamedContent,
    });
  });
}

/**
 * Start streaming text into a specific code block. You can think of a code block like a source code file. After you call this tool, everything you respond with will be redirected and written to this code block. For example, if you start writing Python code, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context, but not in a python code context. If you want to replace code, use the deleteCodeRange tool BEFORE YOU USE THIS TOOL.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 * @param {integer} [insertAtLine] Optional line number (1-indexed) to insert at. If omitted, appends to the end.
 * @return {string} A string containing the current code in the code block before modification.
 */
export function startUpdatingCode({ sectionId, insertAtLine }) {
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
  useAIStore.setState({
    streamTarget: sectionId,
    streamBeforeLines: beforeLines,
    streamAfterLines: afterLines,
    streamedContent: "", // Initialize empty stream content
  });

  return currCode;
}

/**
 * Stop streaming text into the code block.
 * @SETTA_MCP_TOOL
 * @returns {string} the code with all the changes applied.
 */
export function finishUpdatingCode() {
  const { streamTarget } = useAIStore.getState();
  const code = getSectionVariant(streamTarget).code;

  // Clear all streaming state
  useAIStore.setState({
    streamTarget: null,
    streamBeforeLines: "",
    streamAfterLines: "",
    streamedContent: "",
  });

  return code;
}

/**
 * Delete a range of code from a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block.
 * @param {integer} startLine Starting line number (1-indexed).
 * @param {integer} endLine Ending line number (1-indexed, inclusive).
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
