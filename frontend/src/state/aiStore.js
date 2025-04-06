import { dbGetLLMResponse, dbSetApiKeys } from "requests/ai";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAIStore = create(
  persist(
    (set, get) => ({
      // State
      messages: [],
      chatSessions: [],
      sessionId: null,
      isLoading: false,
      viewHistory: false,
      apiKeys: [],
      userSelectedLLM: "",
      saveStatus: "",
      isSaving: false,

      // Simple actions
      setViewHistory: (viewHistory) => set({ viewHistory }),
      setUserSelectedLLM: (model) => set({ userSelectedLLM: model }),

      // Chat session management
      updateChatSession: (id, newMessages) => {
        if (!id) return;

        const { chatSessions } = get();
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
          set({ chatSessions: [...chatSessions, sessionUpdate] });
          return;
        }

        // Update existing session
        const updatedSessions = [...chatSessions];
        updatedSessions[existingIndex] = sessionUpdate;
        set({ chatSessions: updatedSessions });
      },

      createNewChat: () => {
        const { messages, sessionId, updateChatSession } = get();

        // Save current chat only if it has content
        if (sessionId && messages.length > 0) {
          updateChatSession(sessionId, messages);
        }

        // Simple clean creation of new session
        const newSessionId = `session_${Date.now()}`;
        set({
          sessionId: newSessionId,
          messages: [],
          viewHistory: false,
        });
      },

      switchToChat: (id) => {
        const { sessionId, messages, updateChatSession, chatSessions } = get();

        // Guard clause: already on this chat
        if (id === sessionId) {
          set({ viewHistory: false });
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
        set({
          sessionId: id,
          messages: selectedChat.messages,
          viewHistory: false,
        });
      },

      // Helper for consistent message handling
      addMessageToChat: (message, useSessionId = null) => {
        const { messages, updateChatSession, sessionId } = get();
        const newMessages = [...messages, message];

        set({ messages: newMessages });
        updateChatSession(useSessionId || sessionId, newMessages);

        return newMessages;
      },

      submitMessage: async (userMessage) => {
        // Guard clause: empty message
        if (!userMessage.trim()) return;

        const { messages, sessionId, userSelectedLLM, addMessageToChat } =
          get();

        set({ isLoading: true });

        // Add user message immediately for responsive UI
        const userMsg = { role: "user", content: userMessage };
        const updatedMessages = [...messages, userMsg];
        set({ messages: updatedMessages });

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
            const lines = chunk
              .split("\n")
              .filter((line) => line.trim() !== "");

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);

                // Get current state
                const { messages } = get();

                // Find the message we're updating
                const messageIndex = messages.findIndex(
                  (m) => m.id === assistantMsgId,
                );
                if (messageIndex === -1) continue;

                const updatedMessages = [...messages];
                const currentMsg = { ...updatedMessages[messageIndex] };

                // Handle different chunk types and add to the sequence in order
                switch (parsed.type) {
                  case "text":
                    if (parsed.is_delta) {
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
                  case "tool_call":
                    // Add tool call to the sequence
                    currentMsg.streamSequence.push({
                      type: "tool_call",
                      name: parsed.name,
                      args: parsed.args,
                    });
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
                set({ messages: updatedMessages });

                // Also update the chat session
                const { updateChatSession } = get();
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
          set({ isLoading: false });
        }
      },

      // API key management
      setApiKeys: (keys) => set({ apiKeys: keys }),

      // Helper to save API keys to server
      saveApiKeys: async (keys) => {
        const { isSaving } = get();

        // Guard: Already saving
        if (isSaving) return;

        set({ isSaving: true, saveStatus: "Saving..." });

        try {
          await dbSetApiKeys(keys);
          set({ saveStatus: "Saved!" });
        } catch (error) {
          console.error("Failed to update API keys on the server:", error);
          set({ saveStatus: "Error saving" });
        } finally {
          set({ isSaving: false });

          // Clear status after delay
          setTimeout(() => set({ saveStatus: "" }), 3000);
        }
      },

      handleApiKeyChange: async (modelId, providerName, value) => {
        const { apiKeys, saveApiKeys } = get();

        // Guard: Empty value - remove the key
        if (!value || value.trim() === "") {
          const filteredKeys = apiKeys.filter((key) => key.modelId !== modelId);
          set({ apiKeys: filteredKeys });
          await saveApiKeys(filteredKeys);
          return;
        }

        // Find or create key
        const existingIndex = apiKeys.findIndex(
          (key) => key.modelId === modelId,
        );
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

        set({ apiKeys: updatedKeys });
        await saveApiKeys(updatedKeys);
      },
    }),
    {
      name: "ai-storage",
      partialize: (state) => ({
        apiKeys: state.apiKeys,
        userSelectedLLM: state.userSelectedLLM,
        chatSessions: state.chatSessions,
        sessionId: state.sessionId,
        messages: state.messages,
      }),
    },
  ),
);
