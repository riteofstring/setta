import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import C from "constants/constants.json";
import { useEffect, useMemo, useState } from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import {
  createNewChat,
  submitMessage,
  switchToChat,
} from "state/actions/aiChat";
import { updateLLMApiKeyInfo } from "state/actions/fileUpdates";
import { useAIStore } from "state/definitions";
import { MODEL_GROUPS } from "utils/constants";
import { ProjectChatCore } from "./ProjectLevelAI/ProjectChatCore";
import { ProjectChatHistory } from "./ProjectLevelAI/ProjectChatHistory";

export function ProjectAIChat() {
  const {
    apiKeys,
    apiKeysInitialLoadComplete,
    chatSessions,
    sessionId,
    isLoading,
    viewHistory,
    userSelectedLLM,
  } = useAIStore();

  useEffect(() => {
    updateLLMApiKeyInfo(useAIStore.getState().apiKeysFilepath);
  }, []);

  const [deepThink, setDeepThink] = useState(false);

  // Initialize a new chat if none exists
  useEffect(() => {
    if (!sessionId) createNewChat();
  }, [sessionId]);

  // Memoize filtered model groups
  const filteredModelGroups = useMemo(
    () =>
      MODEL_GROUPS.filter(
        (group) => C.LLM_API_KEY_NAMES[group.group] in apiKeys,
      ),
    [apiKeys],
  );

  return (
    apiKeysInitialLoadComplete && (
      <div className="flex h-full min-h-0 flex-col @container">
        <nav className="flex flex-col gap-2 border-b border-setta-100 pb-8 pt-2 @[17.5rem]:flex-row @[17.5rem]:items-center @[17.5rem]:pb-2 dark:border-setta-800">
          <div className="flex gap-2">
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={createNewChat}
              aria-label="New Chat"
            >
              <MdAdd size={15} />
              <span className="@[17.5rem]:hidden @sm:block">New</span>
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => useAIStore.setState({ viewHistory: !viewHistory })}
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
                  <span className="@[17.5rem]:hidden @sm:block">History</span>
                </>
              )}
            </button>
          </div>

          {viewHistory ? null : (
            <div className="ml-auto flex  w-full items-center justify-end gap-2">
              <button
                className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold ${deepThink ? "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500" : "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white"} transition-colors  focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent  active:dark:text-setta-300`}
                aria-label="Extended Thinking"
                onClick={() => {
                  setDeepThink(!deepThink);
                }}
              >
                <BiSolidBrain size={15} />
                <span className="hidden @[33.5rem]:block">Deep Thinking</span>
              </button>

              <IdNameCombobox
                allItems={filteredModelGroups}
                value={userSelectedLLM}
                small={false}
                onSelectedItemChange={(model) =>
                  useAIStore.setState({ userSelectedLLM: model })
                }
                placeholder="Select an LLM model"
                outerDivClasses="@[17.5rem]:max-w-64 justify-center"
              />
            </div>
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
            chatSessions={chatSessions}
            sessionId={sessionId}
            placeholderText="Type a message..."
            handleSubmit={(m) => submitMessage(m, deepThink)}
            isLoading={isLoading}
          />
        )}
      </div>
    )
  );
}
