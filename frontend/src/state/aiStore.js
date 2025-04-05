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

        try {
          const response = await dbGetLLMResponse(
            userSelectedLLM,
            userMessage,
            sessionId,
          );

          // Response handling with guard clause
          if (!response.data?.content) {
            const errorMsg = {
              role: "assistant",
              content: "Sorry, I couldn't process your request properly.",
            };
            addMessageToChat(errorMsg, sessionId || response.data?.session_id);
            return;
          }

          // Success case
          const aiMsg = { role: "assistant", content: response.data.content };
          addMessageToChat(aiMsg, sessionId || response.data.session_id);
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
      }),
    },
  ),
);
