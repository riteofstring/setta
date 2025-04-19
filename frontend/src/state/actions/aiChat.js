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

export async function submitMessage(userMessage) {
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
    dbGetLLMResponse(userSelectedLLM, userMessage, sessionId);
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
  const startIdx = useAIStore.getState().streamTargetStartIdx;
  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(streamTarget, x);

    // Fast path for appending (most common case in streaming)
    if (startIdx === -1 || startIdx === sectionVariant.code.length) {
      sectionVariant.code += content;
    } else {
      // Only use substring when inserting in the middle
      sectionVariant.code =
        sectionVariant.code.substring(0, startIdx) +
        content +
        sectionVariant.code.substring(startIdx);
    }

    // Update startIdx if needed
    if (startIdx !== -1) {
      useAIStore.setState({
        streamTargetStartIdx: startIdx + content.length,
      });
    }
  });
}

/**
 * Start streaming text into a specific code block. You can think of a code block like a source code file. After you call this tool, everything you respond with will be redirected and written to this code block. For example, if you start writing Python code, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context, but not in a python code context.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 * @param {boolean} clearExisting If true, then all the existing code in the code block will be deleted.
 * @param {integer} startIdx The index at which new code will appear. If -1, then new code will be appended to the end of existing code. Use this when you want to edit existing code, and not just append to it.
 * @return {str} a string containing the code in the code block. If clearExisting is true, then this will be an empty string.
 */
export function startStreamingInto({ sectionId, clearExisting, startIdx }) {
  if (clearExisting) {
    useSectionInfos.setState((x) => {
      const sectionVariant = getSectionVariant(sectionId, x);
      // Append the new chunk to existing code
      sectionVariant.code = "";
    });
  }

  const currCode = getCurrentCode({ sectionId });
  useAIStore.setState({
    streamTarget: sectionId,
    streamTargetStartIdx: startIdx,
  });
  return currCode;
}

/**
 * Stop streaming text into a specific code block. Once you want to start responding in the regular chat area, call this. After you call this tool, everything you respond with will be sent to the regular chat area.
 * @SETTA_MCP_TOOL
 */
export function stopStreamingInto() {
  useAIStore.setState({ streamTarget: null, streamTargetStartIdx: -1 });
}

/**
 * Get the current code that's in a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 * @return {str} a string containing the code in the code block.
 */
export function getCurrentCode({ sectionId }) {
  return getSectionVariant(sectionId).code;
}
