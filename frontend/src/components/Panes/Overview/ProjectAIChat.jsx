import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useMemo } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { useAI } from "state/hooks/aiHooks";
import { MODEL_GROUPS } from "utils/constants";
import { ProjectChatCore } from "./ProjectLevelAI/ProjectChatCore";
import { ProjectChatHistory } from "./ProjectLevelAI/ProjectChatHistory";

export function ProjectAIChat() {
  const {
    messages,
    chatSessions,
    sessionId,
    isLoading,
    viewHistory,
    userSelectedLLM,
    apiKeys,
    setViewHistory,
    setUserSelectedLLM,
    createNewChat,
    submitMessage,
    switchToChat,
    updateChatSession,
  } = useAI();

  // Initialize a new chat if none exists
  useEffect(() => {
    if (!sessionId) createNewChat();
  }, [sessionId, createNewChat]);

  // Save chat when the component unmounts or before page refresh
  useEffect(() => {
    const saveCurrentChat = () => {
      if (sessionId && messages.length > 0) {
        updateChatSession(sessionId, messages);
      }
    };

    // Add event listener for beforeunload to save chat before page refresh
    window.addEventListener("beforeunload", saveCurrentChat);

    // Return cleanup function to save chat when component unmounts
    return () => {
      window.removeEventListener("beforeunload", saveCurrentChat);
      saveCurrentChat();
    };
  }, [sessionId, messages, updateChatSession]);

  // Memoize available providers
  const availableProviders = useMemo(
    () => apiKeys.map((key) => key.modelId),
    [apiKeys],
  );

  // Memoize filtered model groups
  const filteredModelGroups = useMemo(
    () =>
      MODEL_GROUPS.filter((group) =>
        availableProviders.some(
          (provider) =>
            group.group.toLowerCase().replace(/\s+/g, "-") ===
            provider.toLowerCase(),
        ),
      ),
    [availableProviders],
  );

  return (
    <div className="flex h-full min-h-0 flex-col @container">
      <nav className="flex min-h-16 flex-col gap-2 border-b border-setta-100 py-4 @[15rem]:flex-row @[15rem]:items-center dark:border-setta-800">
        <div className="flex gap-2">
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
            onClick={createNewChat}
            aria-label="New Chat"
          >
            <MdAdd size={15} />
            <span className="@[15rem]:hidden @sm:block">New</span>
          </button>
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
            onClick={() => setViewHistory(!viewHistory)}
            aria-label="View History"
          >
            {viewHistory ? (
              <>
                <IoMdArrowRoundBack />
                <span>Return to chat</span>
              </>
            ) : (
              <>
                <RiChatHistoryLine size={15} />
                <span className="@[15rem]:hidden @sm:block">History</span>
              </>
            )}
          </button>
        </div>

        {viewHistory ? null : (
          <IdNameCombobox
            allItems={filteredModelGroups}
            value={userSelectedLLM}
            small={false}
            onSelectedItemChange={setUserSelectedLLM}
            placeholder="Select an LLM model"
            outerDivClasses="ml-auto flex @[15rem]:max-w-64 justify-center"
          />
        )}
      </nav>

      {viewHistory ? (
        <ProjectChatHistory
          chatSessions={chatSessions}
          sessionId={sessionId}
          switchToChat={switchToChat}
        />
      ) : (
        <ProjectChatCore
          messages={messages}
          selectedModel={userSelectedLLM}
          placeholderText="Type a message..."
          handleSubmit={submitMessage}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
