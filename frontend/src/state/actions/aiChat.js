import { dbGetLLMResponse, dbSetApiKeys } from "requests/ai";
import { useAIStore, useSectionInfos } from "state/definitions";
import { getSectionVariant } from "./sectionInfos";

export function setViewHistory(viewHistory) {
  useAIStore.setState({ viewHistory });
}

export function setUserSelectedLLM(model) {
  useAIStore.setState({ userSelectedLLM: model });
}

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

  // Add empty assistant message that will be updated
  addMessageToChat(assistantMsg);

  // Track current content block being built
  let currentBlockType = null;
  let currentBlockIndex = null;
  let currentJsonContent = "";
  let currentToolName = "";

  try {
    const response = await dbGetLLMResponse(
      userSelectedLLM,
      userMessage,
      sessionId,
    );

    // Get the reader from the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode and parse the chunk
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Get current state
          const currentState = useAIStore.getState();
          const currentMessages = currentState.messages;

          // Find the message we're updating
          const messageIndex = currentMessages.findIndex(
            (m) => m.id === assistantMsgId,
          );
          if (messageIndex === -1) continue;

          const updatedMessages = [...currentMessages];
          const currentMsg = { ...updatedMessages[messageIndex] };

          // Handle different chunk types
          switch (parsed.type) {
            case "block_start":
              // Track new content block start
              currentBlockType = parsed.block_type;
              currentBlockIndex = parsed.index;

              // If it's a tool_use block, prepare for JSON building
              if (currentBlockType === "tool_use") {
                currentJsonContent = "";

                // Use the tool_name from the event if available
                if (parsed.tool_name) {
                  currentToolName = parsed.tool_name;
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
              if (parsed.is_delta) {
                const { streamTarget } = useAIStore.getState();
                if (streamTarget) {
                  streamInto(streamTarget, parsed.content);
                  break;
                }

                // For text deltas, either add to existing content or create a new text chunk
                if (
                  currentMsg.streamSequence.length > 0 &&
                  currentMsg.streamSequence[
                    currentMsg.streamSequence.length - 1
                  ].type === "text"
                ) {
                  // Add to existing text chunk
                  const lastItem =
                    currentMsg.streamSequence[
                      currentMsg.streamSequence.length - 1
                    ];
                  lastItem.content += parsed.content;
                } else {
                  // Create a new text chunk
                  currentMsg.streamSequence.push({
                    type: "text",
                    content: parsed.content,
                  });
                }

                // Also update the main content for backward compatibility
                currentMsg.content += parsed.content;
              }
              break;

            case "json":
              if (parsed.is_delta && currentBlockType === "tool_use") {
                // Build up JSON content for the tool call
                currentJsonContent += parsed.content;

                // Find or update the tool call in the sequence
                let toolCallIndex = currentMsg.streamSequence.findIndex(
                  (item) =>
                    item.type === "tool_call" && item.streaming === true,
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

            case "block_end":
              // Finalize a content block
              if (
                currentBlockType === "tool_use" &&
                parsed.index === currentBlockIndex
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
                        currentMsg.streamSequence[toolCallIndex].streaming =
                          false;
                      }
                    }
                  } else {
                    // For empty JSON, just mark any streaming tool call as complete
                    let toolCallIndex = currentMsg.streamSequence.findIndex(
                      (item) =>
                        item.type === "tool_call" && item.streaming === true,
                    );

                    if (toolCallIndex !== -1) {
                      currentMsg.streamSequence[toolCallIndex].streaming =
                        false;
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
                content: parsed.content,
              });
              break;
          }

          updatedMessages[messageIndex] = currentMsg;
          useAIStore.setState({ messages: updatedMessages });

          // Also update the chat session
          updateChatSession(sessionId, updatedMessages);
        } catch (e) {
          console.error("Error parsing streaming chunk:", e, line);
        }
      }
    }
  } catch (error) {
    // Error handling
    const errorMsg = {
      role: "assistant",
      content: `Sorry, there was a problem with the API: ${error.message || "Unknown error"}.`,
    };
    addMessageToChat(errorMsg);
  } finally {
    useAIStore.setState({ isLoading: false });
  }
}

export function setApiKeys(keys) {
  useAIStore.setState({ apiKeys: keys });
}

export async function saveApiKeys(keys) {
  const { isSaving } = useAIStore.getState();

  // Guard: Already saving
  if (isSaving) return;

  useAIStore.setState({ isSaving: true, saveStatus: "Saving..." });

  try {
    await dbSetApiKeys(keys);
    useAIStore.setState({ saveStatus: "Saved!" });
  } catch (error) {
    console.error("Failed to update API keys on the server:", error);
    useAIStore.setState({ saveStatus: "Error saving" });
  } finally {
    useAIStore.setState({ isSaving: false });

    // Clear status after delay
    setTimeout(() => useAIStore.setState({ saveStatus: "" }), 3000);
  }
}

export async function handleApiKeyChange(modelId, providerName, value) {
  const { apiKeys } = useAIStore.getState();

  // Guard: Empty value - remove the key
  if (!value || value.trim() === "") {
    const filteredKeys = apiKeys.filter((key) => key.modelId !== modelId);
    useAIStore.setState({ apiKeys: filteredKeys });
    await saveApiKeys(filteredKeys);
    return;
  }

  // Find or create key
  const existingIndex = apiKeys.findIndex((key) => key.modelId === modelId);
  let updatedKeys;

  if (existingIndex >= 0) {
    // Update existing
    updatedKeys = [...apiKeys];
    updatedKeys[existingIndex] = {
      ...updatedKeys[existingIndex],
      apiKey: value,
    };
  } else {
    // Add new
    updatedKeys = [...apiKeys, { modelId, providerName, apiKey: value }];
  }

  useAIStore.setState({ apiKeys: updatedKeys });
  await saveApiKeys(updatedKeys);
}

function streamInto(streamTarget, content) {
  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(streamTarget, x);
    // Append the new chunk to existing code
    sectionVariant.code += content;
  });
}

/**
 * Start streaming text into a specific code block. You can think of a code block like a source code file. After you call this tool, everything you respond with will be redirected and written to this code block. For example, if you start writing Python code, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context, but not in a python code context.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 */
export function startStreamingInto({ sectionId }) {
  useAIStore.setState({ streamTarget: sectionId });
}

/**
 * Stop streaming text into a specific code block. Once you want to start responding in the regular chat area, call this. After you call this tool, everything you respond with will be sent to the regular chat area.
 * @SETTA_MCP_TOOL
 */
export function stopStreamingInto() {
  useAIStore.setState({ streamTarget: null });
}
