import { useEffect } from "react";
import { FiTrash2 } from "react-icons/fi";
import {
  deleteLLMChat,
  getAllLLMChatMetadata,
  goToChat,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { shallow } from "zustand/shallow";

export function ProjectChatHistory() {
  const { allChatMetadata, waitingForResponse, currentChatId } = useAIStore(
    (x) => {
      const waitingForResponse = {};
      for (const c of x.allChatMetadata) {
        waitingForResponse[c.id] = Boolean(
          x.chatDetails[c.id]?.waitingForResponse ?? false,
        );
      }

      return {
        allChatMetadata: x.allChatMetadata,
        waitingForResponse,
        currentChatId: x.currentChatId,
      };
    },
    shallow,
  );

  useEffect(() => {
    getAllLLMChatMetadata();
  }, []);

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      <h3 className="mb-4 text-setta-600 dark:text-setta-400">Chat History</h3>
      {allChatMetadata.length === 0 ? (
        <p className="text-center text-xs text-setta-400">
          No chat history yet
        </p>
      ) : (
        allChatMetadata
          .sort((a, b) => b.lastUpdated - a.lastUpdated) // Sort by most recent
          .map((chat) => (
            <div
              key={chat.id}
              className={`group/historyitem flex cursor-pointer flex-row justify-between gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-white/50 hover:shadow-sm focus-visible:border-blue-500 hover:dark:bg-setta-800 ${
                chat.id === currentChatId ? "bg-blue-600 dark:bg-blue-700" : ""
              }`}
              onClick={() => goToChat(chat.id)}
            >
              <div className="flex flex-col gap-1">
                <h4
                  className={`truncate font-semibold text-setta-500 dark:text-setta-100 ${
                    chat.id === currentChatId
                      ? "text-white group-hover/historyitem:text-setta-500 dark:text-white dark:group-hover/historyitem:text-white"
                      : ""
                  }`}
                >
                  {chat.name}
                </h4>

                <p
                  className={`truncate text-xs text-setta-800 dark:text-setta-200 ${
                    chat.id === currentChatId
                      ? "text-setta-100 group-hover/historyitem:text-setta-800 dark:text-setta-100 dark:group-hover/historyitem:text-setta-100"
                      : ""
                  }`}
                >
                  {new Date(chat.lastUpdated).toLocaleString()}
                </p>
              </div>
              {waitingForResponse[chat.id] && (
                <i className="gg-spinner !scale-125 self-center justify-self-end text-blue-500/70" />
              )}
              <button
                className="cursor-pointer p-1  text-transparent transition-colors hover:!text-red-500 group-hover/historyitem:text-setta-300  group-hover:opacity-100 dark:hover:!text-red-600 group-hover/historyitem:dark:text-setta-600"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteLLMChat(chat.id);
                }}
              >
                <FiTrash2 />
              </button>
            </div>
          ))
      )}
    </div>
  );
}
