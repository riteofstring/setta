import { useMemo } from "react";
import {
  addMessageToChat,
  createNewChat,
  handleApiKeyChange,
  saveApiKeys,
  setUserSelectedLLM,
  setViewHistory,
  submitMessage,
  switchToChat,
  updateChatSession,
} from "state/actions/aiChat";
import { useAIStore } from "state/definitions";

/**
 * Custom hook that provides combined access to AI state and actions
 * This maintains the ergonomic destructuring pattern while keeping
 * the underlying code separated for better maintainability
 */
export function useAI() {
  // Get the current state
  const {
    apiKeys,
    messages,
    chatSessions,
    sessionId,
    isLoading,
    viewHistory,
    userSelectedLLM,
    saveStatus,
    isSaving,
  } = useAIStore();

  // Create a stable reference to the combined state and actions
  const aiInterface = useMemo(
    () => ({
      // State
      apiKeys,
      messages,
      chatSessions,
      sessionId,
      isLoading,
      viewHistory,
      userSelectedLLM,
      saveStatus,
      isSaving,

      // Actions
      setViewHistory,
      setUserSelectedLLM,
      updateChatSession,
      createNewChat,
      switchToChat,
      addMessageToChat,
      submitMessage,
      saveApiKeys,
      handleApiKeyChange,
    }),
    [
      apiKeys,
      messages,
      chatSessions,
      sessionId,
      isLoading,
      viewHistory,
      userSelectedLLM,
      saveStatus,
      isSaving,
    ],
  );

  return aiInterface;
}
